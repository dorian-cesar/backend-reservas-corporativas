# Explicación Técnica: Corrección de Inconsistencias en EDPs Históricos

Este documento detalla la raíz del problema de consistencia de datos en los Estados de Pago (EDPs) emitidos el **21 de Julio de 2026** y cómo se diseñó el script dinámico para corregirlos.

## 1. El Desafío del Estado Dinámico vs. Snapshot Histórico

El backend de reservas corporativas originalmente calculaba los Estados de Pago dinámicamente sumando los tickets correspondientes al periodo en la base de datos viva.

El **21 de Julio de 2026** se cerró la facturación y se generaron los EDPs (con montos consolidados fijos en `estados_cuenta`). Sin embargo:
1. **No existía la tabla de snapshots:** La lógica e infraestructura de snapshots (`edp_ticket_snapshots`) se desplegó días después, el **27 de Julio de 2026**.
2. **Anulaciones tardías:** Pasajeros y administradores anularon pasajes del periodo de Julio de forma retroactiva *después* del 21 de julio.
3. **Discrepancia en Reportes:** Al intentar generar desgloses de centros de costos o listados de boletos, el backend realizaba consultas en tiempo real de los tickets (ahora marcados como `Anulado`), lo que arrojaba montos de desglose menores al monto facturado consolidado (que permanece inmutable en la base de datos).

---

## 2. Lógica de Reconstrucción del Estado de Corte

Para solucionar esto de manera retroactiva sin alterar las anulaciones legítimas actuales, el script implementa la siguiente lógica:

* **Filtro temporal:** Se recuperan todos los tickets del periodo del EDP.
* **Evaluación al Corte (`cutoff`):** Para cada ticket anulado, se compara la fecha de actualización (`updated_at`) con la fecha de término del periodo de facturación (`fecha_fin` del EDP, ej. `2026-07-20 23:59:59` en hora local de Chile).
  * Si `updated_at` es **posterior** a la fecha de corte, significa que al momento de emitirse el EDP el ticket estaba **confirmado** y debe procesarse como tal en el snapshot histórico.
  * Si `updated_at` es **anterior** a la fecha de corte, el ticket ya estaba anulado y se mantiene anulado.

---

## 3. Automatización Dinámica del Script ([fix-edp-db.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/script/fix-edp-db.ts))

El script fue modificado para procesar un lote de EDPs identificados con discrepancias monetarias. Su comportamiento es el siguiente:

### A. Modularidad por Transacción
Cada EDP de la lista se procesa en una transacción aislada (`sequelize.transaction()`). Si un EDP falla, no interrumpe el procesamiento ni revierte las simulaciones/guardados del resto de la cola.

### B. Extracción de Descuento
En lugar de forzar un 5% estático (que correspondía solo a Aramark), el script lee dinámicamente el `porcentaje_descuento` original guardado en el EDP correspondiente en `estados_cuenta` y aplica la misma tasa comercial al total bruto reconstruido.

### C. Resolución de Cuenta Corriente
Dado que las facturas y cargos se pueden crear desde cron (prefijo `FACT-${empresaId}-${periodo}`) o de manera manual (prefijo `CARGO-EDC-${edpId}`), el script consulta el registro en `cuenta_corriente` utilizando un filtro inclusivo con `OR` y la clave foránea `estado_cuenta_id`.

### D. Recálculo en Cascada
Cuando se actualiza el monto del cargo del EDP en la cuenta corriente, el saldo final de la empresa varía. El script obtiene todos los movimientos históricos subsiguientes de la empresa y recalculas los saldos acumulados secuencialmente para evitar descuadres en la contabilidad corriente.
