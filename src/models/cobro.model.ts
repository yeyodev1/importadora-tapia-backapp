import mongoose, { Schema, Document } from "mongoose";

export type MetodoPago = "efectivo" | "transferencia" | "cheque" | "deposito";
export type EstadoCobro = "registrado" | "aplicado" | "rechazado";

export interface ICobro extends Document {
  numero: string;
  vendedorId: string;
  vendedorNombre: string;
  venCodigo?: string;
  clienteNombre: string;
  clienteCodigo?: string;
  facturaRef?: string;
  monto: number;
  metodoPago: MetodoPago;
  comprobanteUrl: string;
  firmaUrl?: string;
  observacion?: string;
  estado: EstadoCobro;
  createdAt: Date;
}

const cobroSchema = new Schema<ICobro>(
  {
    numero: { type: String, required: true, unique: true },
    vendedorId: { type: String, required: true, index: true },
    vendedorNombre: { type: String, required: true },
    venCodigo: { type: String },
    clienteNombre: { type: String, required: true },
    clienteCodigo: { type: String },
    facturaRef: { type: String },
    monto: { type: Number, required: true, min: 0 },
    metodoPago: {
      type: String,
      enum: ["efectivo", "transferencia", "cheque", "deposito"],
      required: true,
    },
    comprobanteUrl: { type: String, required: true },
    firmaUrl: { type: String },
    observacion: { type: String },
    // El cobro NO toca el ERP: queda "registrado" para que administración lo
    // aplique en su sistema. Es un respaldo, no una factura.
    estado: {
      type: String,
      enum: ["registrado", "aplicado", "rechazado"],
      default: "registrado",
    },
  },
  { timestamps: true }
);

export const CobroModel = mongoose.model<ICobro>("Cobro", cobroSchema);
