import mongoose, { Schema, Document } from "mongoose";

/**
 * Qué parte del inventario ve cada vendedor. Sin registro (o restringido =
 * false) el vendedor ve todo el inventario del ERP; con restringido = true
 * sólo ve los productos listados (por pro_codigo). Lo administra el admin.
 * `bodega` (bod_nombre del ERP) es la única bodega de la que el vendedor puede
 * ver stock y vender; sin bodega asignada no puede enviar pedidos.
 */
export interface IAsignacionInventario extends Document {
  venCodigo: string;
  restringido: boolean;
  productos: string[];
  bodega?: string;
  actualizadoPor: string;
  updatedAt: Date;
}

const asignacionInventarioSchema = new Schema<IAsignacionInventario>(
  {
    venCodigo: { type: String, required: true, unique: true, trim: true },
    restringido: { type: Boolean, default: false },
    productos: { type: [String], default: [] },
    bodega: { type: String, trim: true },
    actualizadoPor: { type: String, required: true },
  },
  { timestamps: true }
);

export const AsignacionInventarioModel = mongoose.model<IAsignacionInventario>(
  "AsignacionInventario",
  asignacionInventarioSchema
);
