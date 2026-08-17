import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model";
import { JwtPayload, AuthRequest } from "../types/AuthRequest";

export const AuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ success: false, message: "Email y contraseña son requeridos" });
        return;
      }

      const user = await UserModel.findOne({
        email: String(email).trim().toLowerCase(),
      }).select("+password");

      if (!user || !(await user.comparePassword(String(password)))) {
        res.status(401).json({ success: false, message: "Credenciales inválidas" });
        return;
      }

      const payload: JwtPayload = {
        id: String(user._id),
        email: user.email,
        role: user.role,
        ...(user.venCodigo ? { venCodigo: user.venCodigo } : {}),
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
        expiresIn: "8h",
      });

      res.json({
        success: true,
        token,
        user: {
          id: String(user._id),
          email: user.email,
          name: user.name,
          role: user.role,
          venCodigo: user.venCodigo || null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /** Perfil del usuario autenticado (datos frescos de Mongo). */
  async me(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = await UserModel.findById(req.user?.id);
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }
      res.json({
        success: true,
        user: {
          id: String(user._id),
          email: user.email,
          name: user.name,
          role: user.role,
          venCodigo: user.venCodigo || null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
