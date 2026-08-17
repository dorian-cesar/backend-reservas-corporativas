# Contexto de Desarrollo — Estado de Cuenta y Nuevo Sistema (Julio 2026 en adelante)

Este documento detalla las reglas de negocio, la estructura de la base de datos y la lógica de negocio aplicada en el sistema de reportes a partir del **período 2026-07**. Cualquier desarrollador o IA que trabaje sobre este módulo en el futuro debe regirse por estas especificaciones para mantener la coherencia en el cuadre de datos.

---

## 1. El Hito de Inicio

A partir de **Julio de 2026** (`2026-07`), el sistema migró hacia un nuevo modelo de control contable y visualización de saldos. 

### Parámetros Críticos de Corte:
* **Período de Inicio del Nuevo Sistema:** `2026-07` (Julio de 2026 en adelante).
* **Fecha de Corte de Movimientos:** `2026-08-04 00:00:00` (Fecha del reinicio masivo).
* **Corte Contable:** No se arrastran saldos históricos ni deudas previas a esta fecha. Las cuentas corrientes inician contablemente desde **$0.00** en Julio.

---

## 2. Reglas de Negocio para el Cuadre de Saldos

Para asegurar la simplicidad del reporte y evitar arrastrar saldos desactualizados previos a la migración, se definieron las siguientes reglas de negocio:

1. **Exclusión de Transacciones Antiguas:** 
   No se deben calcular EDPs generados antes del período `2026-07`. Los estados de cuenta correspondientes a periodos anteriores se ignoran en el consolidado de reportes activos.
   
2. **Exclusión de Movimientos Históricos de Cuenta Corriente:** 
   Únicamente se leen los movimientos cuyo `fecha_movimiento >= '2026-08-04 00:00:00'`. Cualquier cargo o abono previo a esta fecha no afecta el saldo visible del cliente.

3. **Cálculo de Saldo Actual Puro:**
   El saldo actual de una empresa en pantalla se calcula matemáticamente de forma dinámica sobre el rango activo:
   $$\text{Saldo Actual} = \text{Total EDPs del período} - \text{Total Abonos del período}$$
   No se lee la columna `saldo` guardada en la base de datos para los consolidados debido a que en el entorno de producción algunos registros post-reinicio forzaron el balance a cero incorrectamente. Este cálculo dinámico garantiza un cuadre exacto al 100%.

---

## 3. Lógica de Consultas en el Backend (`reports.controller.ts`)

En los helpers y controladores de reportes del backend, la información se procesa de la siguiente manera:

### A. Reporte Global por Período
* **Monto por Período:** Se listan las columnas mensuales (ej. `2026-07`, `2026-08`) sumando la facturación real de los estados de cuenta (`estados_cuenta.monto_facturado`) pertenecientes a cada período.
* **Abonos:** Se calcula la sumatoria de abonos realizados post-reinicio. Para no duplicar ni distorsionar los balances con asientos contables de ajuste de `$0.00`, se omiten explícitamente los registros de reinicio usando `referencia != 'REINICIO-SISTEMA-2026-08-04'`.
* **Saldo Actual:** Se calcula en caliente para cada empresa como `Total EDPs - Total Abono` (partiendo de un saldo de reinicio de `$0.00` para no arrastrar deudas históricas).

### B. Reporte Detallado por Empresa
* **Sección EDPs:** Lista en orden cronológico los estados de pago del nuevo sistema (`>= '2026-07'`).
* **Sección Cuenta Corriente:** Lista cronológicamente todos los cargos y abonos posteriores, omitiendo de forma visual asientos virtuales de reinicio para enfocarse únicamente en movimientos de facturación y abonos reales.

---

## 4. Visualización en el Frontend (`super-reports.tsx`)

* **Reporte por Períodos:** Se muestra la columna **"Saldo Actual"** directamente desde el cálculo dinámico del backend.
* **Reporte por Empresa (Vista "Todas"):** Muestra una tabla consolidada limpia con el resumen de `Total EDP (+)` vs `Total Abonos (-)` y su respectivo `Saldo Actual`.
* **Reporte por Empresa (Vista individual):** Muestra el desglose detallado de EDPs a la izquierda y movimientos de Cuenta Corriente a la derecha, en dos tablas limpias alineadas.

---

## 5. Exportaciones (Excel / PDF)

* Tanto el Excel como el PDF para el detalle de empresa se estructuran como **tablas apareadas** lado a lado (EDP a la izquierda, Estado Cuenta Corriente a la derecha) alineadas fila por fila, de forma idéntica a la maqueta contable establecida.
