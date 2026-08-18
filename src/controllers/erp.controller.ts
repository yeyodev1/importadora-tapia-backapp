import { Response, NextFunction } from "express";
import { ErpService } from "../services/erp.service";
import { cachedRead } from "../services/erpCache.service";
import { AuthRequest } from "../types/AuthRequest";

/** Los vendedores sólo ven su propia cartera; admin ve todo. */
function scope(req: AuthRequest): string | undefined {
  return req.user?.role === "vendedor" ? req.user.venCodigo : undefined;
}

/**
 * Envía la respuesta de una vista del ERP con metadatos de conexión.
 * `meta.stale` indica si el dato es en vivo o de la última copia guardada,
 * para que el front muestre el indicador correspondiente.
 */
function sendCached<T>(res: Response, result: {
  data: T[];
  stale: boolean;
  updatedAt: Date | null;
  error?: string;
}) {
  res.json({
    success: true,
    data: result.data,
    meta: {
      stale: result.stale,
      updatedAt: result.updatedAt,
      source: result.stale ? "cache" : "erp",
      error: result.error,
    },
  });
}

export const ErpController = {
  async clientes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = scope(req);
      const key = s ? `clientes:${s}` : "clientes";
      sendCached(res, await cachedRead(key, () => ErpService.getClientes(s) as any));
    } catch (error) {
      next(error);
    }
  },

  async vendedores(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = scope(req);
      const key = s ? `vendedores:${s}` : "vendedores";
      sendCached(res, await cachedRead(key, () => ErpService.getVendedores(s) as any));
    } catch (error) {
      next(error);
    }
  },

  async inventario(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      sendCached(res, await cachedRead("inventario", () => ErpService.getInventario() as any));
    } catch (error) {
      next(error);
    }
  },

  async carteraFacturas(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = scope(req);
      const key = s ? `cartera_facturas:${s}` : "cartera_facturas";
      sendCached(res, await cachedRead(key, () => ErpService.getCarteraFacturas(s) as any));
    } catch (error) {
      next(error);
    }
  },

  async carteraConsolidada(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const s = scope(req);
      const key = s ? `cartera_consolidada:${s}` : "cartera_consolidada";
      sendCached(res, await cachedRead(key, () => ErpService.getCarteraConsolidada(s) as any));
    } catch (error) {
      next(error);
    }
  },
};
