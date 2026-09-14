import mongoose, { Schema, Document } from "mongoose";

/**
 * Foto o PDF de una factura del ERP (la vista de Macio no trae el detalle de
 * productos, así que el equipo sube la factura física y queda ligada aquí).
 */
export interface IFacturaAdjunto extends Document {
  /** in_trancab.trc_codigo de la factura en el ERP. */
  trcCodigo: string;
  numeroFactura: string;
  clienteNombre: string;
  url: string;
  nombre: string;
  formato: "imagen" | "pdf";
  bytes: number;
  subidoPor: string;
  subidoPorId: string;
  createdAt: Date;
}

const facturaAdjuntoSchema = new Schema<IFacturaAdjunto>(
  {
    trcCodigo: { type: String, required: true, index: true },
    numeroFactura: { type: String, default: "" },
    clienteNombre: { type: String, default: "" },
    url: { type: String, required: true },
    nombre: { type: String, trim: true, default: "" },
    formato: { type: String, enum: ["imagen", "pdf"], default: "imagen" },
    bytes: { type: Number, default: 0 },
    subidoPor: { type: String, required: true },
    subidoPorId: { type: String, required: true },
  },
  { timestamps: true }
);

export const FacturaAdjuntoModel = mongoose.model<IFacturaAdjunto>("FacturaAdjunto", facturaAdjuntoSchema);
