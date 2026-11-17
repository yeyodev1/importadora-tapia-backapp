import { shell, esc, money } from "./email.service";

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
  pideCredito: boolean;
  cupoSolicitado?: number;
  plazoDias?: number;
}): { subject: string; html: string } {
  const credito = p.pideCredito
    ? `${p.cupoSolicitado ? money(p.cupoSolicitado) : "—"} a ${p.plazoDias || "—"} días`
    : "No (solo alta, contado)";
  return {
    subject: `Solicitud ${p.numero} · por revisar`,
    html: shell(
      p.pideCredito ? "Nueva solicitud de crédito" : "Nuevo cliente por dar de alta",
      `<p>El vendedor <b>${esc(p.vendedor)}</b> envió una solicitud que espera tu revisión:</p>
       <table style="width:100%;background:#f5f7fa;border-radius:8px;margin:12px 0">
         ${fila("N.º", p.numero)}
         ${fila("Tipo", p.tipo === "nuevo" ? "Cliente nuevo" : "Actualización de datos")}
         ${fila("Cliente", esc(p.cliente))}
         ${fila("Negocio", esc(p.negocio || "—"))}
         ${fila("Crédito", credito)}
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
      ok ? "Solicitud aprobada" : "Solicitud rechazada",
      `<p>La solicitud <b>${p.numero}</b> de <b>${esc(p.cliente)}</b> fue
       <b style="color:${ok ? "#2BBB92" : "#ef4444"}">${ok ? "aprobada" : "rechazada"}</b>.</p>
       ${!ok && p.motivo ? `<p><b>Motivo:</b> ${esc(p.motivo)}</p><p>Puedes corregirla y volver a enviarla desde la app.</p>` : ""}`
    ),
  };
}
