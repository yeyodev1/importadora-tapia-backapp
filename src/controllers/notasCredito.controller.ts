import { Response, NextFunction } from "express";
import { NotaCreditoModel, MOTIVOS_NOTA, MotivoNotaCredito } from "../models/notaCredito.model";
import { UserModel } from "../models/user.model";
import { nextSeq, formatDoc } from "../models/counter.model";
import { AuthRequest } from "../types/AuthRequest";
import { sendMail } from "../services/email.service";
import { notaNuevaEmail, notaEstadoEmail } from "../services/notasCredito.email";
import { cachedRead } from "../services/erpCache.service";
import { ErpService } from "../services/erp.service";

const esAdmin = (req: AuthRequest) => req.user?.role === "admin";

/** Aviso a administración (no bloquea la respuesta). */
function avisarAdmins(n: any) {
  const mail = notaNuevaEmail({
    numero: n.numero,
    cliente: n.clienteNombre,
    vendedor: n.vendedorNombre,
    motivo: n.motivo,
    comentario: n.comentario,
  });
  UserModel.find({ role: "admin" })
    .select("email")
    .then((admins) => Promise.all(admins.map((a) => sendMail({ to: a.email, ...mail }))))
    .catch(() => {});
}

export const NotasCreditoController = {
  /** Admin ve todas; el asesor solo las suyas. */
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filtro: Record<string, unknown> = esAdmin(req) ? {} : { vendedorId: req.user!.id };
      if (req.query.clienteCodigo) filtro.clienteCodigo = String(req.query.clienteCodigo);
      const data = await NotaCreditoModel.find(filtro).sort({ updatedAt: -1 }).limit(300);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  /** El asesor pide la nota: cliente del listado + lo que el cliente indica. */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const b = req.body || {};
      const motivo = String(b.motivo || "") as MotivoNotaCredito;
      if (!MOTIVOS_NOTA.includes(motivo)) {
        res.status(400).json({ success: false, message: "Indica el motivo de la nota de crédito" });
        return;
      }
      const comentario = String(b.comentario || "").trim().slice(0, 1000);
      if (!comentario) {
        res.status(400).json({ success: false, message: "Escribe lo que indica el cliente (es lo que verá administración)" });
        return;
      }
      const codigo = String(b.clienteCodigo || "").trim();
      if (!codigo) {
        res.status(400).json({ success: false, message: "Elige el cliente del listado de clientes" });
        return;
      }
      // Se valida contra el ERP cuando responde; si está caído, se confía en el
      // nombre que mandó la app (el asesor igual eligió del listado).
      let clienteNombre = String(b.clienteNombre || "").trim().slice(0, 200);
      try {
        const clientes = (await cachedRead("clientes", () => ErpService.getClientes() as Promise<any[]>)).data as any[];
        const c = clientes.find((x) => String(x.per_codigo) === codigo);
        if (!c) {
          res.status(422).json({ success: false, message: `El cliente ${codigo} no existe en el ERP` });
          return;
        }
        clienteNombre = c.per_nombre;
      } catch {
        if (!clienteNombre) {
          res.status(503).json({ success: false, message: "No se pudo verificar el cliente en el ERP; intenta de nuevo" });
          return;
        }
      }

      const n = await NotaCreditoModel.create({
        numero: formatDoc("NC", await nextSeq("notaCredito")),
        vendedorId: req.user!.id,
        vendedorNombre: req.user!.email,
        venCodigo: req.user!.venCodigo,
        clienteCodigo: codigo,
        clienteNombre,
        motivo,
        comentario,
      });
      res.status(201).json({ success: true, data: n });
      avisarAdmins(n);
    } catch (error) {
      next(error);
    }
  },

  /** Admin aprueba o rechaza (con motivo) una solicitud pendiente. */
  async updateEstado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { estado, motivo } = req.body || {};
      if (!["aprobada", "rechazada"].includes(estado)) {
        res.status(400).json({ success: false, message: "Estado inválido" });
        return;
      }
      if (estado === "rechazada" && !String(motivo || "").trim()) {
        res.status(400).json({ success: false, message: "Escribe el motivo del rechazo para el asesor" });
        return;
      }
      const n = await NotaCreditoModel.findById(req.params.id);
      if (!n) {
        res.status(404).json({ success: false, message: "Solicitud no encontrada" });
        return;
      }
      if (n.estado !== "pendiente") {
        res.status(409).json({ success: false, message: `La solicitud ya está ${n.estado}` });
        return;
      }
      n.estado = estado;
      n.motivoRechazo = estado === "rechazada" ? String(motivo).trim().slice(0, 500) : undefined;
      n.revisadoPor = req.user!.email;
      n.revisadoAt = new Date();
      await n.save();
      res.json({ success: true, data: n });

      UserModel.findById(n.vendedorId)
        .then((u) => {
          if (!u) return;
          const mail = notaEstadoEmail({ numero: n.numero, cliente: n.clienteNombre, estado, motivo: n.motivoRechazo });
          return sendMail({ to: u.email, ...mail });
        })
        .catch(() => {});
    } catch (error) {
      next(error);
    }
  },
};
