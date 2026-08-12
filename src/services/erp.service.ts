import { getPool } from "../config/mysql";

async function queryView(view: string) {
  const pool = await getPool();
  const [rows] = await pool.query(`SELECT * FROM ${view}`);
  return rows;
}

export const ErpService = {
  getClientes: () => queryView("vw_crm_clientes"),
  getVendedores: () => queryView("vw_crm_vendedores"),
  getInventario: () => queryView("vw_crm_inventario"),
  getCarteraFacturas: () => queryView("vw_crm_cartera_facturas_2year"),
  getCarteraConsolidada: () => queryView("vw_crm_cartera_consolidada"),
};
