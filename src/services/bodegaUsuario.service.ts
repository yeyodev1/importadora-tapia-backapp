import mongoose from "mongoose";
import { UserModel } from "../models/user.model";
import { JwtPayload, UserRole } from "../types/AuthRequest";

/** Roles efectivos del usuario: el principal más las funciones extra que le dio el admin. */
export function rolesDe(u?: { role?: UserRole; rolesExtra?: UserRole[] } | null): UserRole[] {
  if (!u?.role) return [];
  return [u.role, ...(u.rolesExtra || []).filter((r) => r !== u.role)];
}

/**
 * Funciones extra y bodega leídas de la BD, no del token: el admin puede
 * dárselas o quitárselas en cualquier momento y el token dura 8 h.
 */
export async function accesoDeUsuario(user?: JwtPayload): Promise<{ roles: UserRole[]; bodega: string | null }> {
  if (!user?.id || !mongoose.isValidObjectId(user.id)) return { roles: rolesDe(user), bodega: null };
  const u = await UserModel.findById(user.id).select("role rolesExtra bodega").lean();
  if (!u) return { roles: [], bodega: null };
  const roles = rolesDe(u);
  return { roles, bodega: roles.includes("bodega") ? u.bodega || null : null };
}

/**
 * Bodega que atiende quien despacha (rol bodega o vendedor con función de
 * bodega), p.ej. el bodeguero de Quito. null = ve todas las bodegas (como
 * Josué en Guayaquil) o el usuario no despacha.
 */
export async function bodegaDeUsuario(user?: JwtPayload): Promise<string | null> {
  if (user?.role !== "bodega" && user?.role !== "vendedor") return null;
  return (await accesoDeUsuario(user)).bodega;
}

/** Filtro Mongo: pedidos con al menos un producto de la bodega. */
export function filtroPorBodega(bodega: string | null): Record<string, unknown> {
  return bodega ? { "items.bodega": bodega } : {};
}

/**
 * Qué pedidos ve el usuario: admin todos; vendedor los suyos; bodega los de
 * su bodega. Un vendedor que también despacha ve los suyos y los de su bodega.
 */
export async function filtroPedidosDe(user?: JwtPayload): Promise<Record<string, unknown>> {
  if (!user || user.role === "admin") return {};
  const { roles, bodega } = await accesoDeUsuario(user);
  const despacha = roles.includes("bodega");
  if (user.role === "vendedor") {
    if (!despacha) return { vendedorId: user.id };
    return bodega ? { $or: [{ vendedorId: user.id }, filtroPorBodega(bodega)] } : {};
  }
  return filtroPorBodega(bodega);
}

/** true si el pedido tiene algún producto de la bodega (o si no hay bodega asignada). */
export function pedidoEsDeBodega(items: { bodega?: string }[], bodega: string | null): boolean {
  return !bodega || items.some((it) => it.bodega === bodega);
}
