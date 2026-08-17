import { Router, Request, Response } from "express";
import { existsSync } from "fs";
import { join } from "path";
import { checkConnection } from "../config/mysql";

const healthRouter = Router();

function maskHost(host: string): string {
  if (!host) return "(sin definir)";
  const octets = host.split(".");
  if (octets.length === 4 && octets.every((o) => /^\d+$/.test(o))) {
    return `${octets[0]}.x.x.x`;
  }
  return host.replace(/^[^.]+/, "***");
}

/**
 * Clasifica el host para saber si es alcanzable desde internet.
 * 25.0.0.0/8 es el rango que usa Hamachi: sólo funciona dentro de esa VPN.
 */
function classifyHost(host: string): string {
  if (!host) return "sin-definir";
  const o = host.split(".").map(Number);
  if (o.length !== 4 || o.some(isNaN)) return "dominio";
  if (o[0] === 25) return "hamachi-vpn (no alcanzable desde internet)";
  if (o[0] === 10) return "privada-rfc1918";
  if (o[0] === 192 && o[1] === 168) return "privada-rfc1918";
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return "privada-rfc1918";
  if (o[0] === 127) return "loopback";
  return "publica";
}

/**
 * GET /api/health/mysql
 * Ejecuta la validación solicitada por el proveedor del ERP:
 *   SELECT USER(), CURRENT_USER();
 *   SHOW SESSION STATUS LIKE 'Ssl_cipher';
 * Si HEALTH_KEY está definido, exige ?key=<HEALTH_KEY>.
 */
healthRouter.get("/mysql", async (req: Request, res: Response) => {
  const expectedKey = process.env.HEALTH_KEY;
  if (expectedKey && req.query.key !== expectedKey) {
    res.status(401).json({ ok: false, message: "Invalid health key" });
    return;
  }

  const tunnelHostname = process.env.MYSQL_TUNNEL_HOSTNAME || "";
  const host = tunnelHostname || process.env.MYSQL_HOST || "";
  const target = {
    // Sin HEALTH_KEY el endpoint es público: no se revela la IP del ERP,
    // sólo si es alcanzable desde internet, que es lo que se diagnostica.
    host: expectedKey ? host : maskHost(host),
    hostClass: tunnelHostname ? "cloudflare-tunnel" : classifyHost(host),
    port: tunnelHostname
      ? Number(process.env.MYSQL_TUNNEL_LOCAL_PORT) || 13306
      : Number(process.env.MYSQL_PORT) || 3306,
    tunnel: Boolean(tunnelHostname),
    caLoaded:
      Boolean(process.env.MYSQL_SSL_CA) ||
      existsSync(
        process.env.MYSQL_SSL_CA_PATH || join(process.cwd(), "certs", "ca.pem")
      ),
  };

  try {
    const result = await checkConnection();
    res
      .status(result.sslEnabled ? 200 : 502)
      .json({ ok: result.sslEnabled, target, ...result });
  } catch (error: any) {
    res.status(503).json({
      ok: false,
      target,
      code: error?.code,
      errno: error?.errno,
      message: error?.message,
    });
  }
});

export default healthRouter;
