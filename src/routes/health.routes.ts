import { Router, Request, Response } from "express";
import { checkConnection } from "../config/mysql";

const healthRouter = Router();

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

  try {
    const result = await checkConnection();
    res.status(result.sslEnabled ? 200 : 502).json({ ok: result.sslEnabled, ...result });
  } catch (error: any) {
    res.status(503).json({
      ok: false,
      code: error?.code,
      errno: error?.errno,
      message: error?.message,
    });
  }
});

export default healthRouter;
