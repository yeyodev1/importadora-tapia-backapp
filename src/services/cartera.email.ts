import { shell } from "./email.service";

const money = (n: unknown) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number(n) || 0);

const fecha = (v: unknown) => {
  const d = new Date(String(v || ""));
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fila = (k: string, v: string, fuerte = false) =>
  `<tr><td style="padding:8px 14px;color:#6b7280">${k}</td><td style="padding:8px 14px;${fuerte ? "font-weight:bold;color:#010D27" : ""}">${v}</td></tr>`;

/** Correo al cliente con el saldo de una factura (se envía desde app@importadoratapia.app). */
export function facturaSaldoEmail(f: any, remitente: string, mensaje?: string): { subject: string; html: string } {
  const numero = f.numero_factura_impreso || [f.trc_serdoc, f.trc_numdoc].filter(Boolean).join("-");
  const conPlazo = Number(f.per_diascredito) > 0;
  return {
    subject: `Factura ${numero} · saldo pendiente ${money(f.saldo_pendiente)}`,
    html: shell(
      "Detalle de su factura",
      `<p>Estimado cliente <b>${escapar(String(f.per_nombre || ""))}</b>, le compartimos el saldo de su factura con Importadora Tapia:</p>
       ${mensaje ? `<p style="background:#f5f7fa;border-radius:8px;padding:10px 14px">${escapar(mensaje).replace(/\n/g, "<br>")}</p>` : ""}
       <table style="width:100%;background:#f5f7fa;border-radius:8px;margin:12px 0">
         ${fila("Factura N.º", escapar(String(numero)), true)}
         ${fila("Emisión", fecha(f.trc_fecha))}
         ${conPlazo ? fila("Vence", fecha(f.fecha_vencimiento)) : ""}
         ${fila("Total", money(f.trc_totfact))}
         ${fila("Abonado", money(f.total_abonado))}
         ${fila("Saldo pendiente", `<span style="color:#ef4444">${money(f.saldo_pendiente)}</span>`, true)}
       </table>
       <p style="color:#6b7280;font-size:12px">Enviado por ${escapar(remitente)}. Si ya realizó el pago, por favor ignore este mensaje o responda a este correo.</p>`
    ),
  };
}
