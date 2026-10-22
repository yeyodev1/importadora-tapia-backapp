import { PedidoModel, StockAlAprobar } from "../models/pedido.model";
import { ErpService } from "./erp.service";
import { cachedRead } from "./erpCache.service";

/** Inventario del ERP con respaldo en cache (nunca rompe si el túnel cae). */
async function inventarioErp(): Promise<any[]> {
  const r = await cachedRead("inventario", () => ErpService.getInventario() as Promise<any[]>);
  return r.data;
}

/** Clave única de un producto en una bodega. */
function key(codigo: string, bodega?: string): string {
  return `${codigo}|${bodega || ""}`;
}

/**
 * Pedidos que todavía no descuenta el ERP. Tapia descuenta el stock al
 * FACTURAR, no al aprobar (el cliente puede tardar días en retirar):
 *  - enviado / en espera: siempre reservan.
 *  - aprobado sin facturar ni salir de bodega: reserva todo.
 *  - aprobado ya marcado facturado o con salidas: bodega factura en el ERP
 *    días después de despachar (el canguil: salió de bodega y el ERP seguía
 *    con las 325). Sigue apartando lo que el ERP todavía no baja desde que
 *    se aprobó — sin límite de tiempo: la reserva se libera sola cuando el
 *    ERP baja el stock, o cuando alguien confirma el descuento. Sin foto del
 *    stock al aprobar (pedidos viejos) ya no reserva, o se restaría dos
 *    veces (la lenteja).
 * Rechazados, anulados y rechazados por el cliente no reservan.
 */
function filtroReserva() {
  return {
    $or: [
      { estado: { $in: ["enviado", "en_espera"] } },
      {
        estado: "aprobado",
        facturacion: { $exists: false },
        "despacho.salidaAt": { $exists: false },
        "entregas.0": { $exists: false },
      },
      {
        estado: "aprobado",
        "stockAlAprobar.at": { $exists: true },
        erpDescontado: { $exists: false },
        $or: [
          { facturacion: { $exists: true } },
          { "despacho.salidaAt": { $exists: true } },
          { "entregas.0": { $exists: true } },
        ],
      },
    ],
  };
}

/** Ya marcado facturado o con salidas: aparta solo lo que el ERP no ha bajado. */
function esperaErp(p: { facturacion?: unknown; despacho?: { salidaAt?: Date }; entregas?: unknown[] }): boolean {
  return !!p.facturacion || !!p.despacho?.salidaAt || !!p.entregas?.length;
}

/**
 * Guarda el stock del ERP de los productos del pedido al aprobarlo. Si el ERP
 * no responde se usa su última copia guardada.
 */
export async function stockAlAprobar(items: { productoCodigo: string; bodega?: string }[]): Promise<StockAlAprobar> {
  const stock = stockPorClave(await inventarioErp());
  const stocks = [...new Set(items.map((it) => key(it.productoCodigo, it.bodega)))]
    .filter((k) => k in stock)
    .map((k) => ({ clave: k, stock: stock[k]! }));
  return { at: new Date(), stocks };
}

/** Una OP que aparta stock de un producto en una bodega. */
export interface ReservaPedido {
  id: string;
  numero: string;
  estado: string;
  clienteNombre: string;
  cantidad: number;
  /** Ya marcada facturada o salida, pero el ERP aún no baja ese stock. */
  pendienteErp?: boolean;
}

/**
 * Suma lo reservado por producto y bodega, y qué OP lo reservan.
 * `excluirId` deja fuera un pedido (para validar ese mismo pedido al aprobarlo).
 * `stockErp` (clave → stock actual del ERP) mide cuánto bajó el ERP desde que
 * se aprobaron los pedidos ya facturados: esa baja se reparte por orden de aprobación.
 */
export async function reservasActivas(excluirId?: string, stockErp: Record<string, number> = {}): Promise<{
  cantidades: Record<string, number>;
  pedidos: Record<string, ReservaPedido[]>;
}> {
  const filtro = filtroReserva();
  const activos = await PedidoModel.find(
    excluirId ? { $and: [filtro, { _id: { $ne: excluirId } }] } : filtro
  )
    .select("numero estado clienteNombre items facturacion despacho.salidaAt entregas stockAlAprobar")
    .sort({ "stockAlAprobar.at": 1, createdAt: 1 });

  // Por clave: cuánto bajó el ERP desde la foto más antigua de los pedidos que esperan al ERP.
  const bajoErp: Record<string, number> = {};
  for (const p of activos) {
    if (!esperaErp(p)) continue;
    for (const f of p.stockAlAprobar?.stocks || []) {
      if (f.clave in bajoErp) continue;
      bajoErp[f.clave] = f.clave in stockErp ? Math.max(0, f.stock - stockErp[f.clave]!) : Infinity;
    }
  }

  const cantidades: Record<string, number> = {};
  const pedidos: Record<string, ReservaPedido[]> = {};
  for (const p of activos) {
    const pendienteErp = esperaErp(p);
    for (const it of p.items) {
      const k = key(it.productoCodigo, it.bodega);
      let cantidad = Number(it.cantidad);
      if (pendienteErp) {
        const bajo = bajoErp[k] ?? Infinity;
        const descontado = Math.min(cantidad, bajo);
        bajoErp[k] = bajo - descontado;
        cantidad = Math.round((cantidad - descontado) * 100) / 100;
      }
      if (!(cantidad > 0)) continue;
      cantidades[k] = (cantidades[k] || 0) + cantidad;
      (pedidos[k] ||= []).push({
        id: String(p._id),
        numero: p.numero,
        estado: p.estado,
        clienteNombre: p.clienteNombre,
        cantidad,
        ...(pendienteErp ? { pendienteErp: true } : {}),
      });
    }
  }
  return { cantidades, pedidos };
}

/** Stock del ERP por clave producto|bodega. */
function stockPorClave(rows: { pro_codigo: string | number; bod_nombre?: string; stock_actual: string }[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) m[key(String(r.pro_codigo), r.bod_nombre)] = Number(r.stock_actual) || 0;
  return m;
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
 * Suma a cada fila del ERP lo reservado y lo disponible:
 * disponible = stock_actual (ERP) - reservado (pedidos aún sin facturar).
 * `conDetalle` (administración) agrega qué OP lo apartan, para ubicar las que
 * ya se facturaron y no se marcaron.
 */
export async function conReservas<T extends { pro_codigo: string | number; bod_nombre?: string; stock_actual: string }>(
  rows: T[],
  conDetalle = false
): Promise<(T & { reservado: number; disponible: number; reservadoPor?: ReservaPedido[] })[]> {
  const reservas = await reservasActivas(undefined, stockPorClave(rows));
  return rows.map((row) => {
    const k = key(String(row.pro_codigo), row.bod_nombre);
    const reservado = reservas.cantidades[k] || 0;
    const stock = Number(row.stock_actual) || 0;
    return {
      ...row,
      reservado,
      disponible: Math.max(0, stock - reservado),
      ...(conDetalle && reservado ? { reservadoPor: reservas.pedidos[k] } : {}),
    };
  });
}

/** Inventario del ERP (solo lectura) con la reserva propia descontada. */
export async function inventarioDisponible(): Promise<DisponibleItem[]> {
  return conReservas(await inventarioErp());
}

/**
 * Valida que las líneas de un pedido no superen el disponible.
 * `excluirId`: el pedido que se valida ya está guardado (aprobar o reactivar),
 * así que su propia reserva no cuenta.
 * Devuelve un mensaje de error, o null si todo cabe.
 */
export async function validarDisponibilidad(
  items: { productoCodigo: string; productoNombre: string; bodega?: string; cantidad: number }[],
  excluirId?: string
): Promise<string | null> {
  const inv = await inventarioErp();
  const reservas = await reservasActivas(excluirId, stockPorClave(inv));

  for (const it of items) {
    const erp = inv.find(
      (x) => String(x.pro_codigo) === String(it.productoCodigo) && x.bod_nombre === it.bodega
    );
    const stock = erp ? Number(erp.stock_actual) : 0;
    const k = key(it.productoCodigo, it.bodega);
    const reservado = reservas.cantidades[k] || 0;
    const disponible = Math.max(0, stock - reservado);
    if (it.cantidad > disponible) {
      const detalle = reservado
        ? ` (stock ${stock}, reservado ${reservado} por pedidos sin facturar: ${reservas.pedidos[k]!.map((r) => `${r.numero} (${r.cantidad})`).join(", ")})`
        : "";
      return `${it.productoNombre} (${it.bodega || "bodega"}): pediste ${it.cantidad}, disponible ${disponible}${detalle}.`;
    }
  }
  return null;
}
