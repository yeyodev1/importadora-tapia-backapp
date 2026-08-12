import mysql from "mysql2/promise";
import net from "net";
import fs from "fs";
import path from "path";
import { SocksClient } from "socks";

/**
 * Conexión al ERP MySQL (Importadora Tapia).
 *
 * El servidor sólo acepta conexiones desde las IPs de salida de Fixie
 * (3.224.144.155 / 3.223.196.67) y exige SSL/TLS para el usuario crm_user.
 *
 * Como mysql2 NO soporta un `stream` asíncrono (lib/base/connection.js hace
 * `this.stream = config.stream(opts)` de forma síncrona), no se puede pasar el
 * socket SOCKS directamente. En su lugar levantamos un relay TCP local que
 * reenvía cada conexión por el proxy SOCKS5 de Fixie. El handshake TLS de
 * MySQL viaja end-to-end dentro de ese túnel, así que la sesión queda cifrada.
 */

type ProxyConfig = {
  host: string;
  port: number;
  userId: string;
  password: string;
};

function resolveProxy(): ProxyConfig | null {
  const envUrl = process.env.FIXIE_URL || process.env.FIXIE_SOCKS_HOST;
  if (!envUrl) return null;

  let host = "century.usefixie.com";
  let port = Number(process.env.FIXIE_SOCKS_PORT) || 1080;
  let userId = "fixie";
  let password = "";

  if (envUrl.includes("@")) {
    try {
      const url = new URL(envUrl.includes("://") ? envUrl : `socks5://${envUrl}`);
      userId = decodeURIComponent(url.username) || userId;
      password = decodeURIComponent(url.password);
      host = url.hostname;
      if (url.port) port = Number(url.port);
    } catch {
      console.warn("[MySQL] No se pudo parsear FIXIE_URL");
    }
  } else {
    host = envUrl;
  }

  if (process.env.FIXIE_SOCKS_USER) userId = process.env.FIXIE_SOCKS_USER;
  if (process.env.FIXIE_SOCKS_PASS) password = process.env.FIXIE_SOCKS_PASS;

  return { host, port, userId, password };
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

  const ca = resolveCa();
  if (ca) {
    // host = 127.0.0.1 (relay) => mysql2 omite el chequeo de hostname,
    // pero la cadena contra la CA sí se valida.
    return { ca, minVersion: "TLSv1.2", rejectUnauthorized: true };
  }

  console.warn(
    "[MySQL] Sin CA (MYSQL_SSL_CA). Se cifra la sesión pero no se valida el certificado."
  );
  return { rejectUnauthorized: false, minVersion: "TLSv1.2" };
}

/** Levanta el relay local y devuelve el puerto efímero donde escucha. */
function startSocksRelay(proxy: ProxyConfig): Promise<number> {
  const destination = {
    host: process.env.MYSQL_HOST as string,
    port: Number(process.env.MYSQL_PORT) || 3306,
  };

  return new Promise((resolve, reject) => {
    const server = net.createServer((clientSocket) => {
      SocksClient.createConnection({
        proxy: { ...proxy, type: 5 },
        command: "connect",
        destination,
      })
        .then((info) => {
          clientSocket.pipe(info.socket);
          info.socket.pipe(clientSocket);
          clientSocket.on("error", () => info.socket.destroy());
          info.socket.on("error", () => clientSocket.destroy());
        })
        .catch((err) => {
          console.error("[MySQL] Error de conexión SOCKS (Fixie):", err.message);
          clientSocket.destroy();
        });
    });

    server.unref();
    server.once("error", reject);
    server.listen(Number(process.env.SOCKS_LOCAL_PORT) || 0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        console.log(
          `[MySQL] Túnel SOCKS activo 127.0.0.1:${address.port} -> ${proxy.host}:${proxy.port} -> ${destination.host}:${destination.port}`
        );
        resolve(address.port);
      } else {
        reject(new Error("No se pudo determinar el puerto del túnel SOCKS"));
      }
    });
  });
}

let poolPromise: Promise<mysql.Pool> | null = null;

async function createPool(): Promise<mysql.Pool> {
  const config: mysql.PoolOptions = {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
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

  const proxy = resolveProxy();
  if (proxy) {
    config.host = "127.0.0.1";
    config.port = await startSocksRelay(proxy);
  } else {
    console.warn("[MySQL] Sin proxy Fixie: la IP de salida no estará autorizada.");
  }

  return mysql.createPool(config);
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

export default getPool;
