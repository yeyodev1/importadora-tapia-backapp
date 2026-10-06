/**
 * Correos de "Recuperar contraseña": el enlace para restablecerla y el aviso
 * de que se cambió. Mismo estilo que los demás correos (email.service.ts).
 */

const baseStyles =
  'font-family:Arial,Helvetica,sans-serif;color:#010D27;line-height:1.6;font-size:14px';

/** URL del front del CRM (la misma que usan los demás correos). */
export function appUrl(): string {
  return (process.env.APP_URL || "https://importadoratapia.app").replace(/\/+$/, "");
}

export function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function layout(title: string, body: string): string {
  return `
<div style="${baseStyles};max-width:520px;margin:0 auto;padding:24px">
  <div style="background:#010D27;border-radius:12px 12px 0 0;padding:18px 24px">
    <span style="color:#fff;font-size:17px;font-weight:bold">Importadora Tapia <span style="color:#2094D2">CRM</span></span>
  </div>
  <div style="border:1px solid #e5e9f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <h2 style="margin:0 0 12px;font-size:16px">${title}</h2>
    ${body}
  </div>
</div>`;
}

export function boton(href: string, texto: string): string {
  return `<p style="margin:20px 0"><a href="${href}" style="background:#2094D2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;display:inline-block">${texto}</a></p>`;
}

/** Enlace para restablecer la contraseña (expira en 30 minutos). */
export function recuperarContrasenaEmail(p: { name: string; token: string }): { subject: string; html: string } {
  const link = `${appUrl()}/restablecer-contrasena?token=${encodeURIComponent(p.token)}`;
  return {
    subject: "Restablece tu contraseña del CRM",
    html: layout(
      "Restablecer contraseña",
      `<p>Hola <b>${esc(p.name)}</b>,</p>
       <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en el CRM de Importadora Tapia.</p>
       ${boton(link, "Crear nueva contraseña")}
       <p style="background:#fdf4e3;border-radius:8px;padding:10px 14px;color:#C27C0E">El enlace expira en <b>30 minutos</b> y solo se puede usar una vez.</p>
       <p style="color:#6b7280;font-size:12px">Si el botón no funciona, copia este enlace en tu navegador:<br>
         <span style="word-break:break-all;color:#2094D2">${link}</span></p>
       <p style="color:#6b7280;font-size:12px">Si no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.</p>`
    ),
  };
}

/** Aviso de seguridad: la contraseña de la cuenta se acaba de cambiar. */
export function contrasenaCambiadaEmail(p: { name: string; fecha: Date }): { subject: string; html: string } {
  const cuando = new Intl.DateTimeFormat("es-EC", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Guayaquil",
  }).format(p.fecha);
  return {
    subject: "Tu contraseña fue cambiada",
    html: layout(
      "Tu contraseña fue cambiada",
      `<p>Hola <b>${esc(p.name)}</b>,</p>
       <p>La contraseña de tu cuenta en el CRM de Importadora Tapia se cambió el <b>${cuando}</b>.</p>
       ${boton(`${appUrl()}/login`, "Iniciar sesión")}
       <p style="background:#fdecee;border-radius:8px;padding:10px 14px;color:#E5484D">Si no fuiste tú, contacta de inmediato a tu administrador.</p>`
    ),
  };
}
