/**
 * Correos de "Cambiar mi correo": confirmación al correo nuevo y aviso de
 * seguridad al anterior. Mismo estilo que los de recuperar contraseña.
 */
import { appUrl, boton, esc, layout } from "./passwordReset.email";

function fechaEc(fecha: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Guayaquil",
  }).format(fecha);
}

/** Al correo NUEVO: desde ahora es su usuario de acceso. */
export function correoNuevoEmail(p: { name: string; nuevo: string }): { subject: string; html: string } {
  return {
    subject: "Tu correo de acceso al CRM cambió",
    html: layout(
      "Tu correo de acceso ahora es este",
      `<p>Hola <b>${esc(p.name)}</b>,</p>
       <p>Tu correo de acceso al CRM de Importadora Tapia ahora es <b>${esc(p.nuevo)}</b>.</p>
       <p>Desde ahora inicia sesión con este correo y tu misma contraseña.</p>
       ${boton(`${appUrl()}/login`, "Iniciar sesión")}`
    ),
  };
}

/** Al correo ANTERIOR: aviso por si no fue la persona quien lo cambió. */
export function correoAnteriorEmail(p: { name: string; nuevo: string; fecha: Date }): {
  subject: string;
  html: string;
} {
  return {
    subject: "Tu correo de acceso al CRM fue cambiado",
    html: layout(
      "Tu correo de acceso cambió",
      `<p>Hola <b>${esc(p.name)}</b>,</p>
       <p>El <b>${fechaEc(p.fecha)}</b> el correo de acceso de tu cuenta en el CRM de Importadora Tapia cambió a <b>${esc(p.nuevo)}</b>.</p>
       <p>Este correo ya no sirve para iniciar sesión.</p>
       <p style="background:#fdecee;border-radius:8px;padding:10px 14px;color:#E5484D">Si no fuiste tú, avisa de inmediato a administración.</p>`
    ),
  };
}
