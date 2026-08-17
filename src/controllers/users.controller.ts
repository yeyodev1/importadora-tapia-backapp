import { Response, NextFunction } from "express";
import { UserModel } from "../models/user.model";
import { ErpService } from "../services/erp.service";
import { sendMail, welcomeEmail } from "../services/email.service";
import { AuthRequest } from "../types/AuthRequest";

function publicUser(u: any) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
    venCodigo: u.venCodigo || null,
    createdAt: u.createdAt,
  };
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
      const { email, password, role, venCodigo, name } = req.body || {};
      if (!email || !password || !role) {
        res.status(400).json({ success: false, message: "email, password y role son requeridos" });
        return;
      }
      if (!["admin", "vendedor"].includes(role)) {
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
        finalVenCodigo = String(venCodigo);
        finalName = finalName || erpName;
      }

      if (!finalName) {
        res.status(400).json({ success: false, message: "name es requerido para administradores" });
        return;
      }

      const user = await UserModel.create({
        email,
        password,
        name: finalName,
        role,
        venCodigo: finalVenCodigo,
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
      const { name, password, venCodigo } = req.body || {};
      const user = await UserModel.findById(req.params.id).select("+password");
      if (!user) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }

      if (name) user.name = name;
      if (password) user.password = password;
      if (venCodigo !== undefined && user.role === "vendedor") {
        const erpName = await vendedorFromErp(String(venCodigo));
        if (!erpName) {
          res.status(422).json({ success: false, message: `El vendedor ${venCodigo} no existe en el ERP` });
          return;
        }
        user.venCodigo = String(venCodigo);
      }

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
