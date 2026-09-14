import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import { ErpService } from "../services/erp.service";
import { cachedRead } from "../services/erpCache.service";
import { sendMail, MAIL_FROM_APP } from "../services/email.service";
import { facturaSaldoEmail } from "../services/cartera.email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CarteraCompartirController = {
  /**
   * Envía por correo el saldo de una factura a quien indique el usuario.
   * La factura se busca en la cartera del propio usuario (un vendedor solo
   * puede enviar facturas de sus clientes); nunca se confía en datos del cliente.
   */
  async enviarCorreo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const para = String(req.body?.para || "").trim().toLowerCase();
      const mensaje = String(req.body?.mensaje || "").trim().slice(0, 600);
      if (!EMAIL.test(para)) {
        res.status(400).json({ success: false, message: "Escribe un correo válido" });
        return;
      }

      const scope = req.user?.role === "vendedor" ? req.user.venCodigo : undefined;
      const key = scope ? `cartera_facturas:${scope}` : "cartera_facturas";
      const r = await cachedRead(key, () => ErpService.getCarteraFacturas(scope) as Promise<any[]>);
      const factura = (r.data as any[]).find((f) => String(f.trc_codigo) === String(req.params.codigo));
      if (!factura) {
        res.status(404).json({ success: false, message: "Factura no encontrada en tu cartera" });
        return;
      }

      const mail = facturaSaldoEmail(factura, req.user!.email, mensaje || undefined);
      const enviado = await sendMail({ to: para, ...mail, from: MAIL_FROM_APP, replyTo: req.user!.email });
      if (!enviado) {
        res.status(502).json({
          success: false,
          message: "No se pudo enviar el correo. Revisa que el dominio importadoratapia.app esté verificado en Resend.",
        });
        return;
      }
      res.json({ success: true, data: { para } });
    } catch (error) {
      next(error);
    }
  },
};
