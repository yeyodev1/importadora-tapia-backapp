/**
 * Self-check de la validación de solicitudes (cliente nuevo + crédito).
 * Sin BD ni red: `pnpm check:solicitudes`.
 */
import assert from "node:assert/strict";

process.env.CLOUDINARY_CLOUD_NAME = "demo";

import { limpiarSolicitud, faltantesParaEnviar, minimosDocumentos } from "../services/solicitudes.service";
import { solicitudNuevaEmail, solicitudEstadoEmail } from "../services/solicitudes.email";

const doc = (tipo: string) => ({ tipo, url: `https://res.cloudinary.com/demo/image/upload/${tipo}.jpg`, nombre: tipo });
const base = {
  tipo: "nuevo",
  tipoPersona: "natural",
  titular: { nombres: "Ana", apellidos: "Pérez", cedula: "0912345678", formaPago: "Contado" },
  negocio: { nombre: "Tienda Ana", direccion: "Av. 9 de Octubre", celular: "0991234567", correo: "Ana@Tienda.ec" },
};
const limpia = (extra: Record<string, unknown>) => {
  const r = limpiarSolicitud({ ...base, ...extra });
  assert.equal(r.error, undefined, r.error);
  return r.data as any;
};

// Solo alta (sin crédito): basta la cédula; cupo/plazo se descartan; correo en minúsculas.
const alta = limpia({ pideCredito: false, cupoSolicitado: 500, plazoDias: 30, documentos: [doc("cedula")] });
assert.equal(alta.pideCredito, false);
assert.equal(alta.cupoSolicitado, undefined);
assert.equal(alta.negocio.correo, "ana@tienda.ec");
assert.deepEqual(faltantesParaEnviar(alta), []);
assert.deepEqual(faltantesParaEnviar({ ...alta, documentos: [] }), ["copia de cédula"]);

// Con crédito: exige cupo, plazo, autorización y los documentos de la hoja.
const cred = limpia({ pideCredito: true, documentos: [doc("cedula")] });
const faltan = faltantesParaEnviar(cred);
for (const f of ["cupo de crédito pedido", "plazo del crédito", "autorización de consulta crediticia", "solicitud llena y firmada", "facturas de proveedores (mínimo 2)"]) {
  assert.ok(faltan.includes(f), `debería faltar: ${f}`);
}
const completa = limpia({
  pideCredito: true,
  cupoSolicitado: "1500.456",
  plazoDias: 30,
  autorizaBuro: true,
  documentos: ["solicitud_firmada", "cedula", "servicio_basico", "factura_proveedor", "factura_proveedor"].map(doc),
});
assert.equal(completa.cupoSolicitado, 1500.46);
assert.deepEqual(faltantesParaEnviar(completa), []);

// Solicitudes viejas (sin el campo) siguen siendo de crédito.
assert.equal(limpia({}).pideCredito, true);
assert.equal(faltantesParaEnviar({ ...completa, pideCredito: undefined }).length, 0);

// Rechazos en la frontera.
assert.match(limpiarSolicitud({ ...base, cupoSolicitado: -1 }).error!, /cupo/);
assert.match(limpiarSolicitud({ ...base, cupoSolicitado: "abc" }).error!, /cupo/);
assert.match(limpiarSolicitud({ ...base, plazoDias: 2.5 }).error!, /plazo/);
assert.match(limpiarSolicitud({ ...base, ubicacion: { lat: 120, lng: 0 } }).error!, /Ubicación/);
assert.match(limpiarSolicitud({ ...base, documentos: [{ tipo: "cedula", url: "https://evil.com/x.jpg" }] }).error!, /enlace/);
assert.deepEqual(limpia({ ubicacion: { lat: "-2.17", lng: -79.92 } }).ubicacion, { lat: -2.17, lng: -79.92 });
assert.equal(limpia({ ubicacion: null }).ubicacion, undefined);

// Formatos que se revisan al enviar.
const mal = limpia({
  pideCredito: false,
  titular: { ...base.titular, cedula: "12345" },
  negocio: { ...base.negocio, ruc: "099", correo: "sin-arroba" },
  documentos: [doc("cedula")],
});
assert.deepEqual(faltantesParaEnviar(mal), ["cédula de 10 dígitos", "RUC de 13 dígitos", "correo válido"]);

// Documentos por tipo de persona.
assert.equal(minimosDocumentos("juridica", true).nombramiento, 1);
assert.equal(minimosDocumentos("juridica", false).nombramiento, 0);
assert.equal(minimosDocumentos("obligado", false).ruc, 1);

// Correos: el texto libre va escapado.
const m = solicitudNuevaEmail({ numero: "SC-1", cliente: "<b>x</b>", negocio: "", vendedor: "v", tipo: "nuevo", nDocumentos: 1, pideCredito: true, cupoSolicitado: 1000, plazoDias: 30 });
assert.ok(!m.html.includes("<b>x</b>") && m.html.includes("30 días"));
assert.ok(!solicitudEstadoEmail({ numero: "SC-1", cliente: "c", estado: "rechazada", motivo: "<script>" }).html.includes("<script>"));

console.log("check-solicitudes: OK");
