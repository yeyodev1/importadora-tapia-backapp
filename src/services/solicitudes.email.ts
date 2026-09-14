import { shell } from "./email.service";

const fila = (k: string, v: string) =>
  `<tr><td style="padding:8px 14px;color:#6b7280">${k}</td><td style="padding:8px 14px;font-weight:bold">${v}</td></tr>`;

/** Aviso a administración: llegó una solicitud de crédito para revisar. */
export function solicitudNuevaEmail(p: {
  numero: string;
  cliente: string;
  negocio: string;
  vendedor: string;
  tipo: string;
  nDocumentos: number;
}): { subject: string; html: string } {
  return {
    subject: `Solicitud de crédito ${p.numero} · por revisar`,
    html: shell(
      "Nueva solicitud de crédito",
      `<p>El vendedor <b>${p.vendedor}</b> envió una solicitud que espera tu revisión:</p>
       <table style="width:100%;background:#f5f7fa;border-radius:8px;margin:12px 0">
         ${fila("N.º", p.numero)}
         ${fila("Tipo", p.tipo === "nuevo" ? "Cliente nuevo" : "Actualización de datos")}
         ${fila("Cliente", p.cliente)}
         ${fila("Negocio", p.negocio || "—")}
         ${fila("Documentos", String(p.nDocumentos))}
       </table>`
    ),
  };
}

/** Aviso al vendedor: su solicitud fue aprobada o devuelta. */
export function solicitudEstadoEmail(p: {
  numero: string;
  cliente: string;
  estado: "aprobada" | "rechazada";
  motivo?: string;
}): { subject: string; html: string } {
  const ok = p.estado === "aprobada";
  return {
    subject: `Solicitud ${p.numero} ${ok ? "aprobada" : "rechazada"}`,
    html: shell(
      ok ? "Solicitud de crédito aprobada" : "Solicitud de crédito rechazada",
      `<p>La solicitud <b>${p.numero}</b> de <b>${p.cliente}</b> fue
       <b style="color:${ok ? "#2BBB92" : "#ef4444"}">${ok ? "aprobada" : "rechazada"}</b>.</p>
       ${!ok && p.motivo ? `<p><b>Motivo:</b> ${p.motivo}</p><p>Puedes corregirla y volver a enviarla desde la app.</p>` : ""}`
    ),
  };
}
