import mongoose, { Schema, Document } from "mongoose";

/**
 * Reglas comerciales por producto que el ERP no maneja. Hoy: "solo contado"
 * (el producto no se puede vender a crédito). Lo administra el admin.
 */
export interface IReglaProducto extends Document {
  proCodigo: string;
  proNombre: string;
  soloContado: boolean;
  actualizadoPor: string;
  updatedAt: Date;
}

const reglaProductoSchema = new Schema<IReglaProducto>(
  {
    proCodigo: { type: String, required: true, unique: true, trim: true },
    proNombre: { type: String, default: "", trim: true },
    soloContado: { type: Boolean, default: false },
    actualizadoPor: { type: String, required: true },
  },
  { timestamps: true }
);

export const ReglaProductoModel = mongoose.model<IReglaProducto>("ReglaProducto", reglaProductoSchema);
