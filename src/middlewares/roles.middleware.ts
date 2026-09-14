import { Response, NextFunction } from "express";
import { AuthRequest, UserRole } from "../types/AuthRequest";

/** Deja pasar solo a los roles indicados (se usa después de authMiddleware). */
export function permitirRoles(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "Tu rol no tiene acceso a esta sección" });
      return;
    }
    next();
  };
}

/** Bodega solo trabaja con pedidos, inventario y despachos: se le cierra el resto. */
export const sinBodega = permitirRoles("admin", "vendedor");
