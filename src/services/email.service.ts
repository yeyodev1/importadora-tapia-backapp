/**
 * Envío de correos transaccionales vía Resend (https://resend.com).
 * MAIL_FROM debe ser de un dominio verificado en Resend; mientras tanto se usa
 * onboarding@resend.dev (solo entrega al dueño de la cuenta Resend).
 */

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY no configurada; correo omitido:", subject);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "Importadora Tapia CRM <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Email] Resend ${res.status}: ${body.slice(0, 300)}`);
      return false;
    }
    const data = (await res.json()) as { id?: string };
    console.log(`[Email] Enviado a ${to} (id ${data.id})`);
    return true;
  } catch (err) {
    console.error("[Email] Error enviando:", (err as Error).message);
    return false;
  }
}

const baseStyles =
  'font-family:Arial,Helvetica,sans-serif;color:#010D27;line-height:1.6;font-size:14px';

function money(n: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n);
}

function shell(title: string, body: string): string {
  const appUrl = process.env.APP_URL || "https://importadoratapia.app";
  return `
<div style="${baseStyles};max-width:520px;margin:0 auto;padding:24px">
  <div style="background:#010D27;border-radius:12px 12px 0 0;padding:18px 24px">
    <span style="color:#fff;font-size:17px;font-weight:bold">Importadora Tapia <span style="color:#2094D2">CRM</span></span>
  </div>
  <div style="border:1px solid #e5e9f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <h2 style="margin:0 0 12px;font-size:16px">${title}</h2>
    ${body}
    <p style="margin-top:20px"><a href="${appUrl}" style="background:#2094D2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;display:inline-block">Abrir el CRM</a></p>
  </div>
</div>`;
}

/** Aviso a administración: hay un pedido nuevo por aprobar. */
export function pedidoNuevoEmail(p: {
  numero: string;
  clienteNombre: string;
  vendedor: string;
  total: number;
  nItems: number;
}): { subject: string; html: string } {
  return {
    subject: `Nuevo pedido ${p.numero} · requiere aprobación`,
    html: shell(
      `Nuevo pedido para aprobar`,
      `<p>El vendedor <b>${p.vendedor}</b> envió un pedido que espera tu aprobación:</p>
       <table style="width:100%;background:#f5f7fa;border-radius:8px;margin:12px 0">
         <tr><td style="padding:8px 14px;color:#6b7280">N.º de orden</td><td style="padding:8px 14px;font-weight:bold">${p.numero}</td></tr>
         <tr><td style="padding:8px 14px;color:#6b7280">Cliente</td><td style="padding:8px 14px;font-weight:bold">${p.clienteNombre}</td></tr>
         <tr><td style="padding:8px 14px;color:#6b7280">Productos</td><td style="padding:8px 14px">${p.nItems}</td></tr>
         <tr><td style="padding:8px 14px;color:#6b7280">Total</td><td style="padding:8px 14px;font-weight:bold;color:#2094D2">${money(p.total)}</td></tr>
       </table>`
    ),
  };
}

/** Aviso al vendedor: su pedido fue aprobado o rechazado. */
export function pedidoEstadoEmail(p: {
  numero: string;
  clienteNombre: string;
  total: number;
  estado: string;
  motivoRechazo?: string;
}): { subject: string; html: string } {
  const aprobado = p.estado === "aprobado";
  const color = aprobado ? "#17916C" : "#E5484D";
  const texto = aprobado ? "APROBADO" : "RECHAZADO";
  return {
    subject: `Tu pedido ${p.numero} fue ${texto.toLowerCase()}`,
    html: shell(
      `Tu pedido fue <span style="color:${color}">${texto}</span>`,
      `<p>Tu pedido <b>${p.numero}</b> para <b>${p.clienteNombre}</b> (${money(p.total)}) fue
       <b style="color:${color}">${texto.toLowerCase()}</b> por administración.</p>
       ${p.motivoRechazo ? `<p style="background:#fdecee;border-radius:8px;padding:10px 14px;color:#b4232a">Motivo: ${p.motivoRechazo}</p>` : ""}
       ${aprobado ? `<p>Ya puedes coordinar la entrega con el cliente.</p>` : ""}`
    ),
  };
}

/** Aviso al vendedor: su cobro fue aplicado o rechazado. */
export function cobroEstadoEmail(p: {
  numero: string;
  clienteNombre: string;
  monto: number;
  estado: string;
}): { subject: string; html: string } {
  const aplicado = p.estado === "aplicado";
  const color = aplicado ? "#17916C" : "#E5484D";
  const texto = aplicado ? "aplicado" : "rechazado";
  return {
    subject: `Tu cobro ${p.numero} fue ${texto}`,
    html: shell(
      `Cobro <span style="color:${color}">${texto}</span>`,
      `<p>El cobro <b>${p.numero}</b> de <b>${p.clienteNombre}</b> por <b>${money(p.monto)}</b>
       fue <b style="color:${color}">${texto}</b> por administración.</p>`
    ),
  };
}

export function welcomeEmail(params: {
  name: string;
  email: string;
  password: string;
  role: string;
}): { subject: string; html: string } {
  const appUrl = process.env.APP_URL || "https://importadoratapia.app";
  const rol = params.role === "admin" ? "Administrador" : "Vendedor";
  return {
    subject: "Tu acceso al CRM de Importadora Tapia",
    html: `
<div style="${baseStyles};max-width:520px;margin:0 auto;padding:24px">
  <div style="background:#010D27;border-radius:12px 12px 0 0;padding:20px 24px">
    <span style="color:#fff;font-size:18px;font-weight:bold">Importadora Tapia <span style="color:#2094D2">CRM</span></span>
  </div>
  <div style="border:1px solid #e5e9f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <p>Hola <b>${params.name}</b>,</p>
    <p>Se creó tu cuenta de <b>${rol}</b> en el CRM de Importadora Tapia. Estos son tus datos de acceso:</p>
    <table style="width:100%;background:#f5f7fa;border-radius:8px;padding:8px;margin:16px 0">
      <tr><td style="padding:8px 14px;color:#6b7280">Enlace</td><td style="padding:8px 14px"><a href="${appUrl}" style="color:#2094D2">${appUrl}</a></td></tr>
      <tr><td style="padding:8px 14px;color:#6b7280">Usuario</td><td style="padding:8px 14px"><b>${params.email}</b></td></tr>
      <tr><td style="padding:8px 14px;color:#6b7280">Contraseña</td><td style="padding:8px 14px"><b>${params.password}</b></td></tr>
    </table>
    <p style="color:#6b7280;font-size:12px">Por seguridad, guarda este correo en un lugar privado. Si no esperabas este acceso, contacta a tu administrador.</p>
  </div>
</div>`,
  };
}
