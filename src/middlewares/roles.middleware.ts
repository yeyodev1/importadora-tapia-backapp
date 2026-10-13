import { Response, NextFunction } from "express";
import { AuthRequest, UserRole } from "../types/AuthRequest";
import { accesoDeUsuario } from "../services/bodegaUsuario.service";

/**
 * Deja pasar solo a los roles indicados (se usa después de authMiddleware).
 * Cuenta también las funciones extra que el admin le dio (p.ej. un vendedor
 * que despacha en bodega); esas se leen de la BD porque el token puede ser viejo.
 */
export function permitirRoles(...roles: UserRole[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user && roles.includes(req.user.role)) return next();
      if (req.user) {
        const { roles: suyos } = await accesoDeUsuario(req.user);
        if (suyos.some((r) => roles.includes(r))) return next();
      }
      res.status(403).json({ success: false, message: "Tu rol no tiene acceso a esta sección" });
    } catch (error) {
      next(error);
    }
  };
}

/** Bodega solo trabaja con pedidos, inventario y despachos: se le cierra el resto. */
export const sinBodega = permitirRoles("admin", "vendedor");
