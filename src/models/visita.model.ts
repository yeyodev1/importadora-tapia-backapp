import mongoose, { Schema, Document } from "mongoose";

export type EstadoVisita = "en_curso" | "finalizada";
export type ResultadoVisita = "atendido" | "espera" | "regreso" | "abandono";

interface GeoPunto {
  lat: number;
  lng: number;
  ts: Date;
}

export interface IVisita extends Document {
  vendedorId: string;
  vendedorNombre: string;
  venCodigo?: string;
  clienteNombre?: string;
  clienteCodigo?: string;
  entrada: GeoPunto;
  salida?: GeoPunto;
  duracionMin?: number;
  estado: EstadoVisita;
  resultado?: ResultadoVisita;
  observacion?: string;
  createdAt: Date;
}

const geoSchema = new Schema<GeoPunto>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    ts: { type: Date, required: true },
  },
  { _id: false }
);

const visitaSchema = new Schema<IVisita>(
  {
    vendedorId: { type: String, required: true, index: true },
    vendedorNombre: { type: String, required: true },
    venCodigo: { type: String },
    clienteNombre: { type: String },
    clienteCodigo: { type: String },
    // Ubicación de LLEGADA obligatoria: sin GPS no hay visita válida.
    entrada: { type: geoSchema, required: true },
    salida: { type: geoSchema },
    duracionMin: { type: Number },
    estado: { type: String, enum: ["en_curso", "finalizada"], default: "en_curso" },
    resultado: { type: String, enum: ["atendido", "espera", "regreso", "abandono"] },
    observacion: { type: String },
  },
  { timestamps: true }
);

export const VisitaModel = mongoose.model<IVisita>("Visita", visitaSchema);
