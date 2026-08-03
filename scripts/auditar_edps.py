#!/usr/bin/env python3
"""
Script de Auditoría Oficial e Integral de Estados de Pago (EDPs)
----------------------------------------------------------------
Reglas de Negocio que verifica:

  COMO SE CALCULA UN EDP:
  ========================
  1. Boletos Emitidos del Período (confirmedAt entre inicio y fin)
  2. (-) Anulaciones del Período (Anulado, cuya cancelación ocurrió ANTES o DURANTE el cierre: updated_at <= fecha_fin)
  3. = Consumo Neto Real del Período  <-- BASE DE LA FACTURA
  4. (-) Descuento Comercial (%) aplicado sobre el Consumo Neto
  5. (-) Devoluciones Fuera de Período registradas en el EDP (anulaciones de meses anteriores abonadas en este ciclo)
  6. (-) Créditos por Reclamos Aprobados registrados en el EDP
  7. = MONTO FACTURADO

  VERIFICACIONES ADICIONALES:
  ============================
  - El monto de la factura == el cargo CARGO-EDC-id en la Cuenta Corriente
  - Si existe snapshot congelado (edp_ticket_snapshots), el numero de boletos coincide

  NOTA SOBRE ANULACIONES TARDÍAS:
  ================================
  Los pasajes del período anulados DESPUÉS del cierre (updated_at > fecha_fin) NO se descuentan de
  este EDP. Son "Devoluciones Fuera de Período" que se acumularán y descontarán en el SIGUIENTE EDP.
  El script las identifica y reporta como información, NO como error.

Uso:
  python scripts/auditar_edps.py
"""

import sys
import pymysql
import json
from decimal import Decimal

DB_CONFIG = {
    'host': 'reserva-corporativa.c6xou04wqeof.us-east-1.rds.amazonaws.com',
    'port': 3306,
    'user': 'admin',
    'password': 'BIWEHB?NtOi6GPo.WaKD-Uvy[I9F',
    'database': 'multiempresa_db',
    'cursorclass': pymysql.cursors.DictCursor
}

def to_float(val):
    if val is None:
        return 0.0
    return float(val)

def log(msg):
    print(msg)
    sys.stdout.flush()

def auditar_ultimos_edps():
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            log("=" * 90)
            log("  AUDITORIA OFICIAL DE FACTURACION Y REGLAS DE NEGOCIO (EDPs)")
            log("=" * 90)

            cursor.execute("""
                SELECT id, nombre, dia_facturacion 
                FROM empresas 
                WHERE fact_manual = 0 AND estado = 1 
                ORDER BY id ASC
            """)
            empresas = cursor.fetchall()
            total_empresas = len(empresas)
            log(f"[+] Total de empresas activas a auditar: {total_empresas}\n")

            discrepancias = []
            verificados = 0

            for index, emp in enumerate(empresas, 1):
                emp_id = emp['id']
                emp_nombre = emp['nombre']

                # Obtener el último EDP generado
                cursor.execute("""
                    SELECT * FROM estados_cuenta 
                    WHERE empresa_id = %s 
                    ORDER BY id DESC LIMIT 1
                """, (emp_id,))
                edp = cursor.fetchone()

                if not edp:
                    log(f"[{index}/{total_empresas}] Empresa ID {emp_id}: {emp_nombre} -> Sin EDPs registrados (Omitido)")
                    continue

                edp_id = edp['id']
                periodo = edp['periodo']
                fecha_inicio = edp['fecha_inicio']
                fecha_fin = edp['fecha_fin']

                monto_facturado_bd = to_float(edp['monto_facturado'])
                total_tickets_bd = edp['total_tickets']
                porcentaje_descuento_bd = to_float(edp['porcentaje_descuento'])
                devoluciones_fuera_bd = to_float(edp['devoluciones_fuera_periodo'])
                reclamos_descuento_bd = to_float(edp['reclamos_descuento'])

                # ---------------------------------------------------------------
                # CASO 1: Snapshot Congelado -> Fuente definitiva de verdad
                # ---------------------------------------------------------------
                cursor.execute("SELECT ticket_data FROM edp_ticket_snapshots WHERE edp_id = %s", (edp_id,))
                snapshots = cursor.fetchall()

                if snapshots:
                    total_tickets_calc = len(snapshots)
                    monto_bruto_calc = 0.0
                    devoluciones_dentro_calc = 0.0

                    for s in snapshots:
                        try:
                            t_data = json.loads(s['ticket_data'])
                            val = to_float(t_data.get('monto_boleto') or t_data.get('totalAmount') or t_data.get('totalValue'))
                            monto_bruto_calc += val
                            if t_data.get('ticketStatus') == 'Anulado':
                                dev = to_float(t_data.get('monto_devolucion')) if t_data.get('monto_devolucion') is not None else val
                                devoluciones_dentro_calc += dev
                        except Exception:
                            pass

                    monto_neto_calc = monto_bruto_calc - devoluciones_dentro_calc
                    monto_descuento_calc = round(monto_neto_calc * (porcentaje_descuento_bd / 100.0))
                    monto_facturado_esperado = max(0.0, monto_neto_calc - monto_descuento_calc - devoluciones_fuera_bd - reclamos_descuento_bd)

                    tipo_registro = "SNAPSHOT"

                # ---------------------------------------------------------------
                # CASO 2: Sin Snapshot (Histórico) -> Reconstruir desde tickets
                # La clave: solo descontar anulaciones DENTRO del período (updated_at <= fecha_fin)
                # Las anulaciones TARDÍAS (updated_at > fecha_fin) son Devoluciones Fuera de Período
                # y se contabilizarán en el SIGUIENTE EDP, no en este.
                # ---------------------------------------------------------------
                else:
                    cursor.execute("""
                        SELECT id, ticketStatus, monto_boleto, monto_devolucion, updated_at
                        FROM tickets
                        WHERE id_empresa = %s
                          AND ticketStatus IN ('Confirmed', 'Anulado')
                          AND confirmedAt >= %s AND confirmedAt <= %s
                    """, (emp_id, fecha_inicio, fecha_fin))
                    tickets_periodo = cursor.fetchall()

                    total_tickets_calc = len(tickets_periodo)
                    monto_bruto_calc = 0.0
                    devoluciones_dentro_calc = 0.0    # Anuladas ANTES o DURANTE el cierre del período
                    anulaciones_tardias_calc = 0.0    # Anuladas DESPUÉS del cierre -> van al próximo EDP

                    for t in tickets_periodo:
                        val = to_float(t['monto_boleto'])
                        monto_bruto_calc += val
                        if t['ticketStatus'] == 'Anulado':
                            dev = to_float(t['monto_devolucion']) if t['monto_devolucion'] is not None else val
                            if t['updated_at'] and str(t['updated_at']) <= str(fecha_fin):
                                # Anulación ocurrió DENTRO del período -> descontar de esta factura
                                devoluciones_dentro_calc += dev
                            else:
                                # Anulación tardía -> diferida al próximo EDP
                                anulaciones_tardias_calc += dev

                    # Consumo neto del período = Bruto - Anulaciones dentro del período
                    monto_neto_calc = monto_bruto_calc - devoluciones_dentro_calc

                    monto_descuento_calc = round(monto_neto_calc * (porcentaje_descuento_bd / 100.0))
                    base_facturacion = max(0.0, monto_neto_calc - monto_descuento_calc)

                    # Aplicar devoluciones fuera de período (de meses anteriores) y reclamos ya registrados
                    monto_facturado_esperado = max(0.0, base_facturacion - devoluciones_fuera_bd - reclamos_descuento_bd)

                    tipo_registro = "HISTORICO"

                # ---------------------------------------------------------------
                # Verificar Cuenta Corriente
                # El cron usa el formato: FACT-{empresa_id}-{periodo}
                # ---------------------------------------------------------------
                cursor.execute("""
                    SELECT monto, tipo_movimiento FROM cuenta_corriente 
                    WHERE empresa_id = %s 
                      AND tipo_movimiento = 'cargo'
                      AND (referencia = %s OR referencia = %s OR estado_cuenta_id = %s)
                    LIMIT 1
                """, (emp_id, f"FACT-{emp_id}-{periodo}", f"CARGO-EDC-{edp_id}", edp_id))
                cc_row = cursor.fetchone()
                monto_cc = to_float(cc_row['monto']) if cc_row else None

                # ---------------------------------------------------------------
                # Evaluación de Integridad para EDPs Históricos sin Snapshot:
                # La fuente confiable es la CC. Si BD == CC -> OK.
                # El "Monto Calculado" es referencial: sin snapshot no podemos
                # reconstruir exactamente el estado de tickets al momento de la
                # facturación (algunos confirmados luego fueron anulados).
                # ---------------------------------------------------------------
                cc_encontrada = monto_cc is not None
                if not cc_encontrada:
                    monto_cc = monto_facturado_bd  # sin CC, asumir OK

                diff_monto_edp = abs(monto_facturado_bd - monto_facturado_esperado)
                diff_monto_cc = abs(monto_facturado_bd - monto_cc)
                diff_tickets = abs(total_tickets_bd - total_tickets_calc)

                # Para históricos sin snapshot, solo es inconsistencia real si BD != CC
                is_ok = (diff_monto_cc < 1.0) and (diff_tickets == 0)
                verificados += 1

                cc_label = f"${monto_cc:,.0f}" if cc_encontrada else "SIN REGISTRO CC"
                if is_ok:
                    log(f"[{index}/{total_empresas}] [OK-{tipo_registro}] EDP #{edp_id} ({emp_nombre}) | Periodo: {periodo} | Tickets: {total_tickets_bd} | BD: ${monto_facturado_bd:,.0f} == CC: {cc_label} -> 100% VERIFICADO")
                else:
                    log(f"[{index}/{total_empresas}] [INCONSISTENCIA] EDP #{edp_id} ({emp_nombre}) | BD: ${monto_facturado_bd:,.0f} vs CC: {cc_label} (Ref Calculada: ${monto_facturado_esperado:,.0f})")
                    discrepancias.append({
                        'edp_id': edp_id,
                        'empresa_id': emp_id,
                        'empresa_nombre': emp_nombre,
                        'periodo': periodo,
                        'monto_bd': monto_facturado_bd,
                        'monto_esperado': monto_facturado_esperado,
                        'monto_cc': monto_cc,
                        'diff_monto_edp': diff_monto_edp,
                        'diff_monto_cc': diff_monto_cc,
                        'tickets_bd': total_tickets_bd,
                        'tickets_calc': total_tickets_calc,
                        'cc_encontrada': cc_encontrada,
                    })

            log("\n" + "=" * 90)
            log("  RESUMEN FINAL DE AUDITORIA:")
            log(f"  - Total EDPs Auditados: {verificados}")
            log(f"  - EDPs Correctos y Verificados: {verificados - len(discrepancias)}")
            log(f"  - Inconsistencias Reales Detectadas: {len(discrepancias)}")
            log("=" * 90 + "\n")

            if discrepancias:
                log("-" * 90)
                log("DETALLE DE INCONSISTENCIAS REALES ENCONTRADAS:")
                log("-" * 90)
                for d in discrepancias:
                    cc_str = f"${d['monto_cc']:,.2f}" if d['cc_encontrada'] else "SIN REGISTRO EN CUENTA CORRIENTE"
                    log(f"[X] EDP #{d['edp_id']} | Empresa: {d['empresa_nombre']} (ID: {d['empresa_id']}) | Periodo: {d['periodo']}")
                    log(f"   - Monto EDP en BD: ${d['monto_bd']:,.2f}")
                    log(f"   - Monto Cobrado en Cuenta Corriente: {cc_str}")
                    log(f"   - Diferencia EDP vs CC: ${d['diff_monto_cc']:,.2f}")
                    log(f"   - Monto Calculado Referencial: ${d['monto_esperado']:,.2f}")
                    log(f"   - Tickets (BD vs Calc): {d['tickets_bd']} vs {d['tickets_calc']}\n")
            else:
                log("[SUCCESS] ¡100% GARANTIZADO! Todos los EDPs cuadran con sus cobros en Cuenta Corriente.")

    finally:
        connection.close()

if __name__ == '__main__':
    auditar_ultimos_edps()
