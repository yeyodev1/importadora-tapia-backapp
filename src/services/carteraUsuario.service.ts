import { AuthRequest } from "../types/AuthRequest";
import { ErpService } from "./erp.service";
import { cachedRead } from "./erpCache.service";

/** Facturas de cartera que puede ver el usuario (un vendedor, solo las de sus clientes). */
export async function carteraDelUsuario(req: AuthRequest): Promise<any[]> {
  const scope = req.user?.role === "vendedor" ? req.user.venCodigo : undefined;
  const key = scope ? `cartera_facturas:${scope}` : "cartera_facturas";
  const r = await cachedRead(key, () => ErpService.getCarteraFacturas(scope) as Promise<any[]>);
  return r.data as any[];
}

/** Una factura de la cartera del usuario, o null si no existe o no le pertenece. */
export async function facturaDelUsuario(req: AuthRequest, codigo: string): Promise<any | null> {
  const cartera = await carteraDelUsuario(req);
  return cartera.find((f) => String(f.trc_codigo) === String(codigo)) || null;
}

/** Un cliente de la cartera del usuario (un vendedor, solo los suyos), o null. */
export async function clienteDelUsuario(req: AuthRequest, codigo: string): Promise<any | null> {
  const scope = req.user?.role === "vendedor" ? req.user.venCodigo : undefined;
  const key = scope ? `clientes:${scope}` : "clientes";
  const r = await cachedRead(key, () => ErpService.getClientes(scope) as Promise<any[]>);
  return (r.data as any[]).find((c) => String(c.per_codigo) === String(codigo)) || null;
}

export function numeroImpreso(f: any): string {
  return f.numero_factura_impreso || [f.trc_serdoc, f.trc_numdoc].filter(Boolean).join("-");
}
