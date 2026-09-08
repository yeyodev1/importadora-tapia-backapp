// Descarga desde la API de producción la última copia de las vistas de cartera
// (en vivo si el túnel responde; si no, la copia guardada en Mongo).
// Uso: node scripts/prod-cache-dump.cjs <email admin> <password> [filtro cliente]
const API = process.env.API_BASE || "https://api.importadoratapia.app/api";
const [email, password, filtroArg] = process.argv.slice(2);
const filtro = (filtroArg || "OCHOA VIDAL").toUpperCase();

if (!email || !password) {
  console.error("Uso: node scripts/prod-cache-dump.cjs <email admin> <password> [filtro]");
  process.exit(1);
}

(async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const lj = await login.json();
  if (!login.ok || !lj.token) {
    console.error("LOGIN FALLÓ:", login.status, JSON.stringify(lj));
    process.exit(1);
  }
  const h = { authorization: `Bearer ${lj.token}` };

  const estado = await (await fetch(`${API}/estado/erp`, { headers: h })).json();
  console.log("ESTADO ERP:", JSON.stringify(estado, null, 1));

  for (const [name, path] of [
    ["cartera_facturas", "erp/cartera/facturas"],
    ["cartera_consolidada", "erp/cartera/consolidada"],
  ]) {
    const r = await (await fetch(`${API}/${path}`, { headers: h })).json();
    const rows = r.data || [];
    console.log(`\n=== ${name} · ${rows.length} filas · meta ${JSON.stringify(r.meta)}`);
    console.log("COLUMNAS:", rows[0] ? Object.keys(rows[0]).join(", ") : "(vacío)");
    const hit = rows.filter((x) => String(x.per_nombre || "").toUpperCase().includes(filtro));
    console.log(`FILAS '${filtro}':`, JSON.stringify(hit, null, 1));
    if (name === "cartera_facturas" && rows[0]) {
      const extra = Object.keys(rows[0]).filter(
        (c) => !["per_nombre","per_diascredito","trc_codigo","trc_serdoc","trc_numdoc","trc_totfact","trc_fecha","fecha_vencimiento","total_abonado","saldo_pendiente","estado_factura"].includes(c)
      );
      console.log("COLUMNAS NUEVAS:", extra.join(", ") || "(ninguna)");
      for (const c of extra) {
        const dist = {};
        for (const x of rows) dist[String(x[c])] = (dist[String(x[c])] || 0) + 1;
        console.log(`DISTINCT ${c}:`, JSON.stringify(dist));
      }
    }
  }
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
