import { Request } from "express";

export type UserRole = "admin" | "vendedor";

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  /** Código del vendedor en el ERP; sólo para role "vendedor". */
  venCodigo?: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}
