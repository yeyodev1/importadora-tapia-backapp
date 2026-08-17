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
    role: { type: String, enum: ["admin", "vendedor"], default: "vendedor" },
    venCodigo: { type: String },
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
