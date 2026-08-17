# Conexión ERP MySQL (Importadora Tapia) vía Cloudflare Tunnel

Validada el 17-ago-2026. Referencia para desarrollo del MVP.

## Datos de conexión

| Dato | Valor |
|---|---|
| Túnel Cloudflare | `mysql-crm-tapia` (cuenta "bakano town") |
| Hostname público | `mysql-crm.bakano.ec` |
| Equipo del túnel (red Tapia) | `192.168.1.39` — debe estar encendido 24/7 |
| Base de datos | `dbimcatabe` |
| Usuario | `crm_user` (solo SELECT, origen 192.168.1.39, REQUIRE SSL) |
| Contraseña | en `.env` (`MYSQL_PASSWORD`) |
| CA | `certs/ca.pem` (CN=IMCATABE-MySQL-CA) |

## Cómo conectar en desarrollo local

1. Abrir túnel local (dejar corriendo):

```bash
cloudflared access tcp --hostname mysql-crm.bakano.ec --url 127.0.0.1:13306
```

2. Conectar a `127.0.0.1:13306` con mysql2. **El servidor solo habla TLSv1 con cifrado legado** — config obligatoria:

```js
import crypto from "node:crypto";
import tls from "node:tls";

// mysql2 no propaga secureOptions: parchear el contexto TLS antes de conectar.
const orig = tls.createSecureContext;
tls.createSecureContext = (opts = {}) =>
  orig({
    ...opts,
    minVersion: "TLSv1",
    ciphers: opts.ciphers || "ALL:!DHE:!EDH:@SECLEVEL=0", // fuerza AES256-SHA (kex RSA); el DHE del servidor es inválido
    secureOptions:
      (opts.secureOptions || 0) | crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  });

const conn = await mysql.createConnection({
  host: "127.0.0.1",
  port: 13306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  ssl: { ca: fs.readFileSync("certs/ca.pem", "utf8"), rejectUnauthorized: true },
  connectTimeout: 15000,
});
```

3. Ejecutar Node con `--tls-min-v1.0`:

```bash
node --tls-min-v1.0 dist/index.js
# o en package.json:  "start": "node --tls-min-v1.0 ..."
```

Script de prueba funcional completo: `scratchpad/test-mysql-tunnel.mjs` (sesión Claude fd8e2a57) — replicar su config.

## Vistas disponibles (solo lectura)

| Vista | Filas (17-ago) |
|---|---|
| `vw_crm_clientes` | 1.312 |
| `vw_crm_vendedores` | 13 |
| `vw_crm_cartera_facturas_2year` | 544 |
| `vw_crm_cartera_consolidada` | 420 |
| `vw_crm_inventario` | 49 |

Validación de sesión: `USER()` → `crm_user@192.168.1.39`, `Ssl_cipher` → `AES256-SHA`.

## MVP — qué se puede hacer ya

- ✅ Desarrollo local completo: los 5 endpoints sobre las vistas, con el túnel local corriendo.
- ✅ Demo desde tu máquina.
- ⚠️ Producción en Vercel: **no resuelto todavía.** Vercel serverless no puede mantener `cloudflared access`. Plan: Hyperdrive + Worker en cuenta "bakano town", PERO Hyperdrive muy probablemente rechaza TLSv1/ciphers legados del ERP.

## Pendientes producción

1. Pedir a Andrés habilitar **TLSv1.2** en el MySQL (recomendado — simplifica todo; pedirlo ahora que está colaborando).
2. Alternativa si no: host puente propio (VM pequeña) que corra `cloudflared access` + exponga el MySQL al backend, o Worker con socket TCP directo al túnel.
3. Limpiar del `.env` y `src/config/mysql.ts` lo obsoleto: Hamachi (`25.58.189.51`) y proxy Fixie.
4. Aceptar invitación a cuenta Cloudflare "bakano town" (expira 19-ago-2026).
