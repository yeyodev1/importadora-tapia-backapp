// Valida la cartera que entrega el backend (misma lógica que la API) contra
// los reportes "Cuentas por cobrar" del sistema de Tapia.
// Uso (con `npm run build` hecho): node --tls-min-v1.0 scripts/validar-cartera.cjs [nombre1] [nombre2] ...
require("dotenv").config();
const path = require("path");
const { ErpService } = require(path.join(__dirname, "..", "dist/services/erp.service.js"));
const { getPool } = require(path.join(__dirname, "..", "dist/config/mysql.js"));

const nombres = process.argv.slice(2).length ? process.argv.slice(2) : ["ECONESPECIAS", "OCHOA VIDAL"];
const money = (n) => Number(n || 0).toFixed(2);

(async () => {
  const facturas = await ErpService.getCarteraFacturas();
  const consolidada = await ErpService.getCarteraConsolidada();
  console.log(`FACTURAS DE VENTA (2 años): ${facturas.length} · CLIENTES CON DEUDA: ${consolidada.length}`);
  console.log(`CARTERA TOTAL: ${money(consolidada.reduce((s, c) => s + Number(c.deuda_total), 0))}`);
  const tipos = {};
  for (const f of facturas) tipos[f.descripcion_tipdoc] = (tipos[f.descripcion_tipdoc] || 0) + 1;
  console.log("TIPOS PRESENTES:", JSON.stringify(tipos));

  for (const n of nombres) {
    const up = n.toUpperCase();
    const fs = facturas.filter((f) => String(f.per_nombre).toUpperCase().includes(up));
    const c = consolidada.find((x) => String(x.per_nombre).toUpperCase().includes(up));
    console.log(`\n=== ${n}`);
    for (const f of fs) {
      console.log(`  ${f.numero_factura_impreso.padEnd(14)} ${String(f.trc_fecha).slice(0, 10)}  total ${money(f.trc_totfact).padStart(10)}  abono ${money(f.total_abonado).padStart(9)}  saldo ${money(f.saldo_pendiente).padStart(10)}`);
    }
    console.log(`  facturas: ${fs.length} · suma saldos: ${money(fs.reduce((s, f) => s + Number(f.saldo_pendiente), 0))} · deuda_total consolidada: ${c ? money(c.deuda_total) : "0.00 (sin deuda)"}`);
  }
  const pool = await getPool();
  await pool.end();
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
