import { DocumentoSolicitud, TIPOS_DOCUMENTO, TipoPersona } from "../models/solicitudCredito.model";
import { esUrlCloudinaryPropia } from "./cloudinary.service";

const TIPOS_PERSONA: TipoPersona[] = ["natural", "obligado", "juridica"];

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

/** Arma listas de referencias limpias: máximo `max`, sin filas totalmente vacías. */
function lista<T extends Record<string, string>>(raw: unknown, campos: (keyof T)[], max: number): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, max)
    .map((r) => Object.fromEntries(campos.map((c) => [c, str((r || {})[c])])) as T)
    .filter((r) => campos.some((c) => r[c]));
}

/**
 * Normaliza el cuerpo que envía la app (formulario de solicitud de crédito).
 * Devuelve el error de validación o los datos listos para guardar.
 */
export function limpiarSolicitud(body: any): { error?: string; data?: Record<string, unknown> } {
  const b = body || {};
  if (!["nuevo", "actualizacion"].includes(b.tipo)) return { error: "Indica si es cliente nuevo o actualización" };
  if (!TIPOS_PERSONA.includes(b.tipoPersona)) return { error: "Indica el tipo de persona" };

  const documentos: DocumentoSolicitud[] = [];
  for (const d of Array.isArray(b.documentos) ? b.documentos.slice(0, 40) : []) {
    if (!TIPOS_DOCUMENTO.includes(d?.tipo)) return { error: "Tipo de documento inválido" };
    if (!esUrlCloudinaryPropia(String(d?.url || ""))) return { error: "Documento con enlace no permitido" };
    documentos.push({
      tipo: d.tipo,
      url: String(d.url),
      nombre: str(d.nombre, 160),
      formato: str(d.formato, 20),
      bytes: Number(d.bytes) || 0,
    });
  }

  const t = b.titular || {};
  const n = b.negocio || {};
  return {
    data: {
      tipo: b.tipo,
      tipoPersona: b.tipoPersona,
      titular: { nombres: str(t.nombres), apellidos: str(t.apellidos), cedula: str(t.cedula, 20), formaPago: str(t.formaPago, 40) },
      negocio: {
        nombre: str(n.nombre),
        ruc: str(n.ruc, 20),
        direccion: str(n.direccion, 300),
        telefono: str(n.telefono, 40),
        celular: str(n.celular, 40),
        direccionDomicilio: str(n.direccionDomicilio, 300),
        telefonoDomicilio: str(n.telefonoDomicilio, 40),
      },
      refComerciales: lista(b.refComerciales, ["proveedor", "montoMes", "plazoPago", "telefono"], 2),
      refBancarias: lista(b.refBancarias, ["banco", "cuenta"], 2),
      refPersonales: lista(b.refPersonales, ["nombres", "apellidos", "parentesco", "telefonos"], 2),
      autorizaBuro: Boolean(b.autorizaBuro),
      documentos,
      observacion: str(b.observacion, 1000) || undefined,
      clienteCodigo: b.tipo === "actualizacion" ? str(b.clienteCodigo, 30) || undefined : undefined,
      clienteNombre: b.tipo === "actualizacion" ? str(b.clienteNombre) || undefined : undefined,
    },
  };
}

/** Cuántos archivos exige cada documento según el tipo de persona (0 = no aplica). */
export function minimosDocumentos(tipoPersona: TipoPersona): Record<string, number> {
  return {
    solicitud_firmada: 1,
    cedula: 1,
    servicio_basico: 1,
    factura_proveedor: 2,
    ruc: tipoPersona === "natural" ? 0 : 1,
    nombramiento: tipoPersona === "juridica" ? 1 : 0,
  };
}

const NOMBRE_DOC: Record<string, string> = {
  solicitud_firmada: "solicitud llena y firmada",
  cedula: "copia de cédula",
  servicio_basico: "planilla de servicio básico",
  factura_proveedor: "facturas de proveedores (mínimo 2)",
  ruc: "copia del RUC",
  nombramiento: "nombramiento del representante legal",
};

/** Lo que falta para poder ENVIAR a revisión (un borrador puede guardarse incompleto). */
export function faltantesParaEnviar(s: any): string[] {
  const faltan: string[] = [];
  const t = s.titular || {};
  const n = s.negocio || {};
  if (!t.nombres || !t.apellidos) faltan.push("nombres y apellidos");
  if (!t.cedula) faltan.push("cédula");
  if (!t.formaPago) faltan.push("forma de pago");
  if (!n.nombre) faltan.push("nombre del negocio");
  if (!n.direccion) faltan.push("dirección del negocio");
  if (!n.celular && !n.telefono) faltan.push("teléfono o celular");
  if (s.tipoPersona !== "natural" && !n.ruc) faltan.push("número de RUC");
  if (!s.autorizaBuro) faltan.push("autorización de consulta crediticia");

  const min = minimosDocumentos(s.tipoPersona);
  for (const tipo of Object.keys(min)) {
    const hay = (s.documentos || []).filter((d: DocumentoSolicitud) => d.tipo === tipo).length;
    if (hay < min[tipo]) faltan.push(NOMBRE_DOC[tipo]);
  }
  return faltan;
}
