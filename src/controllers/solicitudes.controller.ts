import { Response, NextFunction } from "express";
import { SolicitudCreditoModel } from "../models/solicitudCredito.model";
import { UserModel } from "../models/user.model";
import { nextSeq, formatDoc } from "../models/counter.model";
import { AuthRequest } from "../types/AuthRequest";
import { limpiarSolicitud, faltantesParaEnviar } from "../services/solicitudes.service";
import { firmaSubidaDirecta } from "../services/cloudinary.service";
import { sendMail } from "../services/email.service";
import { solicitudNuevaEmail, solicitudEstadoEmail } from "../services/solicitudes.email";
import { cachedRead } from "../services/erpCache.service";
import { ErpService } from "../services/erp.service";

const esAdmin = (req: AuthRequest) => req.user?.role === "admin";
const nombreCliente = (s: any) =>
  s.clienteNombre || [s.titular?.nombres, s.titular?.apellidos].filter(Boolean).join(" ") || s.negocio?.nombre || "Cliente";

/** Busca la solicitud y comprueba que el vendedor sea su dueño. */
async function cargar(req: AuthRequest, res: Response) {
  const s = await SolicitudCreditoModel.findById(req.params.id);
  if (!s) {
    res.status(404).json({ success: false, message: "Solicitud no encontrada" });
    return null;
  }
  if (!esAdmin(req) && s.vendedorId !== req.user?.id) {
    res.status(403).json({ success: false, message: "No es tu solicitud" });
    return null;
  }
  return s;
}

/** Aviso a administración (no bloquea la respuesta). */
function avisarAdmins(s: any) {
  const mail = solicitudNuevaEmail({
    numero: s.numero,
    cliente: nombreCliente(s),
    negocio: s.negocio?.nombre,
    vendedor: s.vendedorNombre,
    tipo: s.tipo,
    nDocumentos: s.documentos.length,
  });
  UserModel.find({ role: "admin" })
    .select("email")
    .then((admins) => Promise.all(admins.map((a) => sendMail({ to: a.email, ...mail }))))
    .catch(() => {});
}

export const SolicitudesController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filtro: Record<string, unknown> = esAdmin(req) ? {} : { vendedorId: req.user!.id };
      if (req.query.clienteCodigo) filtro.clienteCodigo = String(req.query.clienteCodigo);
      const data = await SolicitudCreditoModel.find(filtro).sort({ updatedAt: -1 }).limit(300);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = await cargar(req, res);
      if (s) res.json({ success: true, data: s });
    } catch (error) {
      next(error);
    }
  },

  /** Crea la solicitud como borrador; con `enviar: true` la manda a revisión si está completa. */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { error, data } = limpiarSolicitud(req.body);
      if (error) {
        res.status(400).json({ success: false, message: error });
        return;
      }
      const enviar = Boolean(req.body?.enviar);
      if (enviar) {
        const faltan = faltantesParaEnviar(data);
        if (faltan.length) {
          res.status(422).json({ success: false, message: `Para enviar falta: ${faltan.join(", ")}.`, faltan });
          return;
        }
      }
      const s = await SolicitudCreditoModel.create({
        ...data,
        numero: formatDoc("SC", await nextSeq("solicitud")),
        vendedorId: req.user!.id,
        vendedorNombre: req.user!.email,
        venCodigo: req.user!.venCodigo,
        estado: enviar ? "enviada" : "borrador",
        enviadaAt: enviar ? new Date() : undefined,
      });
      res.status(201).json({ success: true, data: s });
      if (enviar) avisarAdmins(s);
    } catch (error) {
      next(error);
    }
  },

  /** Edita datos y documentos. Aprobadas no se editan; el vendedor solo corrige borradores o rechazadas. */
  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = await cargar(req, res);
      if (!s) return;
      if (s.estado === "aprobada" || (!esAdmin(req) && s.estado === "enviada")) {
        res.status(409).json({ success: false, message: `La solicitud está ${s.estado} y no se puede editar` });
        return;
      }
      const { error, data } = limpiarSolicitud(req.body);
      if (error) {
        res.status(400).json({ success: false, message: error });
        return;
      }
      // La relación con el ERP la maneja administración: no se pisa al editar.
      const { clienteCodigo, clienteNombre, ...resto } = data as Record<string, unknown>;
      s.set(resto);
      if (!s.clienteCodigo && clienteCodigo) s.set({ clienteCodigo, clienteNombre });

      const enviar = Boolean(req.body?.enviar);
      if (enviar) {
        const faltan = faltantesParaEnviar(s.toObject());
        if (faltan.length) {
          res.status(422).json({ success: false, message: `Para enviar falta: ${faltan.join(", ")}.`, faltan });
          return;
        }
        s.estado = "enviada";
        s.enviadaAt = new Date();
        s.motivoRechazo = undefined;
      }
      await s.save();
      res.json({ success: true, data: s });
      if (enviar) avisarAdmins(s);
    } catch (error) {
      next(error);
    }
  },

  /** Admin aprueba o rechaza (con motivo) una solicitud enviada. */
  async updateEstado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { estado, motivo } = req.body || {};
      if (!["aprobada", "rechazada"].includes(estado)) {
        res.status(400).json({ success: false, message: "Estado inválido" });
        return;
      }
      if (estado === "rechazada" && !String(motivo || "").trim()) {
        res.status(400).json({ success: false, message: "Escribe el motivo del rechazo para el vendedor" });
        return;
      }
      const s = await cargar(req, res);
      if (!s) return;
      if (s.estado !== "enviada") {
        res.status(409).json({ success: false, message: "Solo se revisan solicitudes enviadas" });
        return;
      }
      s.estado = estado;
      s.motivoRechazo = estado === "rechazada" ? String(motivo).trim().slice(0, 500) : undefined;
      s.revisadoPor = req.user!.email;
      s.revisadoAt = new Date();
      await s.save();
      res.json({ success: true, data: s });

      UserModel.findById(s.vendedorId)
        .then((u) => {
          if (!u) return;
          const mail = solicitudEstadoEmail({ numero: s.numero, cliente: nombreCliente(s), estado, motivo: s.motivoRechazo });
          return sendMail({ to: u.email, ...mail });
        })
        .catch(() => {});
    } catch (error) {
      next(error);
    }
  },

  /** Admin relaciona la solicitud con el cliente del ERP (o la desvincula con clienteCodigo vacío). */
  async vincular(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = await cargar(req, res);
      if (!s) return;
      const codigo = String(req.body?.clienteCodigo || "").trim();
      if (!codigo) {
        s.set({ clienteCodigo: undefined, clienteNombre: undefined, vinculadoPor: undefined, vinculadoAt: undefined });
      } else {
        const clientes = (await cachedRead("clientes", () => ErpService.getClientes() as Promise<any[]>)).data as any[];
        const c = clientes.find((x) => String(x.per_codigo) === codigo);
        if (!c) {
          res.status(422).json({ success: false, message: `El cliente ${codigo} no existe en el ERP` });
          return;
        }
        s.set({ clienteCodigo: codigo, clienteNombre: c.per_nombre, vinculadoPor: req.user!.email, vinculadoAt: new Date() });
      }
      await s.save();
      res.json({ success: true, data: s });
    } catch (error) {
      next(error);
    }
  },

  /** Firma para que el celular suba el archivo directo a Cloudinary (sin pasar por el límite de Vercel). */
  async firmaSubida(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const firma = firmaSubidaDirecta("tapia-solicitudes");
      if (!firma) {
        res.status(503).json({ success: false, message: "La subida de archivos no está configurada (Cloudinary)" });
        return;
      }
      res.json({ success: true, data: firma });
    } catch (error) {
      next(error);
    }
  },
};
