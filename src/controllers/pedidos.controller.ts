import { Response, NextFunction } from "express";
import mongoose, { HydratedDocument } from "mongoose";
import { PedidoModel, PedidoItem, IPedido } from "../models/pedido.model";
import { UserModel } from "../models/user.model";
import { nextSeq, formatDoc } from "../models/counter.model";
import { sendMail, pedidoNuevoEmail } from "../services/email.service";
import { validarDisponibilidad } from "../services/stock.service";
import { uploadComprobante, esUrlCloudinaryPropia, firmaSubidaDirecta } from "../services/cloudinary.service";
import { AuthRequest } from "../types/AuthRequest";
import { validarSoloContado } from "../services/reglasProducto.service";
import { validarBodegaVendedor } from "../services/asignacionInventario.service";
import { validarCupos } from "../services/cupos.service";
import { bodegaDeUsuario, filtroPorBodega } from "../services/bodegaUsuario.service";
import { conCandadoAsesor, CandadoOcupadoError } from "../services/candadoAsesor.service";

/** Correos de todos los administradores (para avisos de aprobación). */
async function adminEmails(): Promise<string[]> {
  const admins = await UserModel.find({ role: "admin" }).select("email");
  return admins.map((a) => a.email);
}

/** Para buscar "Velez" y encontrar "Vélez" (y al revés). */
const TILDES: Record<string, string> = { a: "[aáà]", e: "[eéè]", i: "[iíì]", o: "[oóò]", u: "[uúüù]", n: "[nñ]" };
const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Código ERP vigente del vendedor (el de la BD; si no está, el del token). */
async function venCodigoActual(req: AuthRequest): Promise<string | undefined> {
  if (req.user?.role !== "vendedor") return req.user?.venCodigo;
  const u = mongoose.isValidObjectId(req.user.id) ? await UserModel.findById(req.user.id).select("venCodigo").lean() : null;
  return (u?.venCodigo || req.user.venCodigo || "").trim() || undefined;
}

export const PedidosController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // Vendedor: solo los suyos. Bodega con bodega asignada (p.ej. Quito):
      // solo los pedidos con productos de su bodega.
      const filtro: Record<string, unknown> =
        req.user?.role === "vendedor"
          ? { vendedorId: req.user.id }
          : filtroPorBodega(await bodegaDeUsuario(req.user));
      // ?q= busca en todo el historial (no solo los últimos 200): cliente, OP o asesor.
      const q = String(req.query.q || "").trim().slice(0, 80);
      if (q.length >= 2) {
        const re = new RegExp(sinTildes(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[aeioun]/g, (v) => TILDES[v]), "i");
        // El pedido guarda el correo del asesor: por su nombre se busca en usuarios.
        const asesores = await UserModel.find({ name: re }).select("_id").lean();
        filtro.$or = [
          { clienteNombre: re },
          { numero: re },
          { clienteCodigo: re },
          { vendedorNombre: re },
          ...(asesores.length ? [{ vendedorId: { $in: asesores.map((u) => String(u._id)) } }] : []),
        ];
      }
      const pedidos = await PedidoModel.find(filtro).sort({ createdAt: -1 }).limit(q.length >= 2 ? 300 : 200);
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

      // El vendedor solo vende del stock de su bodega asignada.
      const errorBodega = await validarBodegaVendedor(parsed, req.user);
      if (errorBodega) {
        res.status(400).json({ success: false, message: errorBodega });
        return;
      }

      // Productos marcados "solo contado" no pueden ir en un pedido a crédito.
      const errorContado = await validarSoloContado(parsed, plazo);
      if (errorContado) {
        res.status(400).json({ success: false, message: errorContado });
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

      // El código del asesor se lee de la BD: el token (8 h) puede traer uno viejo
      // si el admin se lo cambió, y entonces el cupo no le aplicaría.
      const venCodigo = await venCodigoActual(req);

      // Cupo, stock y creación con el candado del asesor: dos pedidos suyos al
      // mismo tiempo no se validan contra el mismo cupo.
      let resultado: { error: string } | { pedido: HydratedDocument<IPedido> };
      try {
        resultado = await conCandadoAsesor(venCodigo, async () => {
          // Productos con cupo por asesor (p.ej. un contenedor repartido entre asesores).
          const errorCupo = await validarCupos(parsed, venCodigo);
          if (errorCupo) return { error: errorCupo };

          // Reserva al enviar: bloquear si supera el disponible (stock ERP - reservas).
          const errorStock = await validarDisponibilidad(parsed);
          if (errorStock) return { error: `Sin stock disponible. ${errorStock}` };

          const numero = formatDoc("OP", await nextSeq("pedido"));
          const pedido = await PedidoModel.create({
            numero,
            vendedorId: req.user!.id,
            vendedorNombre: req.user!.email,
            venCodigo,
            clienteNombre,
            clienteCodigo,
            items: parsed,
            total,
            plazoCreditoDias: plazo,
            fotoUrl: listaFotos[0],
            fotos: listaFotos.length ? listaFotos : undefined,
            observacion,
          });
          return { pedido };
        });
      } catch (e) {
        if (e instanceof CandadoOcupadoError) {
          res.status(409).json({ success: false, message: e.message });
          return;
        }
        throw e;
      }
      if ("error" in resultado) {
        res.status(409).json({ success: false, message: resultado.error });
        return;
      }
      const { pedido } = resultado;
      const numero = pedido.numero;

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
};
