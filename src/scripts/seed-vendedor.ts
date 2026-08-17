import dotenv from "dotenv";
import { dbConnect } from "../config/mongo";
import { UserModel } from "../models/user.model";
import { ErpService } from "../services/erp.service";

/**
 * Crea o actualiza la cuenta de un vendedor, validando su código contra el ERP.
 * Uso: npm run seed:vendedor <email> <password> <ven_codigo> [nombre]
 */
async function main() {
  dotenv.config();

  const email = (process.argv[2] || "").toLowerCase();
  const password = process.argv[3];
  const venCodigo = process.argv[4];

  if (!email || !password || !venCodigo) {
    console.error("Uso: npm run seed:vendedor <email> <password> <ven_codigo> [nombre]");
    process.exit(1);
  }

  await dbConnect();

  const vendedores = (await ErpService.getVendedores(venCodigo)) as Array<{
    ven_codigo: string;
    ven_nombre: string;
  }>;
  if (!vendedores.length) {
    console.error(`No existe el vendedor ${venCodigo} en el ERP. Ejecuta sin crear.`);
    process.exit(1);
  }

  const name = process.argv[5] || vendedores[0].ven_nombre;

  let user = await UserModel.findOne({ email }).select("+password");
  if (user) {
    user.password = password;
    user.name = name;
    user.role = "vendedor";
    user.venCodigo = venCodigo;
    await user.save();
    console.log(`Vendedor actualizado: ${email} -> ${name} (código ${venCodigo})`);
  } else {
    user = await UserModel.create({ email, password, name, role: "vendedor", venCodigo });
    console.log(`Vendedor creado: ${email} -> ${name} (código ${venCodigo})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
