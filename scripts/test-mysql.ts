import "dotenv/config";
import { checkConnection, getPool } from "../src/config/mysql";

const VIEWS = [
  "vw_crm_clientes",
  "vw_crm_vendedores",
  "vw_crm_cartera_facturas_2year",
  "vw_crm_cartera_consolidada",
  "vw_crm_inventario",
];

async function main() {
  const info = await checkConnection();
  console.log("USER():        ", info.user);
  console.log("CURRENT_USER():", info.currentUser);
  console.log("DATABASE():    ", info.db);
  console.log("Ssl_cipher:    ", info.sslCipher || "(vacío -> SESIÓN NO CIFRADA)");

  const pool = await getPool();
  for (const view of VIEWS) {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT COUNT(*) AS total FROM ${view}`
      );
      console.log(`${view}: ${rows[0].total} filas`);
    } catch (err: any) {
      console.log(`${view}: ERROR ${err.code} ${err.message}`);
    }
  }

  await pool.end();
  process.exit(info.sslEnabled ? 0 : 1);
}

main().catch((err) => {
  console.error("FALLO:", err.code || "", err.message);
  process.exit(1);
});
