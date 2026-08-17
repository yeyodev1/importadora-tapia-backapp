import mongoose, { Schema, Document } from "mongoose";

interface ICounter extends Document {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const CounterModel = mongoose.model<ICounter>("Counter", counterSchema);

/** Devuelve el siguiente número secuencial atómico para una serie dada. */
export async function nextSeq(name: string): Promise<number> {
  const doc = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}

/** Formatea un número con prefijo y ceros, ej. formatDoc("OP", 42) -> "OP-000042". */
export function formatDoc(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}
