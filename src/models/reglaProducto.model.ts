import mongoose, { Schema, Document } from "mongoose";

/**
 * Reglas comerciales por producto que el ERP no maneja. Hoy: "solo contado"
 * (el producto no se puede vender a crédito) y las libras por saco. Lo administra el admin.
 */
export interface IReglaProducto extends Document {
  proCodigo: string;
  proNombre: string;
  soloContado: boolean;
  /** Se vende por libra pero sale en saco de estas libras (vacío = se vende suelto). */
  librasPorSaco?: number | null;
  actualizadoPor: string;
  updatedAt: Date;
}

const reglaProductoSchema = new Schema<IReglaProducto>(
  {
    proCodigo: { type: String, required: true, unique: true, trim: true },
    proNombre: { type: String, default: "", trim: true },
    soloContado: { type: Boolean, default: false },
    librasPorSaco: { type: Number, min: 0, default: null },
    actualizadoPor: { type: String, required: true },
  },
  { timestamps: true }
);

export const ReglaProductoModel = mongoose.model<IReglaProducto>("ReglaProducto", reglaProductoSchema);
