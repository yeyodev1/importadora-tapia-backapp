import mongoose, { Schema, Document } from "mongoose";

export type EstadoPedido = "enviado" | "aprobado" | "rechazado";

export interface PedidoItem {
  productoCodigo: string;
  productoNombre: string;
  unidad?: string;
  bodega?: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface IPedido extends Document {
  numero: string;
  vendedorId: string;
  vendedorNombre: string;
  venCodigo?: string;
  clienteNombre: string;
  clienteCodigo?: string;
  items: PedidoItem[];
  total: number;
  fotoUrl?: string;
  observacion?: string;
  motivoRechazo?: string;
  estado: EstadoPedido;
  createdAt: Date;
}

const itemSchema = new Schema<PedidoItem>(
  {
    productoCodigo: { type: String, required: true },
    productoNombre: { type: String, required: true },
    unidad: { type: String },
    bodega: { type: String },
    cantidad: { type: Number, required: true, min: 0 },
    precioUnitario: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const pedidoSchema = new Schema<IPedido>(
  {
    numero: { type: String, required: true, unique: true },
    vendedorId: { type: String, required: true, index: true },
    vendedorNombre: { type: String, required: true },
    venCodigo: { type: String },
    clienteNombre: { type: String, required: true },
    clienteCodigo: { type: String },
    items: { type: [itemSchema], required: true },
    total: { type: Number, required: true, min: 0 },
    fotoUrl: { type: String },
    observacion: { type: String },
    motivoRechazo: { type: String },
    // El vendedor SIEMPRE puede enviar; administración aprueba o rechaza.
    // No emite factura: es una orden que Tapia procesa en su ERP.
    estado: {
      type: String,
      enum: ["enviado", "aprobado", "rechazado"],
      default: "enviado",
    },
  },
  { timestamps: true }
);

export const PedidoModel = mongoose.model<IPedido>("Pedido", pedidoSchema);
