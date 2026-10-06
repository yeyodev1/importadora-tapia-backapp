import { Request, Response, NextFunction } from "express";

/**
 * Límite de intentos en memoria (sin dependencias). Cuenta por clave
 * (IP, IP+email, ...) dentro de una ventana fija. En serverless cada instancia
 * lleva su propio conteo: frena abusos básicos, no reemplaza un WAF.
 */

interface Ventana {
  intentos: number;
  reinicia: number;
}

interface Opciones {
  /** Nombre del limitador para no mezclar conteos entre rutas. */
  nombre: string;
  max: number;
  ventanaMs: number;
  /** Arma la clave a partir del request (por defecto solo la IP). */
  clave?: (req: Request, ip: string) => string;
}

const registros = new Map<string, Ventana>();
let ultimaLimpieza = Date.now();

/** Quita las ventanas vencidas para que el Map no crezca sin control. */
function limpiar(ahora: number) {
  if (ahora - ultimaLimpieza < 60_000) return;
  ultimaLimpieza = ahora;
  for (const [k, v] of registros) if (v.reinicia <= ahora) registros.delete(k);
}

/** IP del cliente: detrás de Vercel/proxy viene en x-forwarded-for. */
export function ipCliente(req: Request): string {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real) return real.trim();
  const fwd = req.headers["x-forwarded-for"];
  const primera = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
  return primera || req.socket.remoteAddress || "desconocida";
}

export function limitarIntentos({ nombre, max, ventanaMs, clave }: Opciones) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ahora = Date.now();
    limpiar(ahora);

    const ip = ipCliente(req);
    const k = `${nombre}:${clave ? clave(req, ip) : ip}`;
    const actual = registros.get(k);

    if (!actual || actual.reinicia <= ahora) {
      registros.set(k, { intentos: 1, reinicia: ahora + ventanaMs });
      next();
      return;
    }

    actual.intentos += 1;
    if (actual.intentos > max) {
      const minutos = Math.max(1, Math.ceil((actual.reinicia - ahora) / 60_000));
      res.setHeader("Retry-After", String(Math.ceil((actual.reinicia - ahora) / 1000)));
      res.status(429).json({
        success: false,
        message: `Hiciste demasiados intentos. Espera ${minutos} min y vuelve a probar.`,
      });
      return;
    }
    next();
  };
}
