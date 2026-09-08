import { AsignacionInventarioModel } from "../models/asignacionInventario.model";
import { JwtPayload } from "../types/AuthRequest";

export interface AsignacionPublica {
  venCodigo: string;
  restringido: boolean;
  productos: string[];
  actualizadoPor?: string;
  updatedAt?: Date;
}

export function publica(a: any): AsignacionPublica {
  return {
    venCodigo: a.venCodigo,
    restringido: Boolean(a.restringido),
    productos: (a.productos || []).map(String),
    actualizadoPor: a.actualizadoPor,
    updatedAt: a.updatedAt,
  };
}

/** Asignación de un vendedor; si no existe, ve todo. */
export async function asignacionDe(venCodigo: string): Promise<AsignacionPublica> {
  const a = await AsignacionInventarioModel.findOne({ venCodigo }).lean();
  return a ? publica(a) : { venCodigo, restringido: false, productos: [] };
}

/**
 * Aplica la asignación al inventario: los admin ven todo; un vendedor
 * restringido sólo ve sus productos. Devuelve también el resumen para que la
 * app pueda explicarle al vendedor por qué ve menos.
 */
export async function filtrarInventario<T extends { pro_codigo: string | number }>(
  rows: T[],
  user?: JwtPayload
): Promise<{ data: T[]; asignacion: { restringido: boolean; productos: number } }> {
  if (!user || user.role !== "vendedor" || !user.venCodigo) {
    return { data: rows, asignacion: { restringido: false, productos: 0 } };
  }
  const a = await asignacionDe(user.venCodigo);
  if (!a.restringido) return { data: rows, asignacion: { restringido: false, productos: 0 } };
  const set = new Set(a.productos.map(String));
  return {
    data: rows.filter((r) => set.has(String(r.pro_codigo))),
    asignacion: { restringido: true, productos: a.productos.length },
  };
}
