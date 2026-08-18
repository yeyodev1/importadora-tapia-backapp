import mongoose, { Schema } from "mongoose";

interface IErpCache {
  _id: string; // nombre de la vista, ej. "clientes"
  data: unknown[];
  count: number;
  updatedAt: Date;
}

const erpCacheSchema = new Schema<IErpCache>({
  _id: { type: String, required: true },
  data: { type: [Schema.Types.Mixed], default: [] },
  count: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

export const ErpCacheModel = mongoose.model<IErpCache>("ErpCache", erpCacheSchema);
