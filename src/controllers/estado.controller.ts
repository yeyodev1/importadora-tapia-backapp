import { Response, NextFunction } from "express";
import { getPool } from "../config/mysql";
import { cacheStatus } from "../services/erpCache.service";
import { AuthRequest } from "../types/AuthRequest";

/**
 * Diagnóstico del estado de conexión con el ERP de Importadora Tapia.
 * Hace un ping real (SELECT 1) por el túnel y clasifica el problema para
 * mostrarlo con claridad en el panel de administración.
 */
export const EstadoController = {
  async erp(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      let conectado = false;
      let motivo = "";
      let detalle = "";
      const inicio = Date.now();

      try {
        const pool = await getPool();
        await pool.query("SELECT 1");
        conectado = true;
      } catch (err) {
        const msg = (err as Error).message || "";
        detalle = msg;
        // Clasificar el error para un mensaje entendible por el usuario.
        if (msg.includes("530") || msg.includes("Unexpected server response")) {
          motivo =
            "El equipo de Importadora Tapia que mantiene la conexión (agente del túnel) está apagado o sin internet.";
        } else if (msg.toLowerCase().includes("access denied")) {
          motivo = "El usuario del ERP no está autorizado. Requiere revisión de Importadora Tapia.";
        } else if (msg.toLowerCase().includes("timeout")) {
          motivo = "El ERP no respondió a tiempo. Puede estar saturado o con la red lenta.";
        } else {
          motivo = "No se pudo establecer la conexión con el ERP.";
        }
      }

      const copias = await cacheStatus();
      // La copia más reciente representa "hasta cuándo tenemos datos".
      const ultima = copias.reduce<Date | null>(
        (max, c) => (c.actualizado && (!max || c.actualizado > max) ? c.actualizado : max),
        null
      );

      res.json({
        success: true,
        conectado,
        latenciaMs: conectado ? Date.now() - inicio : null,
        motivo: conectado ? null : motivo,
        detalle: conectado ? null : detalle.slice(0, 200),
        ultimaSincronizacion: ultima,
        copias,
      });
    } catch (error) {
      next(error);
    }
  },
};
