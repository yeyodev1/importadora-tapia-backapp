import { PedidoModel } from "../models/pedido.model";
import { ErpService } from "./erp.service";

/** Clave única de un producto en una bodega. */
function key(codigo: string, bodega?: string): string {
  return `${codigo}|${bodega || ""}`;
}

/**
 * Suma las cantidades ya comprometidas en pedidos ACTIVOS (enviado o aprobado).
 * Los rechazados NO reservan: liberan el stock automáticamente.
 * Devuelve un mapa "codigo|bodega" -> cantidad reservada.
 */
export async function reservasActivas(): Promise<Record<string, number>> {
  const activos = await PedidoModel.find({
    estado: { $in: ["enviado", "aprobado"] },
  }).select("items");

  const map: Record<string, number> = {};
  for (const p of activos) {
    for (const it of p.items) {
      const k = key(it.productoCodigo, it.bodega);
      map[k] = (map[k] || 0) + Number(it.cantidad);
    }
  }
  return map;
}

interface DisponibleItem {
  pro_codigo: string;
  pro_nombre: string;
  uni_nombre: string;
  bod_codigo: string;
  bod_nombre: string;
  stock_actual: string;
  reservado: number;
  disponible: number;
}

/**
 * Inventario del ERP (solo lectura) con la reserva propia descontada.
 * disponible = stock_actual (ERP) - reservado (pedidos activos).
 */
export async function inventarioDisponible(): Promise<DisponibleItem[]> {
  const [inv, reservas] = await Promise.all([
    ErpService.getInventario() as Promise<any[]>,
    reservasActivas(),
  ]);

  return inv.map((row) => {
    const reservado = reservas[key(String(row.pro_codigo), row.bod_nombre)] || 0;
    const stock = Number(row.stock_actual) || 0;
    return {
      ...row,
      reservado,
      disponible: Math.max(0, stock - reservado),
    };
  });
}

/**
 * Valida que las líneas de un pedido no superen el disponible.
 * Devuelve un mensaje de error, o null si todo cabe.
 */
export async function validarDisponibilidad(
  items: { productoCodigo: string; productoNombre: string; bodega?: string; cantidad: number }[]
): Promise<string | null> {
  const [inv, reservas] = await Promise.all([
    ErpService.getInventario() as Promise<any[]>,
    reservasActivas(),
  ]);

  for (const it of items) {
    const erp = inv.find(
      (x) => String(x.pro_codigo) === String(it.productoCodigo) && x.bod_nombre === it.bodega
    );
    const stock = erp ? Number(erp.stock_actual) : 0;
    const reservado = reservas[key(it.productoCodigo, it.bodega)] || 0;
    const disponible = Math.max(0, stock - reservado);
    if (it.cantidad > disponible) {
      return `${it.productoNombre} (${it.bodega || "bodega"}): pediste ${it.cantidad}, disponible ${disponible}.`;
    }
  }
  return null;
}
