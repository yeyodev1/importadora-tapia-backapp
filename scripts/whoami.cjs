// Muestra con qué rol entra una cuenta en la API de producción y, si es admin, lista las cuentas.
// Uso: node scripts/whoami.cjs <email> <password>
const API = process.env.API_BASE || "https://api.importadoratapia.app/api";
const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Uso: node scripts/whoami.cjs <email> <password>");
  process.exit(1);
}

(async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok || !j.token) {
    console.log("LOGIN FALLÓ:", r.status, JSON.stringify(j));
    return;
  }
  console.log("SESIÓN:", JSON.stringify(j.user));
  const u = await fetch(`${API}/users`, { headers: { authorization: `Bearer ${j.token}` } });
  const uj = await u.json();
  if (!u.ok) {
    console.log("LISTAR USUARIOS:", u.status, JSON.stringify(uj), "(esta cuenta no es admin)");
    return;
  }
  console.log("CUENTAS EXISTENTES:");
  for (const x of uj.data) console.log(` - ${x.role.padEnd(8)} ${x.email.padEnd(32)} ${x.name}${x.venCodigo ? ` (vendedor ERP ${x.venCodigo})` : ""}`);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
