import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { PedidoModel, PedidoItem } from "../models/pedido.model";
import { UserModel } from "../models/user.model";
import { nextSeq, formatDoc } from "../models/counter.model";
import { sendMail, pedidoNuevoEmail, pedidoEstadoEmail } from "../services/email.service";
import { validarDisponibilidad } from "../services/stock.service";
import { uploadComprobante, esUrlCloudinaryPropia, firmaSubidaDirecta } from "../services/cloudinary.service";
import { AuthRequest } from "../types/AuthRequest";
import { validarSoloContado } from "../services/reglasProducto.service";

/** Correos de todos los administradores (para avisos de aprobación). */
async function adminEmails(): Promise<string[]> {
  const admins = await UserModel.find({ role: "admin" }).select("email");
  return admins.map((a) => a.email);
}

export const PedidosController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filtro =
        req.user?.role === "vendedor" ? { vendedorId: req.user.id } : {};
      const pedidos = await PedidoModel.find(filtro).sort({ createdAt: -1 }).limit(200);
      res.json({ success: true, data: pedidos });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Crea una orden de pedido. El vendedor SIEMPRE puede enviarla; queda
   * "enviado" para que administración la apruebe o rechace. No factura.
   */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { clienteNombre, clienteCodigo, items, observacion, foto, fotoUrl, fotos, plazoCreditoDias } = req.body || {};

      if (!clienteNombre) {
        res.status(400).json({ success: false, message: "El cliente es requerido" });
        return;
      }
      // El plazo de crédito es obligatorio: sin él administración no puede
      // programar el cobro. 0 = contado.
      const plazo = Number(plazoCreditoDias);
      if (plazoCreditoDias === undefined || plazoCreditoDias === null || plazoCreditoDias === "" || !Number.isInteger(plazo) || plazo < 0 || plazo > 365) {
        res.status(400).json({ success: false, message: "Indica el plazo de crédito del pedido (contado o días)" });
        return;
      }
      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, message: "Selecciona al menos un producto del inventario" });
        return;
      }

      const parsed: PedidoItem[] = [];
      for (const it of items) {
        const cantidad = Number(it.cantidad);
        const precioUnitario = Number(it.precioUnitario);
        if (!it.productoCodigo || !it.productoNombre) {
          res.status(400).json({ success: false, message: "Producto inválido en el pedido" });
          return;
        }
        if (!(cantidad > 0)) {
          res.status(400).json({ success: false, message: `Cantidad inválida para ${it.productoNombre}` });
          return;
        }
        if (!(precioUnitario > 0)) {
          res.status(400).json({ success: false, message: `Indica el precio de ${it.productoNombre}` });
          return;
        }
        parsed.push({
          productoCodigo: String(it.productoCodigo),
          productoNombre: String(it.productoNombre),
          unidad: it.unidad,
          bodega: it.bodega,
          cantidad,
          precioUnitario,
          subtotal: Math.round(cantidad * precioUnitario * 100) / 100,
        });
      }

      // Productos marcados "solo contado" no pueden ir en un pedido a crédito.
      const errorContado = await validarSoloContado(parsed, plazo);
      if (errorContado) {
        res.status(400).json({ success: false, message: errorContado });
        return;
      }

      // Reserva al enviar: bloquear si supera el disponible (stock ERP - reservas).
      const errorStock = await validarDisponibilidad(parsed);
      if (errorStock) {
        res.status(409).json({ success: false, message: `Sin stock disponible. ${errorStock}` });
        return;
      }

      const total = Math.round(parsed.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

      // Foto de la orden de pedido (OP): la app la sube directo a Cloudinary y
      // manda la URL. El data URI se mantiene para celulares con la versión anterior.
      // Puede tener varias fotos (hojas, anotaciones, restricciones del cliente).
      const listaFotos: string[] = Array.isArray(fotos)
        ? fotos.map(String).slice(0, 10)
        : fotoUrl ? [String(fotoUrl)] : [];
      if (listaFotos.some((u) => !esUrlCloudinaryPropia(u))) {
        res.status(400).json({ success: false, message: "Foto de la orden de pedido con enlace no permitido" });
        return;
      }
      if (!listaFotos.length && foto) listaFotos.push(await uploadComprobante(foto, "tapia-pedidos"));

      const numero = formatDoc("OP", await nextSeq("pedido"));
      const pedido = await PedidoModel.create({
        numero,
        vendedorId: req.user!.id,
        vendedorNombre: req.user!.email,
        venCodigo: req.user!.venCodigo,
        clienteNombre,
        clienteCodigo,
        items: parsed,
        total,
        plazoCreditoDias: plazo,
        fotoUrl: listaFotos[0],
        fotos: listaFotos.length ? listaFotos : undefined,
        observacion,
      });

      res.status(201).json({ success: true, data: pedido });

      // Aviso a administración (no bloquea la respuesta).
      const mail = pedidoNuevoEmail({
        numero,
        clienteNombre,
        vendedor: req.user!.email,
        total,
        nItems: parsed.length,
        plazoCreditoDias: plazo,
      });
      adminEmails()
        .then((emails) => Promise.all(emails.map((to) => sendMail({ to, ...mail }))))
        .catch(() => {});
    } catch (error) {
      next(error);
    }
  },

  /** Agregar, cambiar o quitar fotos de la OP de un pedido ya enviado (su vendedor o un admin). */
  async updateFotos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { fotos } = req.body || {};
      if (!Array.isArray(fotos) || fotos.length > 10) {
        res.status(400).json({ success: false, message: "Envía hasta 10 fotos de la orden de pedido" });
        return;
      }
      const lista = fotos.map(String);
      if (lista.some((u) => !esUrlCloudinaryPropia(u))) {
        res.status(400).json({ success: false, message: "Foto de la orden de pedido con enlace no permitido" });
        return;
      }
      const id = String(req.params.id);
      const pedido = mongoose.isValidObjectId(id) ? await PedidoModel.findById(id) : null;
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      if (req.user?.role !== "admin" && pedido.vendedorId !== req.user?.id) {
        res.status(403).json({ success: false, message: "Solo el vendedor del pedido o un administrador puede cambiar sus fotos" });
        return;
      }
      pedido.fotos = lista;
      pedido.fotoUrl = lista.length ? lista[0] : undefined;
      await pedido.save();
      res.json({ success: true, data: pedido });
    } catch (error) {
      next(error);
    }
  },

  /** Firma para subir la foto de la orden de pedido directo a Cloudinary desde el celular. */
  async firmaSubida(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const firma = firmaSubidaDirecta("tapia-pedidos");
      if (!firma) {
        res.status(503).json({ success: false, message: "La subida de fotos no está configurada (Cloudinary)" });
        return;
      }
      res.json({ success: true, data: firma });
    } catch (error) {
      next(error);
    }
  },

  /** Admin aprueba o rechaza el pedido (con motivo opcional). */
  async updateEstado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { estado, motivoRechazo } = req.body || {};
      if (!["aprobado", "rechazado", "enviado"].includes(estado)) {
        res.status(400).json({ success: false, message: "Estado inválido" });
        return;
      }
      // Un pedido que ya salió de bodega no cambia de estado.
      const actual = mongoose.isValidObjectId(String(req.params.id))
        ? await PedidoModel.findById(req.params.id).select("despacho")
        : null;
      if (actual?.despacho?.salidaAt) {
        res.status(409).json({ success: false, message: "El pedido ya salió de bodega: no se puede cambiar su estado" });
        return;
      }
      const pedido = await PedidoModel.findByIdAndUpdate(
        req.params.id,
        { estado, ...(motivoRechazo ? { motivoRechazo } : {}) },
        { new: true }
      );
      if (!pedido) {
        res.status(404).json({ success: false, message: "Pedido no encontrado" });
        return;
      }
      res.json({ success: true, data: pedido });

      // Aviso al vendedor con el resultado (no bloquea la respuesta).
      if (estado === "aprobado" || estado === "rechazado") {
        UserModel.findById(pedido.vendedorId)
          .then((u) => {
            if (!u) return;
            const mail = pedidoEstadoEmail({
              numero: pedido.numero,
              clienteNombre: pedido.clienteNombre,
              total: pedido.total,
              estado,
              motivoRechazo: pedido.motivoRechazo,
            });
            return sendMail({ to: u.email, ...mail });
          })
          .catch(() => {});
      }
    } catch (error) {
      next(error);
    }
  },
};
