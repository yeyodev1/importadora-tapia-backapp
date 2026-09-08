import mongoose, { Schema, Document } from "mongoose";

/**
 * Vendedores del ERP que ya no trabajan con Tapia. El ERP es de solo lectura
 * y sigue listándolos, así que la app los oculta de "Vendedores" y de la
 * lista de "sin cuenta". Se puede restaurar en cualquier momento.
 */
export interface IVendedorOculto extends Document {
  venCodigo: string;
  venNombre: string;
  motivo?: string;
  ocultadoPor: string;
  createdAt: Date;
}

const vendedorOcultoSchema = new Schema<IVendedorOculto>(
  {
    venCodigo: { type: String, required: true, unique: true, trim: true },
    venNombre: { type: String, required: true, trim: true },
    motivo: { type: String, trim: true },
    ocultadoPor: { type: String, required: true },
  },
  { timestamps: true }
);

export const VendedorOcultoModel = mongoose.model<IVendedorOculto>(
  "VendedorOculto",
  vendedorOcultoSchema
);
