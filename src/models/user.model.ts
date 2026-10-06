import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import { UserRole } from "../types/AuthRequest";

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  /** Código del vendedor en el ERP (vw_crm_vendedores); requerido si role = vendedor. */
  venCodigo?: string;
  /**
   * Bodega (bod_nombre del ERP) que atiende un usuario de rol "bodega"; solo
   * ve los pedidos con productos de esa bodega. Vacío = ve todas las bodegas.
   */
  bodega?: string;
  /** Hash sha256 del token de "recuperar contraseña" (el token en claro solo viaja en el correo). */
  resetTokenHash?: string;
  /** Hasta cuándo sirve el token de recuperación (30 min desde que se pidió). */
  resetTokenExpira?: Date;
  /** Última vez que el usuario restableció su contraseña. */
  passwordCambiadaAt?: Date;
  /**
   * El admin pidió que la persona ponga su propio correo (p. ej. entra con uno
   * genérico de bodega). Mientras sea true la app la obliga a cambiarlo.
   */
  debeCambiarCorreo?: boolean;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["admin", "vendedor", "bodega"], default: "vendedor" },
    venCodigo: { type: String },
    bodega: { type: String, trim: true },
    resetTokenHash: { type: String, select: false, index: true, sparse: true },
    resetTokenExpira: { type: Date, select: false },
    passwordCambiadaAt: { type: Date },
    debeCambiarCorreo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const UserModel = mongoose.model<IUser>("User", userSchema);
