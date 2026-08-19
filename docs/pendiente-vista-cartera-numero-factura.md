# Pedido al proveedor del ERP: número real de factura en la vista de cartera

**Fecha:** 19-ago-2026 · **Urgencia:** alta — bloquea validación de cartera por parte de Importadora Tapia.

## Problema

`vw_crm_cartera_facturas_2year` expone `trc_serdoc` y `trc_numdoc` de `in_trancab`, pero ese número **no es el número de factura que imprime el sistema** y que el cliente reconoce.

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

## Lo que pedimos

Modificar `vw_crm_cartera_facturas_2year` (y de ser posible `vw_crm_cartera_consolidada`) para agregar:

1. **Número de factura tal como se imprime** (serie + secuencial que ve el cliente, ej. `7892`), desde la columna que corresponda en `in_trancab` o su tabla relacionada. Alias sugerido: `factura_numero` (y `factura_serie` si aplica).
2. **Tipo de documento**: `trc_tipdoc` + su descripción (alias `tipo_documento`), para poder mostrar/filtrar qué es cada saldo (factura, letra, cheque, saldo inicial, etc.).
3. **Fecha de emisión real de la factura** si `trc_fecha` no lo es para todos los tipos.

Ejemplo de lo esperado (mismo formato de la vista actual + 3 columnas):

```sql
SELECT ..., c.trc_tipdoc, t.nombre AS tipo_documento, c.<columna_numero_factura> AS factura_numero
FROM in_trancab c ...
```

Con eso el CRM muestra exactamente el mismo número que el sistema de Tapia y el problema queda cerrado al 100%.

## Contexto de conexión

Sin cambios: túnel `mysql-crm.bakano.ec`, usuario `crm_user`, solo lectura. El GRANT actual sobre las 5 vistas se mantiene; solo cambia la definición de la(s) vista(s).
