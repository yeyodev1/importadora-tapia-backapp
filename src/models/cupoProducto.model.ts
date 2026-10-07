import mongoose, { Schema, Document } from "mongoose";

/**
 * Cupo por asesor de un producto escaso (p.ej. llegó un contenedor de lenteja
 * y cada asesor tiene X sacos). Cuenta lo pedido desde `desde` en pedidos
 * activos (sin aprobación, en espera o aprobados, despachados incluidos); los
 * rechazados, anulados y lo que se quita al ajustar devuelven cupo.
 * Un asesor que no está en la lista no tiene límite. Lo administra el admin.
 */
export interface CupoAsesor {
  venCodigo: string;
  nombre?: string;
  cantidad: number;
}

export interface ICupoProducto extends Document {
  proCodigo: string;
  proNombre: string;
  /** Desde cuándo se cuenta lo pedido (al llegar la mercadería se reinicia). */
  desde: Date;
  cupos: CupoAsesor[];
  actualizadoPor: string;
  updatedAt: Date;
}

const cupoProductoSchema = new Schema<ICupoProducto>(
  {
    proCodigo: { type: String, required: true, unique: true, trim: true },
    proNombre: { type: String, default: "", trim: true },
    desde: { type: Date, required: true },
    cupos: {
      type: [
        new Schema<CupoAsesor>(
          {
            venCodigo: { type: String, required: true, trim: true },
            nombre: { type: String, trim: true },
            cantidad: { type: Number, required: true, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    actualizadoPor: { type: String, required: true },
  },
  { timestamps: true }
);

export const CupoProductoModel = mongoose.model<ICupoProducto>("CupoProducto", cupoProductoSchema);
