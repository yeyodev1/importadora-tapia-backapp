import pool from "../config/mysql";

export const ErpService = {
  async getClientes() {
    const [rows] = await pool.query("SELECT * FROM vw_crm_clientes");
    return rows;
  },

  async getVendedores() {
    const [rows] = await pool.query("SELECT * FROM vw_crm_vendedores");
    return rows;
  },

  async getInventario() {
    const [rows] = await pool.query("SELECT * FROM vw_crm_inventario");
    return rows;
  },

  async getCarteraFacturas() {
    const [rows] = await pool.query("SELECT * FROM vw_crm_cartera_facturas_2year");
    return rows;
  },

  async getCarteraConsolidada() {
    const [rows] = await pool.query("SELECT * FROM vw_crm_cartera_consolidada");
    return rows;
  },
};
