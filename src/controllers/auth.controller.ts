import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { UserModel, IUser } from "../models/user.model";
import { JwtPayload, AuthRequest } from "../types/AuthRequest";
import { sendMail } from "../services/email.service";
import { recuperarContrasenaEmail, contrasenaCambiadaEmail } from "../services/passwordReset.email";
import { correoNuevoEmail, correoAnteriorEmail } from "../services/cambioCorreo.email";

/** Vigencia del enlace de recuperación. */
const RESET_TTL_MS = 30 * 60 * 1000;
const MENSAJE_OLVIDE = "Si el correo está registrado, te llegará un enlace para restablecer tu contraseña.";
const ENLACE_INVALIDO = "El enlace no es válido o ya expiró. Pide uno nuevo.";

/** En BD solo se guarda el sha256 del token; el token en claro va únicamente en el correo. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Misma regla que el front: mínimo 8 caracteres, con al menos una letra y un número. */
export function validarContrasena(pw: string): string | null {
  if (pw.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (pw.length > 72) return "La contraseña no puede tener más de 72 caracteres";
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(pw) || !/\d/.test(pw)) return "La contraseña debe tener al menos una letra y un número";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** JWT de sesión (8 h). El payload lleva el email, por eso se re-firma al cambiarlo. */
function firmarToken(user: IUser): string {
  const payload: JwtPayload = {
    id: String(user._id),
    email: user.email,
    role: user.role,
    ...(user.venCodigo ? { venCodigo: user.venCodigo } : {}),
    ...(user.role === "bodega" && user.bodega ? { bodega: user.bodega } : {}),
  };
  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: "8h" });
}

/** Datos del usuario que ve el front (login, /auth/me y cambio de correo). */
function usuarioPublico(user: IUser) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    venCodigo: user.venCodigo || null,
    bodega: user.bodega || null,
    debeCambiarCorreo: Boolean(user.debeCambiarCorreo),
  };
}

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

      res.json({ success: true, token: firmarToken(user), user: usuarioPublico(user) });
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
      res.json({ success: true, user: usuarioPublico(user) });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Pide el enlace de recuperación. Responde SIEMPRE lo mismo, exista o no el
   * correo, y hace el mismo trabajo en ambos casos (una sola consulta que
   * reemplaza el token vigente); el correo sale sin esperar.
   */
  async olvideContrasena(req: Request, res: Response, next: NextFunction) {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const token = crypto.randomBytes(32).toString("hex");

      if (email && email.length <= 254) {
        const user = await UserModel.findOneAndUpdate(
          { email },
          { $set: { resetTokenHash: hashToken(token), resetTokenExpira: new Date(Date.now() + RESET_TTL_MS) } },
          { new: true }
        );
        if (user) {
          const mail = recuperarContrasenaEmail({ name: user.name, token });
          sendMail({ to: user.email, ...mail }).catch(() => undefined);
        }
      }

      res.json({ success: true, message: MENSAJE_OLVIDE });
    } catch (error) {
      next(error);
    }
  },

  /** Cambia la contraseña con el token del correo (uso único, 30 min). */
  async restablecerContrasena(req: Request, res: Response, next: NextFunction) {
    try {
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");

      if (!/^[a-f0-9]{64}$/.test(token)) {
        res.status(400).json({ success: false, message: ENLACE_INVALIDO });
        return;
      }
      const error = validarContrasena(password);
      if (error) {
        res.status(400).json({ success: false, message: error });
        return;
      }

      // Se "consume" el token de forma atómica: dos envíos simultáneos no
      // pueden usar el mismo enlace.
      const user = await UserModel.findOneAndUpdate(
        { resetTokenHash: hashToken(token), resetTokenExpira: { $gt: new Date() } },
        { $unset: { resetTokenHash: 1, resetTokenExpira: 1 } },
        { new: true }
      );
      if (!user) {
        res.status(400).json({ success: false, message: ENLACE_INVALIDO });
        return;
      }

      const ahora = new Date();
      user.password = password; // el pre-save la hashea
      user.passwordCambiadaAt = ahora;
      await user.save();

      const mail = contrasenaCambiadaEmail({ name: user.name, fecha: ahora });
      sendMail({ to: user.email, ...mail }).catch(() => undefined);

      res.json({ success: true, message: "Tu contraseña fue actualizada. Ya puedes iniciar sesión." });
    } catch (error) {
      next(error);
    }
  },

  /**
   * El usuario cambia su propio correo de acceso. Exige la contraseña actual,
   * apaga el pedido del admin (debeCambiarCorreo) y devuelve un token nuevo
   * porque el anterior lleva el correo viejo. Avisa a ambos correos.
   */
  async cambiarCorreo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const nuevo = String(req.body?.nuevoEmail || "").trim().toLowerCase();
      const password = String(req.body?.password || "");

      if (!nuevo || !password) {
        res.status(400).json({ success: false, message: "Escribe tu nuevo correo y tu contraseña actual" });
        return;
      }
      if (nuevo.length > 254 || !EMAIL_RE.test(nuevo)) {
        res.status(400).json({ success: false, message: "El correo no es válido" });
        return;
      }

      const user = await UserModel.findById(req.user?.id).select("+password");
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }
      // 400 y no 401: el front cierra la sesión ante cualquier 401.
      if (!(await user.comparePassword(password))) {
        res.status(400).json({ success: false, message: "La contraseña actual no es correcta" });
        return;
      }
      if (nuevo === user.email) {
        res.status(400).json({ success: false, message: "Ese ya es tu correo actual. Escribe uno distinto." });
        return;
      }
      const ocupado = await UserModel.exists({ email: nuevo, _id: { $ne: user._id } });
      if (ocupado) {
        res.status(409).json({ success: false, message: "Ese correo ya lo usa otra cuenta del CRM" });
        return;
      }

      const anterior = user.email;
      user.email = nuevo;
      user.debeCambiarCorreo = false;
      try {
        await user.save();
      } catch (err: any) {
        // Carrera con otro registro que tomó el mismo correo (índice único).
        if (err?.code === 11000) {
          res.status(409).json({ success: false, message: "Ese correo ya lo usa otra cuenta del CRM" });
          return;
        }
        throw err;
      }

      // Correos sin bloquear la respuesta.
      sendMail({ to: nuevo, ...correoNuevoEmail({ name: user.name, nuevo }) }).catch(() => undefined);
      sendMail({ to: anterior, ...correoAnteriorEmail({ name: user.name, nuevo, fecha: new Date() }) }).catch(
        () => undefined
      );

      res.json({
        success: true,
        message: `Desde ahora entra con ${nuevo}`,
        token: firmarToken(user),
        user: usuarioPublico(user),
      });
    } catch (error) {
      next(error);
    }
  },
};
