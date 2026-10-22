// Inspecciona la copia de la vista "clientes" guardada en Mongo (ErpCache),
// igual que erp-cache-inspect.cjs pero sobre los clientes.
// Uso: node scripts/clientes-cache-inspect.cjs [filtro nombre o RUC]
require("dotenv").config();
const mongoose = require("mongoose");

const filtro = (process.argv[2] || "ALVARADO").toUpperCase();

(async () => {
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 15000 });
  const col = mongoose.connection.collection("erpcaches");
  const ids = await col
    .find({ _id: /^clientes/ }, { projection: { count: 1, updatedAt: 1 } })
    .toArray();
  for (const meta of ids) {
    const doc = await col.findOne({ _id: meta._id });
    const rows = doc?.data || [];
    const hit = rows.filter(
      (r) =>
        String(r.per_nombre || "").toUpperCase().includes(filtro) ||
        String(r.per_identificacion || "").includes(filtro)
    );
    console.log(
      `${meta._id} · ${rows.length} filas · actualizado ${doc?.updatedAt?.toISOString?.() || doc?.updatedAt}`
    );
    for (const r of hit)
      console.log(
        `  -> ${r.per_codigo} | ${r.per_nombre} | ${r.per_identificacion} | ven ${r.ven_codigo ?? "?"}`
      );
    if (!hit.length) console.log(`  (sin coincidencias con '${filtro}')`);
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
