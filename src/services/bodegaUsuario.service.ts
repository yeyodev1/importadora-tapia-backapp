import { UserModel } from "../models/user.model";
import { JwtPayload } from "../types/AuthRequest";

/**
 * Bodega que atiende el usuario de rol "bodega" (p.ej. el bodeguero de Quito).
 * Se lee de la BD y no del token: los tokens viejos no la traen y el admin
 * puede cambiarla en cualquier momento. null = ve todas las bodegas (como
 * Josué en Guayaquil) o el usuario no es de bodega.
 */
export async function bodegaDeUsuario(user?: JwtPayload): Promise<string | null> {
  if (user?.role !== "bodega") return null;
  const u = await UserModel.findById(user.id).select("bodega").lean();
  return u?.bodega || null;
}

/** Filtro Mongo: pedidos con al menos un producto de la bodega. */
export function filtroPorBodega(bodega: string | null): Record<string, unknown> {
  return bodega ? { "items.bodega": bodega } : {};
}

/** true si el pedido tiene algún producto de la bodega (o si no hay bodega asignada). */
export function pedidoEsDeBodega(items: { bodega?: string }[], bodega: string | null): boolean {
  return !bodega || items.some((it) => it.bodega === bodega);
}
