import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ success: false, message: "Requiere rol administrador" });
    return;
  }
  next();
}
