// Inspecciona la última copia de las vistas del ERP guardada en Mongo (ErpCache).
// Uso (desde importadora-tapia-backapp): node scripts/erp-cache-inspect.cjs [filtro cliente]
require("dotenv").config();
const mongoose = require("mongoose");

const filtro = (process.argv[2] || "OCHOA VIDAL").toUpperCase();

(async () => {
  await mongoose.connect(process.env.DB_URI, { serverSelectionTimeoutMS: 15000 });
  const col = mongoose.connection.collection("erpcaches");
  const docs = await col.find({}, { projection: { count: 1, updatedAt: 1 } }).toArray();
  console.log("COPIAS:", JSON.stringify(docs, null, 1));

  for (const id of ["cartera_facturas", "cartera_consolidada"]) {
    const doc = await col.findOne({ _id: id });
    if (!doc) { console.log(id, "-> sin copia"); continue; }
    const rows = doc.data || [];
    console.log(`\n=== ${id} · ${rows.length} filas · actualizado ${doc.updatedAt}`);
    console.log("COLUMNAS:", rows[0] ? Object.keys(rows[0]).join(", ") : "(vacío)");
    const hit = rows.filter((r) => String(r.per_nombre || "").toUpperCase().includes(filtro));
    console.log(`FILAS '${filtro}':`, JSON.stringify(hit, null, 1));
    if (id === "cartera_facturas") {
      const tipos = {};
      for (const r of rows) {
        const k = Object.keys(r).filter((c) => /tip|tipo|comprob|doc/i.test(c) && !/numdoc|serdoc/.test(c));
        const key = k.map((c) => `${c}=${r[c]}`).join("|") || "(sin columna tipo)";
        tipos[key] = (tipos[key] || 0) + 1;
      }
      console.log("TIPOS:", JSON.stringify(tipos, null, 1));
    }
  }
  await mongoose.disconnect();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
