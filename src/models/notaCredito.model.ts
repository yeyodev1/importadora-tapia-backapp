import mongoose, { Schema, Document } from "mongoose";

export type EstadoNotaCredito = "pendiente" | "aprobada" | "rechazada";
export type MotivoNotaCredito = "precio" | "calidad" | "otro";

export const MOTIVOS_NOTA: MotivoNotaCredito[] = ["precio", "calidad", "otro"];

/**
 * Solicitud de nota de crédito: el asesor cuenta lo que pide el cliente
 * (rebaja de precio, reclamo de calidad…) y administración la aprueba o
 * rechaza. La nota de crédito en sí se emite en el sistema de Tapia.
 */
export interface INotaCredito extends Document {
  numero: string;
  vendedorId: string;
  vendedorNombre: string;
  venCodigo?: string;
  clienteCodigo: string;
  clienteNombre: string;
  motivo: MotivoNotaCredito;
  comentario: string;
  estado: EstadoNotaCredito;
  motivoRechazo?: string;
  revisadoPor?: string;
  revisadoAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notaCreditoSchema = new Schema<INotaCredito>(
  {
    numero: { type: String, required: true, unique: true },
    vendedorId: { type: String, required: true, index: true },
    vendedorNombre: { type: String, required: true },
    venCodigo: { type: String },
    clienteCodigo: { type: String, required: true, index: true },
    clienteNombre: { type: String, required: true, trim: true },
    motivo: { type: String, enum: MOTIVOS_NOTA, required: true },
    comentario: { type: String, required: true, trim: true, maxlength: 1000 },
    estado: {
      type: String,
      enum: ["pendiente", "aprobada", "rechazada"],
      default: "pendiente",
      index: true,
    },
    motivoRechazo: { type: String, trim: true },
    revisadoPor: { type: String },
    revisadoAt: { type: Date },
  },
  { timestamps: true }
);

export const NotaCreditoModel = mongoose.model<INotaCredito>("NotaCredito", notaCreditoSchema);
