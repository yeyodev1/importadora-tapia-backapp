# Pedido al proveedor del ERP: número real de factura en la vista de cartera

**Fecha:** 19-ago-2026 · **Urgencia:** alta — bloquea validación de cartera por parte de Importadora Tapia.

## Problema

`vw_crm_cartera_facturas_2year` lee `in_trancab` **sin filtrar el tipo de documento**: mezcla facturas de venta con notas de crédito (y posiblemente otros documentos), todas con su valor sumando como deuda. Serie y número (`trc_serdoc`/`trc_numdoc`) sí corresponden a los del sistema, pero el usuario no puede saber qué tipo de documento está viendo.

Evidencia (cliente OCHOA VIDAL JAIME JOSE, per_codigo 421):

| trc_codigo | trc_serdoc | trc_numdoc | trc_fecha | total |
|---|---|---|---|---|
| 16684 | 102999 | 420 | 2024-09-09 | 64.50 |
| 19284 | 102999 | 474 | 2025-06-30 | 567.00 |
| 20525 | 102999 | 521 | 2025-10-29 | 45.00 |

- Importadora Tapia confirma que las facturas de ese cliente son **7892, 8235, …** y que **no tiene ninguna emisión el 09-sep-2024**.
- La numeración corta es un consecutivo interno correlativo **entre clientes distintos**: 420 (Ochoa, 09-sep) → 421 (Pallo, 10-sep) → 422 (Tinoco, 17-sep) → 423 (Aligrand, 19-sep).
- La serie `102999` mezcla dos numeraciones: una lenta (415→655, ~120/año) y una rápida (9255→12386, miles) — presumiblemente **tipos de documento distintos** que la vista no distingue (no expone `trc_tipdoc`).
- El usuario `crm_user` solo tiene SELECT sobre las 5 vistas; no podemos leer `in_trancab` para resolverlo nosotros.

## Prueba definitiva (reporte oficial de Tapia, 19-ago-2026)

Reporte "Cuentas por cobrar 2024" impreso por María José (JAIME OCHOA VIDAL.pdf):

- Sus 10 facturas reales 2024 (serie 102999): 7892, 8235, 8373, 8432, 8575, 8584, 8721, 8777, 9074, 9230 — **todas con saldo 0.00**.
- El registro que la vista entrega como "factura 420, 09-sep-2024, $64.50 pendiente" es en el reporte una **"Nota de crédito — DESCUENTO POR 3 SACOS NO ENTREGADO", 9/Sep/2024, $64.50, aplicada como abono a la factura 8235**.

Es decir: la vista entrega notas de crédito (numeración lenta 415→655) como facturas por cobrar, con su valor **sumando** a la deuda cuando en realidad la reduce. Los documentos 474 (30-jun-2025, $567) y 521 (29-oct-2025, $45) del mismo cliente presumiblemente también son notas de crédito. La cartera del CRM queda inflada e irreconocible para Tapia.

## Lo que pedimos

Modificar `vw_crm_cartera_facturas_2year` (y de ser posible `vw_crm_cartera_consolidada`) para agregar:

1. **Tipo de documento**: `trc_tipdoc` + su descripción (alias `tipo_documento`). Es lo crítico: hoy no podemos distinguir una factura de venta de una nota de crédito.
2. **Solo cuentas por cobrar reales**: excluir (o marcar) notas de crédito y cualquier documento que no genere deuda; idealmente replicar la misma lógica del reporte "Cuentas por cobrar" del sistema (donde las NC aparecen como abonos, no como cargos).
3. **Fecha de vencimiento / estado real** por documento si el sistema la maneja (hoy la vista la calcula como fecha + per_diascredito, y con 0 días configurados todo aparece "vencido").

Ejemplo de lo esperado (mismo formato de la vista actual + 3 columnas):

```sql
SELECT ..., c.trc_tipdoc, t.nombre AS tipo_documento, c.<columna_numero_factura> AS factura_numero
FROM in_trancab c ...
```

Con eso el CRM muestra exactamente el mismo número que el sistema de Tapia y el problema queda cerrado al 100%.

## Contexto de conexión

Sin cambios: túnel `mysql-crm.bakano.ec`, usuario `crm_user`, solo lectura. El GRANT actual sobre las 5 vistas se mantiene; solo cambia la definición de la(s) vista(s).
