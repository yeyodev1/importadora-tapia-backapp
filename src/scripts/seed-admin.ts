import dotenv from "dotenv";
import { dbConnect } from "../config/mongo";
import { UserModel } from "../models/user.model";

/**
 * Crea o actualiza el usuario administrador.
 * Uso: npm run seed:admin [email] [password] [nombre]
 */
async function main() {
  dotenv.config();
  await dbConnect();

  const email = (process.argv[2] || "admin@bakano.ec").toLowerCase();
  const password = process.argv[3] || "123456789";
  const name = process.argv[4] || "Yeyo";

  let user = await UserModel.findOne({ email }).select("+password");
  if (user) {
    user.password = password;
    user.name = name;
    user.role = "admin";
    await user.save();
    console.log(`Usuario admin actualizado: ${email}`);
  } else {
    user = await UserModel.create({ email, password, name, role: "admin" });
    console.log(`Usuario admin creado: ${email}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
