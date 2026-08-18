import { Response, NextFunction } from "express";
import { VisitaModel } from "../models/visita.model";
import { AuthRequest } from "../types/AuthRequest";

const RESULTADOS = ["atendido", "espera", "regreso", "abandono"];

export const VisitasController = {
  /** Vendedor ve sus visitas; admin ve todas. Más recientes primero. */
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filtro = req.user?.role === "vendedor" ? { vendedorId: req.user.id } : {};
      const visitas = await VisitaModel.find(filtro).sort({ createdAt: -1 }).limit(300);
      res.json({ success: true, data: visitas });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Registra la LLEGADA a una visita. La ubicación GPS (lat/lng) es obligatoria:
   * es el punto de origen que exige administración para medir la visita.
   */
  async entrada(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { lat, lng, clienteNombre, clienteCodigo } = req.body || {};
      if (typeof lat !== "number" || typeof lng !== "number") {
        res.status(400).json({
          success: false,
          message: "Se requiere la ubicación GPS para registrar la visita. Activa la ubicación.",
        });
        return;
      }

      const visita = await VisitaModel.create({
        vendedorId: req.user!.id,
        vendedorNombre: req.user!.email,
        venCodigo: req.user!.venCodigo,
        clienteNombre,
        clienteCodigo,
        entrada: { lat, lng, ts: new Date() },
        estado: "en_curso",
      });

      res.status(201).json({ success: true, data: visita });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Marca la SALIDA de una visita en curso: captura ubicación y hora, calcula
   * la duración y guarda el resultado (atendido/espera/regreso/abandono).
   */
  async salida(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { lat, lng, resultado, observacion } = req.body || {};
      const visita = await VisitaModel.findById(req.params.id);
      if (!visita) {
        res.status(404).json({ success: false, message: "Visita no encontrada" });
        return;
      }
      // El vendedor solo cierra sus propias visitas.
      if (req.user?.role === "vendedor" && visita.vendedorId !== req.user.id) {
        res.status(403).json({ success: false, message: "No es tu visita" });
        return;
      }
      if (visita.estado === "finalizada") {
        res.status(409).json({ success: false, message: "La visita ya fue cerrada" });
        return;
      }
      if (resultado && !RESULTADOS.includes(resultado)) {
        res.status(400).json({ success: false, message: "Resultado inválido" });
        return;
      }

      const ts = new Date();
      visita.salida = {
        lat: typeof lat === "number" ? lat : visita.entrada.lat,
        lng: typeof lng === "number" ? lng : visita.entrada.lng,
        ts,
      };
      visita.duracionMin = Math.max(
        1,
        Math.round((ts.getTime() - visita.entrada.ts.getTime()) / 60000)
      );
      visita.estado = "finalizada";
      if (resultado) visita.resultado = resultado;
      if (observacion) visita.observacion = observacion;
      await visita.save();

      res.json({ success: true, data: visita });
    } catch (error) {
      next(error);
    }
  },
};
