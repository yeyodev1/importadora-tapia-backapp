import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel, EstadoPedido, ESTADOS_PEDIDO } from "../models/pedido.model";
import { UserModel } from "../models/user.model";
import { sendMail, pedidoEstadoEmail } from "../services/email.service";
import { AuthRequest } from "../types/AuthRequest";
import { excesoCupo, ESTADOS_CON_CUPO } from "../services/cupos.service";
import { validarDisponibilidad, stockAlAprobar } from "../services/stock.service";
import { accesoDeUsuario, pedidoEsDeBodega } from "../services/bodegaUsuario.service";

/** Nombre de quien hace el cambio para el historial (si no se encuentra, su correo). */
async function nombreAdmin(req: AuthRequest): Promise<string> {
  const u = req.user?.id && mongoose.isValidObjectId(req.user.id)
    ? await UserModel.findById(req.user.id).select("name").lean()
    : null;
  return u?.name || req.user!.email;
}

export const PedidosEstadoController = {
  /**
   * Admin aprueba, rechaza o deja en espera el pedido, con un comentario:
   *  - aprobado  → comentarioAprobacion (opcional, p.ej. "Transferencia OK").
   *  - rechazado → motivoRechazo (opcional).
   *  - en_espera → motivoEspera (OBLIGATORIO: es el mensaje para el asesor).
   * Cada cambio queda en historialEstado y se avisa al vendedor por correo.
   */
  async updateEstado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { estado, comentario, motivoRechazo } = req.body || {};
      // Anular tiene su propia ruta (POST /:id/anular), con motivo y aviso.
      if (!ESTADOS_PEDIDO.includes(estado) || estado === "anulado" || estado === "rechazado_cliente") {
        res.status(400).json({ success: false, message: "Estado inválido" });
        return;
      }
      // `motivoRechazo` se acepta por compatibilidad con la versión anterior de la app.
      const nota = String(comentario ?? motivoRechazo ?? "").trim().slice(0, 500);
      if (estado === "en_espera" && !nota) {
        res.status(400).json({ success: false, message: "Escribe el mensaje para el asesor" });
        return;
      }

      // Un pedido que ya salió de bodega no cambia de estado.
      const id = String(req.params.id);
      const actual = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id).select("despacho estado items venCodigo createdAt") : null;
      if (!actual) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      if (actual.estado === "anulado") {
        res.status(409).json({ success: false, message: "El pedido fue anulado: no se puede cambiar su estado" });
        return;
      }
      if (actual.estado === "rechazado_cliente") {
        res.status(409).json({ success: false, message: "El cliente rechazó este pedido: no se puede cambiar su estado" });
        return;
      }
      if (actual.despacho?.salidaAt) {
        res.status(409).json({ success: false, message: "El pedido ya salió de bodega: no se puede cambiar su estado" });
        return;
      }

      const nuevo = estado as EstadoPedido;

      // Un pedido no aprobado ya devolvió su cupo: si se vuelve a activar
      // (aprobar o poner en espera), tiene que caber de nuevo en el cupo del asesor.
      if (!ESTADOS_CON_CUPO.includes(actual.estado) && ESTADOS_CON_CUPO.includes(nuevo)) {
        const e = await excesoCupo(actual.items, actual.venCodigo, actual.createdAt);
        if (e) {
          res.status(409).json({
            success: false,
            message: `No se puede reactivar: el asesor se pasa del cupo de ${e.producto}. Su cupo es ${e.cupo}, ya pidió ${e.usado} y le quedan ${e.queda}; este pedido trae ${e.pide}.`,
          });
          return;
        }
      }
      // Al aprobar (o reactivar) el pedido tiene que caber en el stock que no
      // reservan los demás pedidos sin facturar: si no, se vende dos veces lo mismo.
      if (actual.estado !== "aprobado" && (nuevo === "aprobado" || nuevo === "en_espera")) {
        const errorStock = await validarDisponibilidad(actual.items, id);
        if (errorStock) {
          res.status(409).json({
            success: false,
            message: `No alcanza el stock. ${errorStock} Si alguno de esos pedidos ya se facturó, márcalo como facturado.`,
          });
          return;
        }
      }

      const set: Record<string, unknown> = { estado: nuevo };
      const unset: Record<string, 1> = {};
      if (nuevo === "aprobado") {
        // Stock del ERP antes de facturar: así se sabe después si el ERP ya lo descontó.
        if (actual.estado !== "aprobado" || !actual.stockAlAprobar) set.stockAlAprobar = await stockAlAprobar(actual.items);
        if (nota) set.comentarioAprobacion = nota;
        else unset.comentarioAprobacion = 1;
      }
      if (nuevo === "rechazado" && nota) set.motivoRechazo = nota;
      if (nuevo === "en_espera") set.motivoEspera = nota;
      const cambio = { estado: nuevo, ...(nota ? { nota } : {}), por: await nombreAdmin(req), at: new Date() };
      const pedido = await PedidoModel.findByIdAndUpdate(
        id,
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}), $push: { historialEstado: cambio } },
        { new: true }
      );
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      res.json({ success: true, data: pedido });

      // Aviso al vendedor con el resultado (no bloquea la respuesta).
      if (nuevo === "aprobado" || nuevo === "rechazado" || nuevo === "en_espera") {
        UserModel.findById(pedido.vendedorId)
          .then((u) => {
            if (!u) return;
            const mail = pedidoEstadoEmail({
              numero: pedido.numero,
              clienteNombre: pedido.clienteNombre,
              total: pedido.total,
              estado: nuevo,
              motivoRechazo: pedido.motivoRechazo,
              comentario: nota || undefined,
            });
            return sendMail({ to: u.email, ...mail });
          })
          .catch(() => {});
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Quien factura marca (o desmarca) que el pedido aprobado ya está facturado
   * en el ERP. Desde ahí el ERP descuenta el stock y el pedido deja de reservar.
   * Lo hace administración o bodega (Josué factura); bodega con bodega
   * asignada solo en los pedidos de su bodega.
   * body: { facturado: boolean, numeroFactura? }
   */
  async setFacturado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const facturado = req.body?.facturado !== false;
      const numeroFactura = String(req.body?.numeroFactura ?? "").trim().slice(0, 40);
      const id = String(req.params.id);
      const pedido = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id) : null;
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      if (req.user?.role !== "admin") {
        const { bodega } = await accesoDeUsuario(req.user);
        if (!pedidoEsDeBodega(pedido.items, bodega)) {
          res.status(403).json({ success: false, message: "Este pedido no es de tu bodega" });
          return;
        }
      }
      if (pedido.estado !== "aprobado") {
        res.status(409).json({ success: false, message: "Solo un pedido aprobado se puede marcar como facturado" });
        return;
      }
      if (facturado) {
        pedido.set("facturacion", { at: new Date(), por: await nombreAdmin(req), ...(numeroFactura ? { numeroFactura } : {}) });
      } else {
        if (pedido.despacho?.salidaAt || pedido.entregas?.length) {
          res.status(409).json({ success: false, message: "El pedido ya salió de bodega: ya está facturado" });
          return;
        }
        // Vuelve a reservar aunque ya no alcance: es lo real (está aprobado y
        // sin facturar), y así no se aprueba otro pedido con ese mismo stock.
        pedido.set("facturacion", undefined);
        pedido.set("erpDescontado", undefined);
      }
      await pedido.save();
      res.json({ success: true, data: pedido });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Un pedido facturado (o que ya salió) sigue apartando lo que el ERP aún no
   * baja. Si el ERP ya lo descontó y la app no lo detecta (p.ej. llegó
   * mercadería el mismo día), administración o bodega lo confirma aquí.
   */
  async setErpDescontado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const pedido = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id) : null;
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      if (req.user?.role !== "admin") {
        const { bodega } = await accesoDeUsuario(req.user);
        if (!pedidoEsDeBodega(pedido.items, bodega)) {
          res.status(403).json({ success: false, message: "Este pedido no es de tu bodega" });
          return;
        }
      }
      if (pedido.estado !== "aprobado" || !(pedido.facturacion || pedido.despacho?.salidaAt || pedido.entregas?.length)) {
        res.status(409).json({ success: false, message: "Primero márcalo como facturado: el ERP descuenta al facturar" });
        return;
      }
      pedido.set("erpDescontado", { at: new Date(), por: await nombreAdmin(req) });
      await pedido.save();
      res.json({ success: true, data: pedido });
    } catch (error) {
      next(error);
    }
  },
};
