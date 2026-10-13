import { Response, NextFunction } from "express";
import { UserModel } from "../models/user.model";
import { ErpService } from "../services/erp.service";
import { sendMail, welcomeEmail } from "../services/email.service";
import { AuthRequest, UserRole } from "../types/AuthRequest";

function publicUser(u: any) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
    rolesExtra: u.rolesExtra || [],
    venCodigo: u.venCodigo || null,
    bodega: u.bodega || null,
    debeCambiarCorreo: Boolean(u.debeCambiarCorreo),
    createdAt: u.createdAt,
  };
}

/**
 * Funciones extra que el admin le suma al rol principal. Hoy solo un vendedor
 * puede además despachar en bodega (p.ej. el jefe de bodega de Quito que vende).
 */
function rolesExtraPara(role: string, rolesExtra: unknown): UserRole[] {
  if (role !== "vendedor" || !Array.isArray(rolesExtra)) return [];
  return rolesExtra.includes("bodega") ? ["bodega"] : [];
}

/**
 * Bodega (bod_nombre) que atiende quien despacha (rol bodega o vendedor con
 * función de bodega); vacío = ve todas las bodegas.
 */
function bodegaPara(role: string, rolesExtra: UserRole[], bodega: unknown): string | undefined {
  if (role !== "bodega" && !rolesExtra.includes("bodega")) return undefined;
  const b = String(bodega ?? "").trim();
  return b || undefined;
}

/** Valida que el código exista en el ERP y devuelve el nombre del vendedor. */
async function vendedorFromErp(venCodigo: string): Promise<string | null> {
  const rows = (await ErpService.getVendedores(venCodigo)) as Array<{ ven_nombre: string }>;
  return rows.length ? rows[0].ven_nombre : null;
}

export const UsersController = {
  async list(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const users = await UserModel.find().sort({ role: 1, name: 1 });
      res.json({ success: true, data: users.map(publicUser) });
    } catch (error) {
      next(error);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password, role, venCodigo, name, bodega, rolesExtra } = req.body || {};
      if (!email || !password || !role) {
        res.status(400).json({ success: false, message: "email, password y role son requeridos" });
        return;
      }
      if (!["admin", "vendedor", "bodega"].includes(role)) {
        res.status(400).json({ success: false, message: "role inválido" });
        return;
      }

      const exists = await UserModel.findOne({ email: String(email).toLowerCase() });
      if (exists) {
        res.status(409).json({ success: false, message: "Ya existe un usuario con ese correo" });
        return;
      }

      let finalName = name;
      let finalVenCodigo: string | undefined;

      if (role === "vendedor") {
        if (!venCodigo) {
          res.status(400).json({ success: false, message: "Un vendedor requiere venCodigo del ERP" });
          return;
        }
        const erpName = await vendedorFromErp(String(venCodigo));
        if (!erpName) {
          res.status(422).json({ success: false, message: `El vendedor ${venCodigo} no existe en el ERP` });
          return;
        }
        finalVenCodigo = String(venCodigo).trim();
        finalName = finalName || erpName;
      }

      if (!finalName) {
        res.status(400).json({ success: false, message: "El nombre es requerido" });
        return;
      }

      const extras = rolesExtraPara(role, rolesExtra);
      const user = await UserModel.create({
        email,
        password,
        name: finalName,
        role,
        venCodigo: finalVenCodigo,
        rolesExtra: extras.length ? extras : undefined,
        bodega: bodegaPara(role, extras, bodega),
      });

      // Correo de bienvenida con credenciales; si falla no bloquea la creación.
      const mail = welcomeEmail({ name: finalName, email: user.email, password, role });
      const emailSent = await sendMail({ to: user.email, ...mail });

      res.status(201).json({ success: true, emailSent, data: publicUser(user) });
    } catch (error) {
      next(error);
    }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, name, password, venCodigo, bodega, debeCambiarCorreo, rolesExtra } = req.body || {};
      const user = await UserModel.findById(req.params.id).select("+password");
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }

      // Cambio de correo (usuario de acceso): formato válido y sin repetir.
      if (email !== undefined) {
        const nuevo = String(email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo)) {
          res.status(400).json({ success: false, message: "Correo inválido" });
          return;
        }
        if (nuevo !== user.email) {
          const ocupado = await UserModel.findOne({ email: nuevo, _id: { $ne: user._id } });
          if (ocupado) {
            res.status(409).json({ success: false, message: "Ya existe un usuario con ese correo" });
            return;
          }
          user.email = nuevo;
        }
      }
      if (name) user.name = name;
      if (password) user.password = password;
      if (venCodigo !== undefined && user.role === "vendedor") {
        const erpName = await vendedorFromErp(String(venCodigo));
        if (!erpName) {
          res.status(422).json({ success: false, message: `El vendedor ${venCodigo} no existe en el ERP` });
          return;
        }
        user.venCodigo = String(venCodigo).trim();
      }
      // Funciones extra (p.ej. vendedor que también despacha en bodega).
      if (rolesExtra !== undefined) {
        const extras = rolesExtraPara(user.role, rolesExtra);
        user.set("rolesExtra", extras.length ? extras : undefined);
      }
      // Bodega que atiende (rol bodega o quien despacha); a los demás se les limpia.
      const extrasActuales = (user.rolesExtra || []) as UserRole[];
      if (bodega !== undefined || (user.role !== "bodega" && !extrasActuales.includes("bodega"))) {
        user.set("bodega", bodegaPara(user.role, extrasActuales, bodega ?? user.bodega));
      }

      // Pedir (o cancelar el pedido) que la persona ponga su propio correo.
      if (typeof debeCambiarCorreo === "boolean") user.debeCambiarCorreo = debeCambiarCorreo;

      await user.save();
      res.json({ success: true, data: publicUser(user) });
    } catch (error) {
      next(error);
    }
  },

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (req.user?.id === req.params.id) {
        res.status(400).json({ success: false, message: "No puedes eliminar tu propia cuenta" });
        return;
      }
      const user = await UserModel.findByIdAndDelete(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};
