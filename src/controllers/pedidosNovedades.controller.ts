import { Response, NextFunction } from "express";
import { PedidoModel } from "../models/pedido.model";
import { AuthRequest } from "../types/AuthRequest";

const HORA = 3600 * 1000;

export const PedidosNovedadesController = {
  /**
   * Pedidos que cambiaron desde `desde` (ISO). Lo consulta la app cada pocos
   * segundos para sonar la alarma de "nueva orden" sin recargar. Un vendedor
   * solo recibe los suyos. Devuelve `ahora` (hora del servidor) para la próxima consulta.
   */
  async novedades(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ahora = new Date();
      const pedida = req.query.desde ? new Date(String(req.query.desde)) : null;
      const valida = pedida && !Number.isNaN(pedida.getTime()) && pedida.getTime() > ahora.getTime() - 24 * HORA;
      const desde = valida ? pedida! : new Date(ahora.getTime() - HORA);

      // 2 s de solape: la app descarta repetidos, así no se pierde nada entre consultas.
      const filtro: Record<string, unknown> = { updatedAt: { $gt: new Date(desde.getTime() - 2000) } };
      if (req.user?.role === "vendedor") filtro.vendedorId = req.user.id;

      const data = await PedidoModel.find(filtro)
        .select("numero clienteNombre estado despacho total vendedorNombre createdAt updatedAt")
        .sort({ updatedAt: 1 })
        .limit(50);
      res.json({ success: true, data, ahora });
    } catch (error) {
      next(error);
    }
  },
};
