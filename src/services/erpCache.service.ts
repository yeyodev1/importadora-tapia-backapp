import { ErpCacheModel } from "../models/erpCache.model";

export interface CachedResult<T> {
  data: T[];
  /** true = el ERP no respondió y se está sirviendo la última copia guardada. */
  stale: boolean;
  /** Fecha de la copia servida (última sincronización con el ERP). */
  updatedAt: Date | null;
  /** Motivo del fallo, sólo si stale = true. */
  error?: string;
}

/**
 * Lee una vista del ERP con resiliencia:
 *  1. Intenta la consulta en vivo. Si funciona, GUARDA la copia en Mongo y la
 *     devuelve marcada como fresca (stale:false).
 *  2. Si el ERP falla (túnel caído, etc.), devuelve la ÚLTIMA copia guardada en
 *     Mongo marcada como stale:true, con el motivo del error.
 * Así la app nunca queda vacía y siempre sabemos si el dato es en vivo o cache.
 */
export async function cachedRead<T>(
  view: string,
  loader: () => Promise<T[]>
): Promise<CachedResult<T>> {
  try {
    const data = await loader();
    // Persistir la copia buena (no bloquear la respuesta si el guardado falla).
    ErpCacheModel.findByIdAndUpdate(
      view,
      { data, count: data.length, updatedAt: new Date() },
      { upsert: true }
    ).catch(() => {});
    return { data, stale: false, updatedAt: new Date() };
  } catch (err) {
    const cache = await ErpCacheModel.findById(view).lean();
    return {
      data: (cache?.data as T[]) || [],
      stale: true,
      updatedAt: cache?.updatedAt || null,
      error: (err as Error).message || "No se pudo conectar con el ERP",
    };
  }
}

/** Metadatos de todas las copias guardadas (para el panel de estado). */
export async function cacheStatus() {
  const rows = await ErpCacheModel.find().select("_id count updatedAt").lean();
  return rows.map((r) => ({ vista: r._id, registros: r.count, actualizado: r.updatedAt }));
}
