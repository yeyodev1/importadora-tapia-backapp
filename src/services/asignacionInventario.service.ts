import { AsignacionInventarioModel } from "../models/asignacionInventario.model";
import { JwtPayload } from "../types/AuthRequest";

export interface AsignacionPublica {
  venCodigo: string;
  restringido: boolean;
  productos: string[];
  /** Bodega (bod_nombre) de la que vende; null = sin asignar. */
  bodega: string | null;
  actualizadoPor?: string;
  updatedAt?: Date;
}

export function publica(a: any): AsignacionPublica {
  return {
    venCodigo: a.venCodigo,
    restringido: Boolean(a.restringido),
    productos: (a.productos || []).map(String),
    bodega: a.bodega || null,
    actualizadoPor: a.actualizadoPor,
    updatedAt: a.updatedAt,
  };
}

/** Asignación de un vendedor; si no existe, ve todo. */
export async function asignacionDe(venCodigo: string): Promise<AsignacionPublica> {
  const a = await AsignacionInventarioModel.findOne({ venCodigo }).lean();
  return a ? publica(a) : { venCodigo, restringido: false, productos: [], bodega: null };
}

/**
 * Aplica la asignación al inventario: los admin ven todo; un vendedor ve sólo
 * el stock de su bodega (Quito o Guayaquil) y, si está restringido, sólo sus
 * productos. Devuelve también el resumen para que la app pueda explicarle al
 * vendedor por qué ve menos.
 */
export async function filtrarInventario<T extends { pro_codigo: string | number; bod_nombre?: string }>(
  rows: T[],
  user?: JwtPayload
): Promise<{ data: T[]; asignacion: { restringido: boolean; productos: number; bodega: string | null } }> {
  if (!user || user.role !== "vendedor" || !user.venCodigo) {
    return { data: rows, asignacion: { restringido: false, productos: 0, bodega: null } };
  }
  const a = await asignacionDe(user.venCodigo);
  let data = a.bodega ? rows.filter((r) => r.bod_nombre === a.bodega) : rows;
  if (a.restringido) {
    const set = new Set(a.productos.map(String));
    data = data.filter((r) => set.has(String(r.pro_codigo)));
  }
  return {
    data,
    asignacion: { restringido: a.restringido, productos: a.restringido ? a.productos.length : 0, bodega: a.bodega },
  };
}

/**
 * Un vendedor sólo vende de su bodega. Devuelve el mensaje de error, o null
 * si todas las líneas salen de la bodega asignada.
 */
export async function validarBodegaVendedor(
  items: { productoNombre: string; bodega?: string }[],
  user?: JwtPayload
): Promise<string | null> {
  if (!user || user.role !== "vendedor" || !user.venCodigo) return null;
  const { bodega } = await asignacionDe(user.venCodigo);
  if (!bodega) return "Aún no tienes una bodega asignada. Pide al administrador que te asigne tu bodega para poder vender.";
  const fuera = items.find((it) => it.bodega !== bodega);
  return fuera
    ? `${fuera.productoNombre} es de la bodega ${fuera.bodega || "sin bodega"}; solo puedes vender de ${bodega}.`
    : null;
}
