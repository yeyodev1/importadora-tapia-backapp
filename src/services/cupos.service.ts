import { CupoProductoModel, ICupoProducto } from "../models/cupoProducto.model";
import { PedidoModel } from "../models/pedido.model";

/** Estados que consumen cupo (los mismos que reservan stock). */
export const ESTADOS_CON_CUPO = ["enviado", "en_espera", "aprobado"];
const ACTIVOS = ESTADOS_CON_CUPO;

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
  if (venCodigo) filtro.venCodigo = venCodigo.trim();
  const pedidos = await PedidoModel.find(filtro).select("venCodigo items createdAt").lean();
  const porCodigo = new Map(cupos.map((c) => [c.proCodigo, c]));
  for (const p of pedidos) {
    for (const it of p.items) {
      const cupo = porCodigo.get(String(it.productoCodigo));
      if (!cupo || new Date(p.createdAt) < cupo.desde) continue;
      const k = `${cupo.proCodigo}|${String(p.venCodigo || "").trim()}`;
      uso[k] = (uso[k] || 0) + Number(it.cantidad);
    }
  }
  return uso;
}

export interface ExcesoCupo {
  producto: string;
  cupo: number;
  usado: number;
  queda: number;
  pide: number;
}

/**
 * Primer producto del pedido que pasa el cupo del asesor, o null si todo cabe.
 * `fecha` es la de creación del pedido (por defecto ahora): un cupo fijado
 * después no lo cuenta, así que tampoco lo limita.
 */
export async function excesoCupo(
  items: { productoCodigo: string; productoNombre: string; cantidad: number }[],
  venCodigoRaw?: string,
  fecha: Date = new Date()
): Promise<ExcesoCupo | null> {
  const venCodigo = String(venCodigoRaw || "").trim();
  if (!venCodigo) return null;
  const codigos = [...new Set(items.map((i) => String(i.productoCodigo).trim()))];
  const cupos = (await CupoProductoModel.find({ proCodigo: { $in: codigos }, "cupos.venCodigo": venCodigo })).filter(
    (c) => c.desde <= fecha
  );
  if (!cupos.length) return null;
  const uso = await usoDeCupos(cupos, venCodigo);
  for (const c of cupos) {
    const mio = c.cupos.find((x) => x.venCodigo === venCodigo)!;
    const delProducto = items.filter((i) => String(i.productoCodigo).trim() === c.proCodigo);
    const pide = delProducto.reduce((s, i) => s + i.cantidad, 0);
    const usado = uso[`${c.proCodigo}|${venCodigo}`] || 0;
    const queda = Math.max(0, mio.cantidad - usado);
    if (pide > queda) return { producto: c.proNombre || delProducto[0]!.productoNombre, cupo: mio.cantidad, usado, queda, pide };
  }
  return null;
}

/** Igual que excesoCupo, con el mensaje para el asesor que arma el pedido. */
export async function validarCupos(
  items: { productoCodigo: string; productoNombre: string; cantidad: number }[],
  venCodigo?: string,
  fecha?: Date
): Promise<string | null> {
  const e = await excesoCupo(items, venCodigo, fecha);
  return e
    ? `Te pasas del cupo de ${e.producto}: tu cupo es ${e.cupo}, ya pediste ${e.usado} y te quedan ${e.queda}. Pediste ${e.pide}.`
    : null;
}
