import crypto from "crypto";
import mongoose, { Schema } from "mongoose";

/**
 * Candado por asesor para crear pedidos de uno en uno. Sin él, dos pedidos
 * enviados al mismo tiempo (dos celulares, o reintento por mala señal) se
 * validan contra el mismo cupo y pasan los dos. Vive en Mongo porque en
 * Vercel cada petición puede caer en otra instancia.
 */
interface ICandado {
  _id: string;
  token: string;
  at: Date;
}

const candadoSchema = new Schema<ICandado>(
  {
    _id: { type: String, required: true },
    token: { type: String, required: true },
    // Respaldo si una instancia muere con el candado puesto.
    at: { type: Date, required: true, expires: 120 },
  },
  { versionKey: false }
);

const CandadoModel = mongoose.model<ICandado>("CandadoAsesor", candadoSchema);

/** Un candado más viejo que esto se da por abandonado (crear un pedido tarda segundos). */
const VENCE_MS = 30_000;
const ESPERA_MS = 150;
const INTENTOS = 40;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tomar(key: string, token: string): Promise<boolean> {
  try {
    await CandadoModel.create({ _id: key, token, at: new Date() });
    return true;
  } catch (e: any) {
    if (e?.code !== 11000) throw e;
    const r = await CandadoModel.updateOne(
      { _id: key, at: { $lt: new Date(Date.now() - VENCE_MS) } },
      { $set: { token, at: new Date() } }
    );
    return r.modifiedCount === 1;
  }
}

export class CandadoOcupadoError extends Error {}

/** Corre `fn` con el candado del asesor; si no se libera en ~6 s lanza CandadoOcupadoError. */
export async function conCandadoAsesor<T>(venCodigo: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!venCodigo) return fn();
  const key = `pedido:${venCodigo}`;
  const token = crypto.randomUUID();
  let ok = false;
  for (let i = 0; i < INTENTOS && !ok; i++) {
    ok = await tomar(key, token);
    if (!ok) await dormir(ESPERA_MS);
  }
  if (!ok) throw new CandadoOcupadoError("Hay otro pedido tuyo enviándose. Espera unos segundos y vuelve a intentar.");
  try {
    return await fn();
  } finally {
    await CandadoModel.deleteOne({ _id: key, token }).catch(() => {});
  }
}
