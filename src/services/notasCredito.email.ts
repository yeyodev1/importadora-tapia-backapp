import { shell } from "./email.service";

const fila = (k: string, v: string) =>
  `<tr><td style="padding:8px 14px;color:#6b7280">${k}</td><td style="padding:8px 14px;font-weight:bold">${v}</td></tr>`;

export const MOTIVO_NOTA_LABEL: Record<string, string> = {
  precio: "Precio (la competencia da más barato)",
  calidad: "Calidad del producto",
  otro: "Otro motivo",
};

/** Aviso a administración: un asesor pide una nota de crédito. */
export function notaNuevaEmail(p: {
  numero: string;
  cliente: string;
  vendedor: string;
  motivo: string;
  comentario: string;
}): { subject: string; html: string } {
  return {
    subject: `Nota de crédito ${p.numero} · por aprobar`,
    html: shell(
      "Solicitud de nota de crédito",
      `<p>El asesor <b>${p.vendedor}</b> solicita una nota de crédito que espera tu aprobación:</p>
       <table style="width:100%;background:#f5f7fa;border-radius:8px;margin:12px 0">
         ${fila("N.º", p.numero)}
         ${fila("Cliente", p.cliente)}
         ${fila("Motivo", MOTIVO_NOTA_LABEL[p.motivo] || p.motivo)}
       </table>
       <p style="background:#f5f7fa;border-radius:8px;padding:12px 14px"><b>Cliente indica:</b><br>${p.comentario}</p>
       <p>Puedes aprobarla o rechazarla desde la app, en <b>Notas de crédito</b>.</p>`
    ),
  };
}

/** Aviso al asesor: su solicitud de nota de crédito fue aprobada o rechazada. */
export function notaEstadoEmail(p: {
  numero: string;
  cliente: string;
  estado: "aprobada" | "rechazada";
  motivo?: string;
}): { subject: string; html: string } {
  const ok = p.estado === "aprobada";
  return {
    subject: `Nota de crédito ${p.numero} ${ok ? "aprobada" : "rechazada"}`,
    html: shell(
      ok ? "Nota de crédito aprobada" : "Nota de crédito rechazada",
      `<p>Tu solicitud <b>${p.numero}</b> para <b>${p.cliente}</b> fue
       <b style="color:${ok ? "#2BBB92" : "#ef4444"}">${ok ? "aprobada" : "rechazada"}</b>.</p>
       ${ok ? "<p>Tapia generará la nota de crédito en su sistema.</p>" : ""}
       ${!ok && p.motivo ? `<p><b>Motivo:</b> ${p.motivo}</p>` : ""}`
    ),
  };
}
