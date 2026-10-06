import mongoose, { Schema, Document } from "mongoose";

/**
 * "en_espera": administración aún no aprueba y deja un mensaje al asesor
 * (p.ej. que respalde facturas pendientes). Luego lo aprueba o rechaza.
 */
export type EstadoPedido = "enviado" | "aprobado" | "rechazado" | "en_espera";

export const ESTADOS_PEDIDO: EstadoPedido[] = ["enviado", "aprobado", "rechazado", "en_espera"];

export interface PedidoItem {
  productoCodigo: string;
  productoNombre: string;
  unidad?: string;
  bodega?: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/** Despacho que no pudo salir el día previsto: cuándo sale y por qué. */
export interface RetrasoDespacho {
  /** Cuándo se registró (hora del servidor): el día que no salió. */
  registradoAt: Date;
  /** Nueva fecha de salida, "YYYY-MM-DD" en hora de Ecuador. */
  nuevaFecha: string;
  motivo: string;
  registradoPor: string;
}

/** Cada cambio de estado hecho por administración, con su nota y quién lo hizo. */
export interface CambioEstado {
  estado: EstadoPedido;
  nota?: string;
  por: string;
  at: Date;
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
  /** Plazo de crédito acordado con el cliente, en días (0 = contado). Obligatorio. */
  plazoCreditoDias: number;
  fotoUrl?: string;
  /** Fotos de la orden de pedido en papel (fotoUrl es la primera, por compatibilidad). */
  fotos?: string[];
  /** Salida de bodega: hora del servidor, fotos y quién la marcó. */
  despacho?: { salidaAt: Date; fotos: string[]; observacion?: string; despachadoPor: string };
  /** Historial de retrasos del despacho (el último es el vigente). */
  retrasos?: RetrasoDespacho[];
  observacion?: string;
  motivoRechazo?: string;
  /** Comentario de administración al aprobar (p.ej. "Transferencia OK"). */
  comentarioAprobacion?: string;
  /** Mensaje al asesor mientras el pedido está en espera. */
  motivoEspera?: string;
  historialEstado?: CambioEstado[];
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
    plazoCreditoDias: { type: Number, required: true, min: 0, max: 365 },
    fotoUrl: { type: String },
    fotos: { type: [String], default: undefined },
    despacho: {
      type: new Schema(
        {
          salidaAt: { type: Date, required: true },
          fotos: { type: [String], default: [] },
          observacion: { type: String },
          despachadoPor: { type: String, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
    retrasos: {
      type: [
        new Schema(
          {
            registradoAt: { type: Date, required: true },
            nuevaFecha: { type: String, required: true },
            motivo: { type: String, required: true },
            registradoPor: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    observacion: { type: String },
    motivoRechazo: { type: String },
    comentarioAprobacion: { type: String },
    motivoEspera: { type: String },
    historialEstado: {
      type: [
        new Schema(
          {
            estado: { type: String, enum: ESTADOS_PEDIDO, required: true },
            nota: { type: String },
            por: { type: String, required: true },
            at: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    // El vendedor SIEMPRE puede enviar; administración aprueba, rechaza o lo deja en espera.
    // No emite factura: es una orden que Tapia procesa en su ERP.
    estado: {
      type: String,
      enum: ESTADOS_PEDIDO,
      default: "enviado",
    },
  },
  { timestamps: true }
);

export const PedidoModel = mongoose.model<IPedido>("Pedido", pedidoSchema);
