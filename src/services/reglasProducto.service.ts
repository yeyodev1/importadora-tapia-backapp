import { ReglaProductoModel } from "../models/reglaProducto.model";

/** Códigos de producto que sólo se venden al contado. */
export async function codigosSoloContado(): Promise<Set<string>> {
  const rows = await ReglaProductoModel.find({ soloContado: true }).select("proCodigo").lean();
  return new Set(rows.map((r) => String(r.proCodigo)));
}

/** Agrega `solo_contado` a cada fila del inventario para que la app lo muestre. */
export async function marcarSoloContado<T extends { pro_codigo: string | number }>(
  rows: T[]
): Promise<(T & { solo_contado: boolean })[]> {
  const set = await codigosSoloContado();
  return rows.map((r) => ({ ...r, solo_contado: set.has(String(r.pro_codigo)) }));
}

/**
 * Si el pedido es a crédito (plazo > 0) y trae productos "solo contado",
 * devuelve el mensaje de error; null si todo está bien.
 */
export async function validarSoloContado(
  items: { productoCodigo: string; productoNombre: string }[],
  plazoCreditoDias: number
): Promise<string | null> {
  if (plazoCreditoDias <= 0) return null;
  const set = await codigosSoloContado();
  const bloqueados = items.filter((i) => set.has(String(i.productoCodigo)));
  if (!bloqueados.length) return null;
  const nombres = bloqueados.map((b) => b.productoNombre).join(", ");
  return `Solo se vende al contado: ${nombres}. Cambia el plazo a "Contado" o quita ese producto.`;
}
