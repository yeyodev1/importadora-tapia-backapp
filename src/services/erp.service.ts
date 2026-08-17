import { getPool } from "../config/mysql";

/**
 * Lecturas sobre las vistas del ERP.
 * Si se pasa venCodigo (usuarios con rol "vendedor"), cada consulta se
 * restringe a los clientes de ese vendedor. Las vistas de cartera no exponen
 * ven_codigo, así que se filtra vía subconsulta contra vw_crm_clientes.
 */
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

  getCarteraFacturas(venCodigo?: string) {
    if (venCodigo) {
      return query(
        `SELECT f.* FROM vw_crm_cartera_facturas_2year f
         WHERE f.per_nombre IN (
           SELECT c.per_nombre FROM vw_crm_clientes c WHERE c.ven_codigo = ?
         )`,
        [venCodigo]
      );
    }
    return query("SELECT * FROM vw_crm_cartera_facturas_2year");
  },

  getCarteraConsolidada(venCodigo?: string) {
    if (venCodigo) {
      return query(
        `SELECT k.* FROM vw_crm_cartera_consolidada k
         WHERE k.per_codigo IN (
           SELECT c.per_codigo FROM vw_crm_clientes c WHERE c.ven_codigo = ?
         )`,
        [venCodigo]
      );
    }
    return query("SELECT * FROM vw_crm_cartera_consolidada");
  },
};
