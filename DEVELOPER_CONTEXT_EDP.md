# Contexto de Desarrollo IA - Devoluciones Fuera de Periodo y Rollover de Saldos

Este documento sirve como contexto técnico para que cualquier desarrollador o IA comprenda las modificaciones realizadas en el sistema de facturación (Estados de Pago - EDP) con respecto a la gestión de devoluciones fuera de periodo, acumulación de crédito (rollover) y consistencia en el PDF.

---

## 1. Contexto del Negocio y Problema

1. **Devoluciones Fuera de Periodo**:
   * Ocurre cuando un ticket emitido y confirmado en un periodo anterior (ej. Junio) se anula tardíamente en el periodo de facturación en curso (ej. Julio).
   * Al cerrar la facturación de Junio, ese periodo ya está cerrado y facturado. Por lo tanto, el reembolso por la anulación debe descontarse en la factura del **siguiente periodo** (Julio).
   
2. **Lógica de Rollover (Saldos a Favor)**:
   * Si la suma de las devoluciones (tanto las del periodo en curso como las fuera de periodo) y los reclamos pendientes de la empresa supera la facturación bruta de ese mes, el monto facturado final del EDP queda en **`$0`**.
   * El remanente/excedente que no pudo ser absorbido no debe perderse. Se debe sumar y arrastrar al campo `descuento_pendiente_edp` de la empresa en la base de datos para aplicarse en el siguiente periodo mensual.

3. **Consistencia Visual en el PDF**:
   * Las líneas de descuento mostradas en el desglose del PDF (`Devoluciones fuera de periodo` y `Descuento por Reclamos`) deben reflejar **solamente los montos realmente aplicados** para reducir el balance del mes.
   * Si el crédito total excede las compras del mes, la diferencia no aplicada se calcula y muestra bajo la etiqueta **`Saldo a Favor Restante (Acumulado para próx. periodo)`** en texto plano para transparentar el saldo que se arrastra al siguiente mes.

---

## 2. Lógica Matemática de Distribución de Descuentos

Al momento de generar un EDP (sea de manera automática vía Cron o manual vía controlador):

1. **Balance Inicial**:
   * `balance = monto_facturado` (consumo bruto de compras del periodo actual menos descuento por tramos comerciales).
   
2. **Distribución del Saldo por Devoluciones Fuera de Periodo**:
   * Si `balance >= devoluciones_fuera_periodo`:
     * `devoluciones_fuera_periodo_aplicadas = devoluciones_fuera_periodo`
     * `devoluciones_fuera_periodo_restante = 0`
     * `balance -= devoluciones_fuera_periodo_aplicadas`
   * Si `balance < devoluciones_fuera_periodo`:
     * `devoluciones_fuera_periodo_aplicadas = balance`
     * `devoluciones_fuera_periodo_restante = devoluciones_fuera_periodo - balance`
     * `balance = 0`

3. **Distribución del Saldo por Reclamos Aprobados**:
   * Si `balance >= descuentoReclamosDisponibles` (de la empresa):
     * `reclamos_aplicados = descuentoReclamosDisponibles`
     * `reclamos_restante = 0`
     * `balance -= reclamos_aplicados`
   * Si `balance < descuentoReclamosDisponibles`:
     * `reclamos_aplicados = balance`
     * `reclamos_restante = descuentoReclamosDisponibles - balance`
     * `balance = 0`

4. **Resultado Final**:
   * El monto facturado del EDP se guarda en: `monto_facturado = balance` (que será `$0` si los descuentos absorbieron el consumo).
   * El nuevo saldo a favor acumulado en la base de datos de la empresa es: `descuento_pendiente_edp = devoluciones_fuera_periodo_restante + reclamos_restante`.

---

## 3. Mapeo de Archivos y Código Modificado

### A. Backend (`backend-reservas-corporativas`)

#### 1. Modelo del EDP: [estado_cuenta.model.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/models/estado_cuenta.model.ts)
* Se agregó la columna y propiedad `devoluciones_fuera_periodo` (tipo `DECIMAL(12, 2)`) a la tabla `estados_cuenta` en la base de datos y al modelo Sequelize para registrar la trazabilidad del descuento tardío aplicado.

#### 2. Proceso Automático (Cron): [generarEstadosPagoEmpresas.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/cron/generarEstadosPagoEmpresas.ts)
* **Detección de Devoluciones Fuera de Periodo**:
  * Busca tickets anulados que cumplan: `confirmedAt < inicio_periodo` AND `updated_at BETWEEN inicio_periodo AND fin_periodo` AND `ticketStatus = 'Anulado'`.
* **Cálculo de Neto del Periodo**:
  * Modificado para calcular el consumo neto sin descontar doblemente los anulados fuera de periodo en el primer paso: `monto_neto_consumo_real = monto_bruto - devoluciones`.
* **Aplicación y Actualización de Empresa**:
  * Implementa la lógica secuencial descrita en el apartado 2 y actualiza `descuento_pendiente_edp` del modelo `Empresa`.

#### 3. Endpoint de Facturación Manual: [estadoCuenta.controller.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/controllers/estadoCuenta.controller.ts)
* Replica exactamente el mismo algoritmo de detección, distribución secuencial de saldos aplicados e incremento del remanente en el modelo de la empresa al generar un EDP manualmente.
* **Nota sobre listado de tickets**: La ruta para listar los tickets de un EDP (`listarTicketsDeEstadoCuenta`) se mantiene con la consulta estándar (`confirmedAt BETWEEN inicio AND fin`), por lo cual los tickets de meses pasados no aparecerán físicamente en la grilla mensual del frontend para no distorsionar el reporte.

#### 4. Controlador de PDF: [pdf.controller.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/controllers/pdf.controller.ts)
* **Cálculo de Consumo Bruto y Saldo a Favor**:
  * Recupera los tickets confirmados del periodo y genera los montos agrupados.
  * Calcula dinámicamente el `saldo_favor_restante` que no se pudo absorber usando la fórmula:
    `saldo_favor_restante = Math.max(0, (devolucionesEstado + devoluciones_fuera_periodo + montoReclamos) - consumoBruto)`
* **Manejo de Robustez (Sin Asignar)**:
  * Si un ticket no tiene un centro de costo válido en el sistema o pertenece a otra empresa, se mapea automáticamente bajo el nombre **`Sin asignar`** (ID `-1`) en lugar de omitirse. Esto garantiza que el monto total bruto calculado coincida siempre con el del EDP.

#### 5. Generador y Diseñador del PDF: [pdf.service.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/services/pdf.service.ts)
* Se expandió la interfaz `EDPPDFData` para soportar `devoluciones_fuera_periodo` y `saldo_favor_restante`.
* En la sección de **Resumen Operacional**, si `saldo_favor_restante > 0`, se dibuja una fila de texto regular en color negro:
  `Saldo a Favor Restante (Acumulado para próx. periodo): $XXXX`
* El rectángulo gris de fondo del bloque se ajusta dinámicamente en altura para no desbordar el texto en el PDF.

### B. Frontend (`Reservas-Corporativas`)

#### 1. Tipo de Datos del EDP: [estado-pago.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/estado-pago.tsx)
* Se agregó la propiedad opcional `devoluciones_fuera_periodo` a la interfaz `EstadoCuentaType`.
* Se actualizó la función `handleAdd` para que, tras invocar la creación del EDP, actualice el filtro de la empresa en la grilla y ejecute de inmediato la función `fetchEstadosCuenta` para refrescar los datos automáticamente sin necesidad de recargar la página.
