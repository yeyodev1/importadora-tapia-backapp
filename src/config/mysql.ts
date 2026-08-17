import mysql from "mysql2/promise";
import net from "net";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import tls from "tls";
import { Duplex } from "stream";
import WebSocket from "ws";
import { spawn, ChildProcess } from "child_process";

/**
 * Conexión al ERP MySQL (Importadora Tapia) vía Cloudflare Tunnel.
 *
 * Modos:
 *  1) MYSQL_TUNNEL_HOSTNAME definido (desarrollo): se asegura un listener
 *     local de `cloudflared access tcp` en 127.0.0.1:MYSQL_TUNNEL_LOCAL_PORT
 *     (13306 por defecto). Si el puerto ya está escuchando (túnel abierto a
 *     mano) se reutiliza; si no, se lanza cloudflared como proceso hijo.
 *  2) Sin MYSQL_TUNNEL_HOSTNAME: conexión directa a MYSQL_HOST:MYSQL_PORT.
 *
 * TLS legado (MYSQL_LEGACY_TLS=true): el servidor del ERP sólo negocia TLSv1
 * y su intercambio DHE usa una clave demasiado pequeña ("dh key too small"),
 * así que se fuerza un cipher RSA (AES256-SHA) y renegociación legada.
 * mysql2 no propaga `secureOptions` a tls.createSecureContext, por eso se
 * parchea aquí. Retirar cuando el ERP habilite TLSv1.2 (solicitado 17-ago-2026).
 */

const LEGACY_CIPHERS = "ALL:!DHE:!EDH:@SECLEVEL=0";

function legacyTlsEnabled(): boolean {
  return process.env.MYSQL_LEGACY_TLS === "true";
}

let tlsPatched = false;
function applyLegacyTlsPatch(): void {
  if (tlsPatched) return;
  tlsPatched = true;

  const original = tls.createSecureContext;
  tls.createSecureContext = (options: tls.SecureContextOptions = {}) =>
    original({
      ...options,
      minVersion: "TLSv1",
      ciphers: options.ciphers || LEGACY_CIPHERS,
      secureOptions:
        (options.secureOptions || 0) |
        crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    });

  console.warn(
    "[MySQL] TLS legado habilitado (TLSv1 + cipher RSA): requerido por el ERP hasta que habiliten TLSv1.2"
  );
}

/**
 * Certificado público de la CA del ERP.
 * Se acepta en MYSQL_SSL_CA como PEM crudo o en base64 (más cómodo en Vercel),
 * o como archivo en MYSQL_SSL_CA_PATH / certs/ca.pem.
 */
function resolveCa(): string | undefined {
  const raw = process.env.MYSQL_SSL_CA;
  if (raw && raw.trim()) {
    if (raw.includes("BEGIN CERTIFICATE")) return raw.replace(/\\n/g, "\n");
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      if (decoded.includes("BEGIN CERTIFICATE")) return decoded;
    } catch {
      /* ignore */
    }
    console.warn("[MySQL] MYSQL_SSL_CA definido pero no parece un certificado PEM");
  }

  const caPath =
    process.env.MYSQL_SSL_CA_PATH || path.join(process.cwd(), "certs", "ca.pem");
  if (fs.existsSync(caPath)) return fs.readFileSync(caPath, "utf8");

  return undefined;
}

function resolveSsl(): mysql.PoolOptions["ssl"] {
  if (process.env.MYSQL_SSL === "false") return undefined;

  const legacy = legacyTlsEnabled();
  const base = legacy
    ? { minVersion: "TLSv1" as const, ciphers: LEGACY_CIPHERS }
    : { minVersion: "TLSv1.2" as const };

  const ca = resolveCa();
  if (ca) {
    // host = 127.0.0.1 (túnel) => mysql2 omite el chequeo de hostname,
    // pero la cadena contra la CA sí se valida.
    return { ...base, ca, rejectUnauthorized: true };
  }

  console.warn(
    "[MySQL] Sin CA (MYSQL_SSL_CA). Se cifra la sesión pero no se valida el certificado."
  );
  return { ...base, rejectUnauthorized: false };
}

function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 1500 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

let tunnelProcess: ChildProcess | null = null;

/**
 * Garantiza un listener local hacia el túnel y devuelve {host, port} a usar.
 * Reutiliza un `cloudflared access` ya abierto; si no existe, lo lanza.
 */
async function ensureTunnel(): Promise<{ host: string; port: number }> {
  const hostname = process.env.MYSQL_TUNNEL_HOSTNAME as string;
  const port = Number(process.env.MYSQL_TUNNEL_LOCAL_PORT) || 13306;
  const target = { host: "127.0.0.1", port };

  if (await isPortListening(port)) {
    console.log(`[MySQL] Reutilizando túnel local existente en 127.0.0.1:${port}`);
    return target;
  }

  console.log(
    `[MySQL] Lanzando cloudflared access tcp ${hostname} -> 127.0.0.1:${port}`
  );
  tunnelProcess = spawn(
    process.env.CLOUDFLARED_BIN || "cloudflared",
    ["access", "tcp", "--hostname", hostname, "--url", `127.0.0.1:${port}`],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  tunnelProcess.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[cloudflared] ${line}`);
  });
  tunnelProcess.once("exit", (code) => {
    console.warn(`[MySQL] cloudflared terminó (código ${code})`);
    tunnelProcess = null;
    poolPromise = null; // fuerza re-crear túnel y pool en la próxima consulta
  });
  tunnelProcess.unref();

  for (let attempt = 0; attempt < 30; attempt++) {
    if (await isPortListening(port)) return target;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `El túnel cloudflared no quedó escuchando en 127.0.0.1:${port}. ¿Está instalado cloudflared y activo el túnel ${hostname}?`
  );
}

/**
 * Envuelve un WebSocket al edge de Cloudflare (mismo canal que `cloudflared
 * access tcp`) en un Duplex que mysql2 usa como socket. Esto permite conectar
 * al MySQL del ERP desde CUALQUIER host (Vercel, cualquier nube) sin instalar
 * cloudflared ni depender de una máquina local: el túnel productor sigue
 * corriendo en la red de Tapia, y aquí sólo se consume por HTTPS/WSS.
 */
function createWsStream(url: string): Duplex {
  const ws = new WebSocket(url, { perMessageDeflate: false });
  ws.binaryType = "arraybuffer";

  const duplex = new Duplex({
    read() {},
    write(chunk: Buffer, _enc, cb) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk, (err) => cb(err ?? undefined));
      } else {
        ws.once("open", () => ws.send(chunk, (err) => cb(err ?? undefined)));
      }
    },
    destroy(err, cb) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      cb(err);
    },
  });

  // mysql2 usa net.Socket; emular la API mínima que consume.
  (duplex as any).setNoDelay = () => duplex;
  (duplex as any).setTimeout = () => duplex;
  (duplex as any).ref = () => duplex;
  (duplex as any).unref = () => duplex;

  ws.on("message", (data: ArrayBuffer | Buffer) => {
    duplex.push(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
  });
  ws.on("open", () => duplex.emit("connect"));
  ws.on("close", () => duplex.push(null));
  ws.on("error", (err) => duplex.destroy(err));

  return duplex;
}

let poolPromise: Promise<mysql.Pool> | null = null;

async function createPool(): Promise<mysql.Pool> {
  if (legacyTlsEnabled()) applyLegacyTlsPatch();

  const base: mysql.PoolOptions = {
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    ssl: resolveSsl(),
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE) || 5,
    queueLimit: 0,
    connectTimeout: 20000,
    enableKeepAlive: true,
  };

  // Modo nube: túnel consumido por WebSocket (no requiere cloudflared local).
  const wsUrl = process.env.MYSQL_TUNNEL_WS_URL;
  if (wsUrl) {
    console.log(`[MySQL] Conexión vía WebSocket al túnel: ${wsUrl}`);
    return mysql.createPool({
      ...base,
      // mysql2 llama esta función por cada conexión del pool.
      stream: () => createWsStream(wsUrl) as any,
    });
  }

  // Modo local: cloudflared access levanta un listener TCP en 127.0.0.1.
  let host = process.env.MYSQL_HOST || "127.0.0.1";
  let port = Number(process.env.MYSQL_PORT) || 3306;

  if (process.env.MYSQL_TUNNEL_HOSTNAME) {
    const tunnel = await ensureTunnel();
    host = tunnel.host;
    port = tunnel.port;
  } else {
    console.warn(
      "[MySQL] Sin túnel configurado: conexión directa (sólo válida dentro de la red del ERP)."
    );
  }

  return mysql.createPool({ ...base, host, port });
}

/** Pool perezoso: el túnel queda escuchando antes de abrir cualquier conexión. */
export function getPool(): Promise<mysql.Pool> {
  if (!poolPromise) {
    poolPromise = createPool().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

/** Diagnóstico pedido por el proveedor: usuario efectivo y cifrado de la sesión. */
export async function checkConnection() {
  const pool = await getPool();
  const [identity] = await pool.query<any[]>(
    "SELECT USER() AS user, CURRENT_USER() AS currentUser, DATABASE() AS db"
  );
  const [cipher] = await pool.query<any[]>(
    "SHOW SESSION STATUS LIKE 'Ssl_cipher'"
  );
  const sslCipher = cipher?.[0]?.Value || "";

  return {
    ...identity[0],
    sslCipher,
    sslEnabled: Boolean(sslCipher),
  };
}
