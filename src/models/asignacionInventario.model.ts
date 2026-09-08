import mongoose, { Schema, Document } from "mongoose";

/**
 * Qué parte del inventario ve cada vendedor. Sin registro (o restringido =
 * false) el vendedor ve todo el inventario del ERP; con restringido = true
 * sólo ve los productos listados (por pro_codigo). Lo administra el admin.
 */
export interface IAsignacionInventario extends Document {
  venCodigo: string;
  restringido: boolean;
  productos: string[];
  actualizadoPor: string;
  updatedAt: Date;
}

const asignacionInventarioSchema = new Schema<IAsignacionInventario>(
  {
    venCodigo: { type: String, required: true, unique: true, trim: true },
    restringido: { type: Boolean, default: false },
    productos: { type: [String], default: [] },
    actualizadoPor: { type: String, required: true },
  },
  { timestamps: true }
);

export const AsignacionInventarioModel = mongoose.model<IAsignacionInventario>(
  "AsignacionInventario",
  asignacionInventarioSchema
);
