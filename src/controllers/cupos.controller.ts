import { Response, NextFunction } from "express";
import { CupoProductoModel, ICupoProducto } from "../models/cupoProducto.model";
import { usoDeCupos } from "../services/cupos.service";
import { AuthRequest } from "../types/AuthRequest";

/** Cupo con lo que lleva pedido cada asesor y lo que le queda. */
function publico(c: ICupoProducto, uso: Record<string, number>) {
  return {
    proCodigo: c.proCodigo,
    proNombre: c.proNombre || "",
    desde: c.desde,
    cupos: c.cupos.map((x) => {
      const usado = uso[`${c.proCodigo}|${x.venCodigo}`] || 0;
      return { venCodigo: x.venCodigo, nombre: x.nombre, cantidad: x.cantidad, usado, queda: Math.max(0, x.cantidad - usado) };
    }),
    actualizadoPor: c.actualizadoPor,
    updatedAt: c.updatedAt,
  };
}

/** Cupos por asesor de productos escasos. Admin ve y edita todos; el vendedor ve solo los suyos. */
export const CuposController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const esVendedor = req.user?.role === "vendedor";
      const venCodigo = esVendedor ? req.user?.venCodigo || "__sin_codigo__" : undefined;
      const cupos = await CupoProductoModel.find(venCodigo ? { "cupos.venCodigo": venCodigo } : {});
      const uso = await usoDeCupos(cupos, venCodigo);
      const data = cupos.map((c) => publico(c, uso));
      // El vendedor no ve los cupos de sus compañeros.
      if (venCodigo) for (const d of data) d.cupos = d.cupos.filter((x) => x.venCodigo === venCodigo);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Fija los cupos de un producto. body: { proNombre?, cupos: [{venCodigo, nombre?, cantidad}], reiniciar? }
   * `reiniciar` (o un cupo nuevo) empieza a contar desde ahora: úsalo cuando llega mercadería nueva.
   */
  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const proCodigo = String(req.params.proCodigo || "").trim();
      const { proNombre, cupos, reiniciar } = req.body || {};
      if (!proCodigo) {
        res.status(400).json({ success: false, message: "proCodigo requerido" });
        return;
      }
      if (!Array.isArray(cupos)) {
        res.status(400).json({ success: false, message: "Envía la lista de cupos" });
        return;
      }
      const lista = [];
      const vistos = new Set<string>();
      for (const x of cupos) {
        const venCodigo = String(x?.venCodigo || "").trim();
        const cantidad = Number(x?.cantidad);
        if (!venCodigo || vistos.has(venCodigo)) continue;
        if (!Number.isFinite(cantidad) || cantidad < 0) {
          res.status(400).json({ success: false, message: `Cupo inválido para ${x?.nombre || venCodigo}` });
          return;
        }
        vistos.add(venCodigo);
        lista.push({ venCodigo, nombre: x?.nombre ? String(x.nombre).slice(0, 120) : undefined, cantidad });
      }

      // Sin asesores = se quita el cupo del producto.
      if (!lista.length) {
        await CupoProductoModel.deleteOne({ proCodigo });
        res.json({ success: true, data: null });
        return;
      }

      const actual = await CupoProductoModel.findOne({ proCodigo });
      const cupo = await CupoProductoModel.findOneAndUpdate(
        { proCodigo },
        {
          proCodigo,
          ...(proNombre ? { proNombre: String(proNombre) } : {}),
          desde: !actual || reiniciar ? new Date() : actual.desde,
          cupos: lista,
          actualizadoPor: req.user!.email,
        },
        { upsert: true, new: true }
      );
      res.json({ success: true, data: publico(cupo!, await usoDeCupos([cupo!])) });
    } catch (error) {
      next(error);
    }
  },
};
