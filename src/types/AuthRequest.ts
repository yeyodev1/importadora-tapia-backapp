import { Request } from "express";

export type UserRole = "admin" | "vendedor" | "bodega";

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  /** Código del vendedor en el ERP; sólo para role "vendedor". */
  venCodigo?: string;
  /**
   * Bodega asignada (solo role "bodega"). Los tokens viejos no la traen: para
   * filtrar se lee del usuario en BD (services/bodegaUsuario.service.ts).
   */
  bodega?: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}
