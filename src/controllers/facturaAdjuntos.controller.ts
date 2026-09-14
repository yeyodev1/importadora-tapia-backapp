import { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../types/AuthRequest";
import { FacturaAdjuntoModel } from "../models/facturaAdjunto.model";
import { carteraDelUsuario, facturaDelUsuario, numeroImpreso } from "../services/carteraUsuario.service";
import { esUrlCloudinaryPropia, firmaSubidaDirecta } from "../services/cloudinary.service";

const MAX_POR_FACTURA = 20;

export const FacturaAdjuntosController = {
  /** Fotos/PDF de facturas. Un vendedor solo recibe los de facturas de su cartera. */
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filtro: Record<string, unknown> = {};
      const codigo = req.query.codigo ? String(req.query.codigo) : "";
      if (req.user?.role === "vendedor") {
        const propias = (await carteraDelUsuario(req)).map((f) => String(f.trc_codigo));
        filtro.trcCodigo = codigo ? (propias.includes(codigo) ? codigo : "__ninguna__") : { $in: propias };
      } else if (codigo) {
        filtro.trcCodigo = codigo;
      }
      const data = await FacturaAdjuntoModel.find(filtro).sort({ createdAt: -1 }).limit(3000);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  /** Registra un archivo ya subido a Cloudinary para una factura de la cartera del usuario. */
  async crear(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const factura = await facturaDelUsuario(req, String(req.params.codigo));
      if (!factura) {
        res.status(404).json({ success: false, message: "Factura no encontrada en tu cartera" });
        return;
      }
      const url = String(req.body?.url || "");
      if (!esUrlCloudinaryPropia(url)) {
        res.status(400).json({ success: false, message: "Archivo con enlace no permitido" });
        return;
      }
      const trcCodigo = String(factura.trc_codigo);
      if ((await FacturaAdjuntoModel.countDocuments({ trcCodigo })) >= MAX_POR_FACTURA) {
        res.status(409).json({ success: false, message: `Máximo ${MAX_POR_FACTURA} archivos por factura` });
        return;
      }
      const adjunto = await FacturaAdjuntoModel.create({
        trcCodigo,
        numeroFactura: numeroImpreso(factura),
        clienteNombre: factura.per_nombre || "",
        url,
        nombre: String(req.body?.nombre || "").trim().slice(0, 160),
        formato: req.body?.formato === "pdf" ? "pdf" : "imagen",
        bytes: Number(req.body?.bytes) || 0,
        subidoPor: req.user!.email,
        subidoPorId: req.user!.id,
      });
      res.status(201).json({ success: true, data: adjunto });
    } catch (error) {
      next(error);
    }
  },

  /** Quita un archivo: solo quien lo subió o un administrador. */
  async eliminar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const adjunto = mongoose.isValidObjectId(id) ? await FacturaAdjuntoModel.findById(id) : null;
      if (!adjunto) {
        res.status(404).json({ success: false, message: "Archivo no encontrado" });
        return;
      }
      if (req.user?.role !== "admin" && adjunto.subidoPorId !== req.user?.id) {
        res.status(403).json({ success: false, message: "Solo quien lo subió o un administrador puede quitarlo" });
        return;
      }
      await adjunto.deleteOne();
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  /** Firma para subir la foto/PDF directo a Cloudinary desde el celular. */
  async firmaSubida(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const firma = firmaSubidaDirecta("tapia-facturas");
      if (!firma) {
        res.status(503).json({ success: false, message: "La subida de archivos no está configurada (Cloudinary)" });
        return;
      }
      res.json({ success: true, data: firma });
    } catch (error) {
      next(error);
    }
  },
};
