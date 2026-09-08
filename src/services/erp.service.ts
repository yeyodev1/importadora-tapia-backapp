import { getPool } from "../config/mysql";

/**
 * Lecturas sobre las vistas del ERP.
 * Si se pasa venCodigo (usuarios con rol "vendedor"), cada consulta se
 * restringe a los clientes de ese vendedor. Las vistas de cartera no exponen
 * ven_codigo, así que se filtra vía subconsulta contra vw_crm_clientes.
 */
/** Tipo de documento "Factura ventas" en in_trancab; 4 = "Nota de Crédito ventas". */
const SOLO_FACTURAS = "f.trc_tipdoc = 1";

async function query(sql: string, params: unknown[] = []) {
  const pool = await getPool();
  const [rows] = await pool.query(sql, params);
  return rows;
}

export const ErpService = {
  getClientes(venCodigo?: string) {
    if (venCodigo) {
      return query("SELECT * FROM vw_crm_clientes WHERE ven_codigo = ?", [venCodigo]);
    }
    return query("SELECT * FROM vw_crm_clientes");
  },

  getVendedores(venCodigo?: string) {
    if (venCodigo) {
      return query("SELECT * FROM vw_crm_vendedores WHERE ven_codigo = ?", [venCodigo]);
    }
    return query("SELECT * FROM vw_crm_vendedores");
  },

  getInventario() {
    // El inventario es compartido: todos los roles ven las mismas existencias.
    return query("SELECT * FROM vw_crm_inventario");
  },

  /**
   * Cartera por documento. La vista del proveedor (actualizada el 24-ago-2026)
   * mezcla facturas de venta (trc_tipdoc = 1) con notas de crédito
   * (trc_tipdoc = 4); las NC vienen con saldo positivo y sumarían como deuda.
   * Sólo las facturas de venta son cuentas por cobrar reales, igual que en el
   * reporte "Cuentas por cobrar" del sistema de Tapia.
   */
  getCarteraFacturas(venCodigo?: string) {
    if (venCodigo) {
      return query(
        `SELECT f.* FROM vw_crm_cartera_facturas_2year f
         WHERE ${SOLO_FACTURAS}
           AND f.per_nombre IN (
             SELECT c.per_nombre FROM vw_crm_clientes c WHERE c.ven_codigo = ?
           )
         ORDER BY f.trc_fecha DESC, f.trc_numdoc DESC`,
        [venCodigo]
      );
    }
    return query(
      `SELECT f.* FROM vw_crm_cartera_facturas_2year f
       WHERE ${SOLO_FACTURAS}
       ORDER BY f.trc_fecha DESC, f.trc_numdoc DESC`
    );
  },

  /**
   * Deuda total por cliente, calculada desde las facturas de venta con saldo.
   * No se usa vw_crm_cartera_consolidada: esa vista suma notas de crédito y
   * documentos que no figuran en la cartera (p. ej. ECONESPECIAS: 53.790,77
   * contra 26.234,39 reales), así que no cuadra con el sistema de Tapia.
   */
  getCarteraConsolidada(venCodigo?: string) {
    const scope = venCodigo ? "AND c.ven_codigo = ?" : "";
    return query(
      `SELECT c.per_codigo, f.per_nombre, SUM(f.saldo_pendiente) AS deuda_total
       FROM vw_crm_cartera_facturas_2year f
       JOIN (
         SELECT per_nombre, MIN(per_codigo) AS per_codigo, MIN(ven_codigo) AS ven_codigo
         FROM vw_crm_clientes GROUP BY per_nombre
       ) c ON c.per_nombre = f.per_nombre
       WHERE ${SOLO_FACTURAS} AND f.saldo_pendiente > 0 ${scope}
       GROUP BY c.per_codigo, f.per_nombre
       HAVING deuda_total > 0
       ORDER BY deuda_total DESC`,
      venCodigo ? [venCodigo] : []
    );
  },
};
