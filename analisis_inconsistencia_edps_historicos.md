# Análisis de Inconsistencias en EDPs Históricos sin Snapshot

Este documento explica el origen técnico de las incongruencias detectadas al exportar o visualizar Estados de Pago (EDPs) históricos, específicamente el **EDP N° 7648** y otros emitidos en la misma fecha.

## 1. Causa Raíz del Desajuste Aritmético

El desajuste (como el caso de Aramark donde los totales de Centros de Costo sumaban $15.443.304 pero el Monto Final cobraba $18.525.195) ocurre por una **desincronización temporal** provocada por la falta de snapshots inmutables:

1. **Corte y Emisión (21-07-2026):** El EDP se calcula con el estado de los pasajes en ese instante. En esa fecha, había **833 tickets confirmados** y **146 anulados**. El monto consolidado bruto se grabó directamente como **$18.525.195** en el registro del EDP.
2. **Anulaciones Tardías Posteriores:** Entre el 21 de julio y el 19 de agosto, **50 pasajes** que estaban confirmados al momento del cierre de facturación fueron anulados de forma retroactiva por los usuarios en el sistema.
3. **Visualización Dinámica sin Snapshot (Fallback):** Al intentar generar el reporte hoy, como **no existen snapshots grabados**, el backend realiza una consulta dinámica a la tabla en vivo de `tickets`. Esta consulta ve **783 confirmados** ($16.256.110) y **196 anulados** ($5.264.805). Por ende, calcula el desglose con los datos actuales, pero muestra el monto final consolidado inmutable de la base de datos ($18.525.195).

> [!IMPORTANT]
> El descuento de tramos del 5% no se había restado en el registro original del EDP en base de datos. Al aplicar la corrección, el monto final a cobrar debe normalizarse a **$17.598.935** ($18.525.195 de base confirmada - $926.260 de descuento).

## 2. Línea de Tiempo del Sistema

* **21-07-2026 (03:59:59 UTC):** Se ejecutan los EDPs del período. Aún **no existía** la base de código ni la tabla de snapshots en producción.
* **27-07-2026 (13:57:30 UTC):** Se integra y despliega el commit `1e095ce` que implementa los snapshots relacionales (`edp_ticket_snapshots`) para congelar los tickets históricamente.
* **21-07-2026 al 19-08-2026:** Se registran anulaciones posteriores para tickets emitidos en el periodo anterior.

---

## 3. Listado Completo de EDPs Afectados (Generados el 21 de Julio de 2026)

Los siguientes **77 Estados de Pago** fueron creados el 21 de julio de 2026 y **carecen de snapshots**. Si existen anulaciones posteriores de pasajes correspondientes a este periodo, presentarán inconsistencias al descargarse:

| ID EDP | ID Empresa | Nombre de la Empresa | Periodo | Monto Facturado en BD |
|---|---|---|---|---|
| **7693** | 449 | SODEXO CHILE SPA | 2026-06 | $45.526.650 |
| **7625** | 11 | KOMATSU CHILE S.A. (A11040-7) | 2026-06 | $19.317.181 |
| **7648** | 55 | ARAMARK SERVICIOS MINEROS Y REMOTOS LTDA (M23212-5) | 2026-06 | $17.598.935 |
| **7628** | 22 | SANTA ELVIRA S.A. | 2026-06 | $17.089.345 |
| **7685** | 389 | MARIA LORETO HERRERA SPANO SERVICIOS E.I | 2026-06 | $15.586.415 |
| **7692** | 448 | SOCIEDAD QUIMICA Y MINERA DE CHILE SA (SQM) | 2026-06 | $11.983.855 |
| **7697** | 462 | Tecnica Nacional de Servicios, Ingeneria y Construcción ( TECNASIC) | 2026-06 | $9.736.961 |
| **7630** | 24 | DESARROLLOS MINEROS AURA SPA | 2026-06 | $5.797.545 |
| **7626** | 13 | MIES SERVICIOS INDUSTRIALES LTDA | 2026-06 | $5.528.640 |
| **7667** | 202 | NEWREST CATERING CHILE  (M23111-0) | 2026-06 | $4.629.170 |
| **7629** | 23 | EMPRESAS DE BUSES HUALPEN LTDA. | 2026-06 | $4.249.635 |
| **7700** | 472 | TIP TOP SERVICE SPA | 2026-06 | $3.181.100 |
| **7702** | 511 | STRACON CHILE SPA (M23793-3) | 2026-06 | $2.516.163 |
| **7637** | 41 | AMECO CHILE S A (M21892-0) | 2026-06 | $2.472.145 |
| **7639** | 44 | AMECO CHILE S A (M22759-8) | 2026-06 | $2.431.065 |
| **7662** | 192 | NEWREST CATERING CHILE  (M22721-0) | 2026-06 | $2.361.450 |
| **7658** | 121 | METSO CHILE SPA (M23353-9) | 2026-06 | $2.333.357 |
| **7668** | 203 | NEWREST CATERING CHILE  (M23112-9) | 2026-06 | $2.129.205 |
| **7627** | 15 | UNITED SISTEMA DE TUBERIAS SPA | 2026-06 | $2.074.540 |
| **7650** | 66 | BESALCO MAQUINARIAS S.A.  (M22475-0) | 2026-06 | $1.992.575 |
| **7649** | 63 | BESALCO  MONTAJES S.A. (M23292-3) | 2026-06 | $1.932.840 |
| **7695** | 456 | SQM INDUSTRIAL S.A. | 2026-06 | $1.929.200 |
| **7671** | 206 | NEWREST CATERING CHILE  (M23566-3) | 2026-06 | $1.736.150 |
| **7682** | 354 | G4S SECURITY SERVICES REGIONES S.A. | 2026-06 | $1.477.190 |
| **7684** | 384 | JOY GLOBAL CHILE S.A. | 2026-06 | $1.379.105 |
| **7665** | 195 | NEWREST CATERING CHILE  (M22725-3) | 2026-06 | $1.322.763 |
| **7653** | 96 | FLS SMIDTH S.A. (M22259-6) | 2026-06 | $1.246.765 |
| **7680** | 350 | FINNING CHILE S A | 2026-06 | $1.227.200 |
| **7675** | 314 | COOPERATIVA DE CONSUMOS CARABINEROS DE CH | 2026-06 | $1.125.345 |
| **7664** | 194 | NEWREST CATERING CHILE  (M22724-5) | 2026-06 | $923.715 |
| **7689** | 432 | SIGA INGENIERIA Y CONSULTORIA S.A. | 2026-06 | $893.100 |
| **7669** | 204 | NEWREST CATERING CHILE  (M23408-K) | 2026-06 | $849.810 |
| **7687** | 418 | NOVA ANDINO LITIO SPA | 2026-06 | $842.400 |
| **7696** | 457 | SQM NITRATOS S.A. | 2026-06 | $840.190 |
| **7698** | 468 | THIESS CHILE SPA | 2026-06 | $692.250 |
| **7656** | 115 | INGENIERIA Y CONSTRUCCION SIGDO KOPPER (M23020-3) | 2026-06 | $646.100 |
| **7659** | 122 | METSO CHILE SPA (M23745-3) | 2026-06 | $560.690 |
| **7663** | 193 | NEWREST CATERING CHILE  (M22723-7) | 2026-06 | $551.785 |
| **7674** | 295 | COMPAÑIA DE SERVICIOS INDUSTRIALES LIMITADA (B15333-9) | 2026-06 | $504.725 |
| **7686** | 405 | MUTUAL DE SEGURIDAD CAMARA CHILENA DE LA | 2026-06 | $494.000 |
| **7660** | 123 | METSO OUTOTEC INDUSTRIAL SERVICES SPA (M23355-5) | 2026-06 | $429.650 |
| **7640** | 46 | AMECO CHILE S A (M23424-1) | 2026-06 | $427.635 |
| **7683** | 359 | GM RENEWABLES HOLDINGS SPA | 2026-06 | $390.000 |
| **7677** | 333 | DUFFCO INGENIERIRA Y CONSTRUCCION SPA | 2026-06 | $364.130 |
| **7651** | 79 | CENTRAL DE RESTAURANTES ARAMARK LIMITADA (B00074-5) | 2026-06 | $338.000 |
| **7678** | 336 | EL ESPINO SPA | 2026-06 | $280.020 |
| **7652** | 92 | EMIN ING.Y CONSTRUCCION LTDA (M20350-8) | 2026-06 | $266.370 |
| **7657** | 117 | INGENIERIA Y CONSTRUCCION SIGDO KOPPER (M23199-4) | 2026-06 | $246.740 |
| **7655** | 106 | INGENIERIA Y CONSTRUCCION SIGDO KOPPER (M22681-8) | 2026-06 | $210.600 |
| **7679** | 339 | EMPRESA CONSTRUCTORA BELFI S A (M23359-8) | 2026-06 | $205.400 |
| **7647** | 53 | AMECO CHILE S A (M23743-7) | 2026-06 | $189.800 |
| **7644** | 50 | AMECO CHILE S A (M23740-2) | 2026-06 | $162.266 |
| **7634** | 37 | AMECO CHILE S A (A11110-1) | 2026-06 | $157.300 |
| **7673** | 276 | ATENTO CHILE SA | 2026-06 | $127.790 |
| **7688** | 426 | SERVICIOS INTEGRALES DE TRANSITOS Y TRAN | 2026-06 | $118.560 |
| **7638** | 42 | AMECO CHILE S A (M21893-9) | 2026-06 | $114.920 |
| **7642** | 48 | AMECO CHILE S A (M23540-K) | 2026-06 | $83.200 |
| **7670** | 205 | NEWREST CATERING CHILE  (M23425-K) | 2026-06 | $75.270 |
| **7641** | 47 | AMECO CHILE S A (M23534-5) | 2026-06 | $61.100 |
| **7666** | 199 | NEWREST CATERING CHILE  (M22800-4) | 2026-06 | $54.600 |
| **7690** | 437 | SK INDUSTRIAL S.A. (M23508-6) | 2026-06 | $52.000 |
| **7694** | 450 | SOLETANCHE BACHY CHILE SPA | 2026-06 | $36.400 |
| **7676** | 315 | CORPESCA S A | 2026-06 | $26.650 |
| **7624** | 10 | Servicios Minero Mintral LTDA | 2026-06 | $0 |
| **7681** | 352 | FUNDACION DESAFIO LEVANTEMOS CHILE | 2026-06 | $0 |
| **7701** | 483 | PRODRILLING S.A. | 2026-06 | $0 |
| **7643** | 49 | AMECO CHILE S A (M23571-K) | 2026-06 | $0 |
| **7631** | 27 | GM ENERGY SPA | 2026-06 | $0 |
| **7645** | 51 | AMECO CHILE S A (M23741-0) | 2026-06 | $0 |
| **7646** | 52 | AMECO CHILE S A (M23742-9) | 2026-06 | $0 |
| **7632** | 34 | ADMINISTRADORA DE FONDOS DE PENSION HABI (C23135-K) | 2026-06 | $0 |
| **7633** | 36 | AMECO CHILE S A (A11109-8) | 2026-06 | $0 |
| **7691** | 447 | SOCIEDAD PUNTA DEL COBRE S.A | 2026-06 | $0 |
| **7636** | 39 | AMECO CHILE S A (D46121-9) | 2026-06 | $0 |
| **7661** | 124 | METSO OUTOTEC INDUSTRIAL SERVICES SPA (M23356-3) | 2026-06 | $0 |
| **7635** | 38 | AMECO CHILE S A (C23252-6) | 2026-06 | $0 |
| **7672** | 268 | AFJ HEALTH & SAFETY CHILE SPA | 2026-06 | $0 |

---

## 4. Solución y Prevención

Para corregir cualquier EDP de esta lista que presente discrepancias visuales, se ha dejado configurado un script genérico en [`src/script/fix-edp-db.ts`](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/script/fix-edp-db.ts) que:
1. Reconstruye el estado de los tickets a la fecha exacta de corte (marcando como "Confirmed" en el snapshot las anulaciones tardías).
2. Calcula e inserta los snapshots relacionales correctos.
3. Normaliza el monto facturado, porcentaje de descuento y desglose por centro de costo en la tabla `estados_cuenta`.
4. Actualiza y recalcula los cargos y balances consecutivos en la cuenta corriente de la empresa.
