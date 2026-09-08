// Consulta el ERP usando la misma conexión del backend (dist/config/mysql.js),
// que levanta el túnel cloudflared automáticamente si hace falta.
// Uso (desde importadora-tapia-backapp, con `npm run build` hecho):
//   node --tls-min-v1.0 scripts/erp-query.cjs "SQL1" "SQL2" ...
require("dotenv").config();
const path = require("path");
const { getPool } = require(path.join(__dirname, "..", "dist/config/mysql.js"));

(async () => {
  const out = [];
  try {
    const pool = await getPool();
    for (const sql of process.argv.slice(2)) {
      try {
        const [rows] = await pool.query(sql);
        out.push({ sql, rows });
      } catch (e) {
        out.push({ sql, error: e.message });
      }
    }
    await pool.end();
  } catch (e) {
    out.push({ fatal: e.message });
  }
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
