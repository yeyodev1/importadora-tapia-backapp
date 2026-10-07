import { CupoProductoModel, ICupoProducto } from "../models/cupoProducto.model";
import { PedidoModel } from "../models/pedido.model";

/** Estados que consumen cupo (los mismos que reservan stock). */
const ACTIVOS = ["enviado", "en_espera", "aprobado"];

/**
 * Cuánto lleva pedido cada asesor de cada producto con cupo, desde que se
 * fijó el cupo. Devuelve "proCodigo|venCodigo" -> cantidad.
 */
export async function usoDeCupos(cupos: ICupoProducto[], venCodigo?: string): Promise<Record<string, number>> {
  const uso: Record<string, number> = {};
  if (!cupos.length) return uso;
  const desdeMin = new Date(Math.min(...cupos.map((c) => c.desde.getTime())));
  const filtro: Record<string, unknown> = {
    estado: { $in: ACTIVOS },
    createdAt: { $gte: desdeMin },
    "items.productoCodigo": { $in: cupos.map((c) => c.proCodigo) },
  };
  if (venCodigo) filtro.venCodigo = venCodigo;
  const pedidos = await PedidoModel.find(filtro).select("venCodigo items createdAt").lean();
  const porCodigo = new Map(cupos.map((c) => [c.proCodigo, c]));
  for (const p of pedidos) {
    for (const it of p.items) {
      const cupo = porCodigo.get(String(it.productoCodigo));
      if (!cupo || new Date(p.createdAt) < cupo.desde) continue;
      const k = `${cupo.proCodigo}|${p.venCodigo || ""}`;
      uso[k] = (uso[k] || 0) + Number(it.cantidad);
    }
  }
  return uso;
}

/**
 * Valida que el pedido no pase el cupo del asesor en ningún producto.
 * Devuelve el mensaje de error, o null si todo cabe.
 */
export async function validarCupos(
  items: { productoCodigo: string; productoNombre: string; cantidad: number }[],
  venCodigo?: string
): Promise<string | null> {
  if (!venCodigo) return null;
  const codigos = [...new Set(items.map((i) => String(i.productoCodigo)))];
  const cupos = await CupoProductoModel.find({ proCodigo: { $in: codigos }, "cupos.venCodigo": venCodigo });
  if (!cupos.length) return null;
  const uso = await usoDeCupos(cupos, venCodigo);
  for (const c of cupos) {
    const mio = c.cupos.find((x) => x.venCodigo === venCodigo)!;
    const pide = items.filter((i) => String(i.productoCodigo) === c.proCodigo).reduce((s, i) => s + i.cantidad, 0);
    const usado = uso[`${c.proCodigo}|${venCodigo}`] || 0;
    const queda = Math.max(0, mio.cantidad - usado);
    if (pide > queda) {
      const nombre = c.proNombre || items.find((i) => String(i.productoCodigo) === c.proCodigo)!.productoNombre;
      return `Te pasas del cupo de ${nombre}: tu cupo es ${mio.cantidad}, ya pediste ${usado} y te quedan ${queda}. Pediste ${pide}.`;
    }
  }
  return null;
}
