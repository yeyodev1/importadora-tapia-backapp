import mongoose, { Schema, Document } from "mongoose";

export type TipoSolicitud = "nuevo" | "actualizacion";
export type TipoPersona = "natural" | "obligado" | "juridica";
export type EstadoSolicitud = "borrador" | "enviada" | "aprobada" | "rechazada";
export type TipoDocumento =
  | "solicitud_firmada"
  | "cedula"
  | "servicio_basico"
  | "factura_proveedor"
  | "ruc"
  | "nombramiento";

export const TIPOS_DOCUMENTO: TipoDocumento[] = [
  "solicitud_firmada",
  "cedula",
  "servicio_basico",
  "factura_proveedor",
  "ruc",
  "nombramiento",
];

export interface DocumentoSolicitud {
  tipo: TipoDocumento;
  url: string;
  nombre: string;
  formato: string;
  bytes: number;
}

export interface ISolicitudCredito extends Document {
  numero: string;
  vendedorId: string;
  vendedorNombre: string;
  venCodigo?: string;
  tipo: TipoSolicitud;
  tipoPersona: TipoPersona;
  titular: { nombres: string; apellidos: string; cedula: string; formaPago: string };
  negocio: {
    nombre: string;
    ruc: string;
    direccion: string;
    telefono: string;
    celular: string;
    direccionDomicilio: string;
    telefonoDomicilio: string;
  };
  refComerciales: { proveedor: string; montoMes: string; plazoPago: string; telefono: string }[];
  refBancarias: { banco: string; cuenta: string }[];
  refPersonales: { nombres: string; apellidos: string; parentesco: string; telefonos: string }[];
  autorizaBuro: boolean;
  documentos: DocumentoSolicitud[];
  observacion?: string;
  estado: EstadoSolicitud;
  enviadaAt?: Date;
  motivoRechazo?: string;
  revisadoPor?: string;
  revisadoAt?: Date;
  /** Cliente del ERP con el que quedó relacionada (nuevo: cuando Tapia lo crea). */
  clienteCodigo?: string;
  clienteNombre?: string;
  vinculadoPor?: string;
  vinculadoAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const texto = { type: String, trim: true, default: "" };

const solicitudSchema = new Schema<ISolicitudCredito>(
  {
    numero: { type: String, required: true, unique: true },
    vendedorId: { type: String, required: true, index: true },
    vendedorNombre: { type: String, required: true },
    venCodigo: { type: String },
    tipo: { type: String, enum: ["nuevo", "actualizacion"], required: true },
    tipoPersona: { type: String, enum: ["natural", "obligado", "juridica"], required: true },
    titular: { nombres: texto, apellidos: texto, cedula: texto, formaPago: texto },
    negocio: {
      nombre: texto,
      ruc: texto,
      direccion: texto,
      telefono: texto,
      celular: texto,
      direccionDomicilio: texto,
      telefonoDomicilio: texto,
    },
    refComerciales: [{ _id: false, proveedor: texto, montoMes: texto, plazoPago: texto, telefono: texto }],
    refBancarias: [{ _id: false, banco: texto, cuenta: texto }],
    refPersonales: [{ _id: false, nombres: texto, apellidos: texto, parentesco: texto, telefonos: texto }],
    autorizaBuro: { type: Boolean, default: false },
    documentos: [
      {
        _id: false,
        tipo: { type: String, enum: TIPOS_DOCUMENTO, required: true },
        url: { type: String, required: true },
        nombre: texto,
        formato: texto,
        bytes: { type: Number, default: 0 },
      },
    ],
    observacion: { type: String, trim: true },
    estado: {
      type: String,
      enum: ["borrador", "enviada", "aprobada", "rechazada"],
      default: "borrador",
      index: true,
    },
    enviadaAt: { type: Date },
    motivoRechazo: { type: String, trim: true },
    revisadoPor: { type: String },
    revisadoAt: { type: Date },
    clienteCodigo: { type: String, index: true },
    clienteNombre: { type: String },
    vinculadoPor: { type: String },
    vinculadoAt: { type: Date },
  },
  { timestamps: true }
);

export const SolicitudCreditoModel = mongoose.model<ISolicitudCredito>(
  "SolicitudCredito",
  solicitudSchema
);
