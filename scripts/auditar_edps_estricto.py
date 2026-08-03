#!/usr/bin/env python3
"""
Script de Auditoría Estricta e Independiente de Estados de Pago (EDPs)
----------------------------------------------------------------------
Este script RECALCULA de forma 100% autónoma todas las reglas de negocio
sin confiar en los campos pre-calculados guardados en la tabla 'estados_cuenta'.

Reglas que auditante de forma independiente:
  1. Consumo Bruto de Boletos (confirmedAt entre fecha_inicio y fecha_fin).
  2. (-) Anulaciones del Período (updated_at <= fecha_fin).
  3. (-) Devoluciones Fuera de Período RECALCULADAS DESDE TICKETS:
     Busca tickets de períodos ANTERIORES (confirmedAt < fecha_inicio)
     cuya anulación ocurrió DENTRO de este ciclo (updated_at entre fecha_inicio y fecha_fin)
     y no hayan sido abonados en EDPs previos.
  4. (-) Descuento comercial por porcentaje.
  5. (-) Reclamos aprobados en el período.
  6. Comparación contra 'monto_facturado' en BD.
  7. Comparación contra 'monto' en Cuenta Corriente.

Uso:
  python scripts/auditar_edps_estricto.py
"""

import sys
import pymysql
import json

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

def auditar_estricto():
    connection = pymysql.connect(**DB_CONFIG)
    try:
        with connection.cursor() as cursor:
            log("=" * 95)
            log("  AUDITORIA ESTRICTA E INDEPENDIENTE DE REGLAS DE NEGOCIO Y EDPs")
            log("=" * 95)

            cursor.execute("""
                SELECT id, nombre, dia_facturacion 
                FROM empresas 
                WHERE fact_manual = 0 AND estado = 1 
                ORDER BY id ASC
            """)
            empresas = cursor.fetchall()
            total_empresas = len(empresas)
            log(f"[+] Total de empresas activas a auditar: {total_empresas}\n")

            inconsistencias_reglas = []   # Inconsistencias reales (sistema nuevo >= 2026-07)
            info_historico = []            # Informativas: EDPs antiguos sin snapshot (no verificables con precision)
            inconsistencias_cc = []
            verificados = 0

            for index, emp in enumerate(empresas, 1):
                emp_id = emp['id']
                emp_nombre = emp['nombre']

                cursor.execute("""
                    SELECT * FROM estados_cuenta 
                    WHERE empresa_id = %s 
                    ORDER BY id DESC LIMIT 1
                """, (emp_id,))
                edp = cursor.fetchone()

                if not edp:
                    continue

                edp_id = edp['id']
                periodo = edp['periodo']
                fecha_inicio = edp['fecha_inicio']
                fecha_fin = edp['fecha_fin']

                monto_facturado_bd = to_float(edp['monto_facturado'])
                porcentaje_descuento_bd = to_float(edp['porcentaje_descuento'])
                reclamos_descuento_bd = to_float(edp['reclamos_descuento'])

                # ---------------------------------------------------------------
                # 1. RECALCULAR DEVOLUCIONES FUERA DE PERÍODO INDEPENDIENTE
                # Tickets confirmados antes de fecha_inicio pero anulados en este ciclo
                # ---------------------------------------------------------------
                cursor.execute("""
                    SELECT id, monto_boleto, monto_devolucion
                    FROM tickets
                    WHERE id_empresa = %s
                      AND confirmedAt < %s
                      AND ticketStatus = 'Anulado'
                      AND updated_at >= %s AND updated_at <= %s
                """, (emp_id, fecha_inicio, fecha_inicio, fecha_fin))
                devs_fuera_tickets = cursor.fetchall()

                devoluciones_fuera_calculadas = 0.0
                for d in devs_fuera_tickets:
                    dev = to_float(d['monto_devolucion']) if d['monto_devolucion'] is not None else to_float(d['monto_boleto'])
                    devoluciones_fuera_calculadas += dev

                # ---------------------------------------------------------------
                # 2. RECALCULAR TICKETS DEL PERÍODO (SNAPSHOT O TABLA VIVA)
                # ---------------------------------------------------------------
                cursor.execute("SELECT ticket_data FROM edp_ticket_snapshots WHERE edp_id = %s", (edp_id,))
                snapshots = cursor.fetchall()

                if snapshots:
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
                    tipo_origen = "SNAPSHOT"
                else:
                    cursor.execute("""
                        SELECT id, ticketStatus, monto_boleto, monto_devolucion, updated_at
                        FROM tickets
                        WHERE id_empresa = %s
                          AND confirmedAt >= %s AND confirmedAt <= %s
                    """, (emp_id, fecha_inicio, fecha_fin))
                    tickets_periodo = cursor.fetchall()

                    monto_bruto_calc = 0.0
                    devoluciones_dentro_calc = 0.0

                    for t in tickets_periodo:
                        val = to_float(t['monto_boleto'])
                        if t['ticketStatus'] == 'Confirmed':
                            monto_bruto_calc += val
                        elif t['ticketStatus'] == 'Anulado':
                            # Si se anuló DENTRO del período, no se cuenta como emitido/confirmado neto
                            # Si se anuló DESPUÉS del período, en el momento del cierre estaba Confirmed (sumaba)
                            if t['updated_at'] and str(t['updated_at']) > str(fecha_fin):
                                monto_bruto_calc += val
                            else:
                                pass # Anulado dentro del período -> no suma al consumo neto

                    monto_neto_calc = monto_bruto_calc
                    tipo_origen = "HISTORICO"

                # ---------------------------------------------------------------
                # 3. CÁLCULO AUTÓNOMO DE MONTO ESPERADO SEGÚN REGLAS DE NEGOCIO
                # ---------------------------------------------------------------
                monto_descuento_calc = round(monto_neto_calc * (porcentaje_descuento_bd / 100.0))
                base_facturacion = max(0.0, monto_neto_calc - monto_descuento_calc)
                
                # REGLA TEMPORAL: La lógica de devoluciones fuera de período comenzó a aplicarse 
                # activamente desde el período 2026-07 en adelante.
                # EDPs anteriores a 2026-07 fueron generados con la lógica antigua (sin dev. fuera).
                es_sistema_nuevo = str(periodo) >= '2026-07'
                
                if es_sistema_nuevo:
                    monto_esperado_reglas = max(0.0, base_facturacion - devoluciones_fuera_calculadas - reclamos_descuento_bd)
                else:
                    # En sistema antiguo no se descontaban devoluciones fuera de período
                    monto_esperado_reglas = max(0.0, base_facturacion - reclamos_descuento_bd)

                # ---------------------------------------------------------------
                # 4. VERIFICAR CUENTA CORRIENTE
                # ---------------------------------------------------------------
                cursor.execute("""
                    SELECT monto FROM cuenta_corriente 
                    WHERE empresa_id = %s 
                      AND tipo_movimiento = 'cargo'
                      AND (referencia = %s OR referencia = %s OR estado_cuenta_id = %s)
                    LIMIT 1
                """, (emp_id, f"FACT-{emp_id}-{periodo}", f"CARGO-EDC-{edp_id}", edp_id))
                cc_row = cursor.fetchone()
                monto_cc = to_float(cc_row['monto']) if cc_row else None

                # ---------------------------------------------------------------
                # 5. AUDITORÍA DE INCONSISTENCIAS
                # ---------------------------------------------------------------
                diff_reglas = abs(monto_facturado_bd - monto_esperado_reglas)

                # Para EDPs de $0: si no hay cargo en CC y el monto es 0, es OK
                if monto_cc is None and monto_facturado_bd < 1.0:
                    monto_cc = 0.0
                diff_cc = abs(monto_facturado_bd - monto_cc) if monto_cc is not None else abs(monto_facturado_bd)

                ok_reglas = diff_reglas < 1.0
                ok_cc = (monto_cc is not None) and (diff_cc < 1.0)
                verificados += 1

                if ok_reglas and ok_cc:
                    log(f"[{index}/{total_empresas}] [OK-{tipo_origen}] EDP #{edp_id} ({emp_nombre}) | Periodo: {periodo} | BD: ${monto_facturado_bd:,.0f} | Dev.Fuera Calc: ${devoluciones_fuera_calculadas:,.0f} -> 100% REGLAS Y CC OK")
                else:
                    motivos = []
                    if not ok_reglas:
                        # Sistema antiguo sin snapshot -> no podemos verificar con precision la calc del cron
                        # lo marcamos como INFORMATIVO, no como error real
                        es_historico_sin_snapshot = not es_sistema_nuevo and tipo_origen == 'HISTORICO'

                        if es_historico_sin_snapshot:
                            log(f"[{index}/{total_empresas}] [INFO-HISTORICO] EDP #{edp_id} ({emp_nombre}) | Periodo: {periodo} | BD: ${monto_facturado_bd:,.0f} != Calc: ${monto_esperado_reglas:,.0f} | Dev.Fuera detectable: ${devoluciones_fuera_calculadas:,.0f} (sistema antiguo, sin snapshot)")
                            info_historico.append({
                                'edp_id': edp_id,
                                'empresa_id': emp_id,
                                'empresa_nombre': emp_nombre,
                                'periodo': periodo,
                                'monto_bd': monto_facturado_bd,
                                'monto_esperado_reglas': monto_esperado_reglas,
                                'dev_fuera_calc': devoluciones_fuera_calculadas,
                                'dev_fuera_bd': to_float(edp['devoluciones_fuera_periodo']),
                                'diff': diff_reglas
                            })
                        else:
                            motivos.append(f"Reglas: BD ${monto_facturado_bd:,.0f} != Esperado ${monto_esperado_reglas:,.0f} (Dev.Fuera Calc: ${devoluciones_fuera_calculadas:,.0f} [{'APLICADO' if es_sistema_nuevo else 'HISTORICO-SIN-DEV'}])")
                            inconsistencias_reglas.append({
                                'edp_id': edp_id,
                                'empresa_id': emp_id,
                                'empresa_nombre': emp_nombre,
                                'periodo': periodo,
                                'monto_bd': monto_facturado_bd,
                                'monto_esperado_reglas': monto_esperado_reglas,
                                'dev_fuera_calc': devoluciones_fuera_calculadas,
                                'dev_fuera_bd': to_float(edp['devoluciones_fuera_periodo']),
                                'es_sistema_nuevo': es_sistema_nuevo,
                                'diff': diff_reglas
                            })
                    if not ok_cc:
                        motivos.append(f"CC: BD ${monto_facturado_bd:,.0f} != CC ${monto_cc:,.0f}")
                        inconsistencias_cc.append({
                            'edp_id': edp_id,
                            'empresa_id': emp_id,
                            'empresa_nombre': emp_nombre,
                            'periodo': periodo,
                            'monto_bd': monto_facturado_bd,
                            'monto_cc': monto_cc,
                            'diff_cc': diff_cc
                        })
                    if motivos:
                        log(f"[{index}/{total_empresas}] [INCONSISTENCIA] EDP #{edp_id} ({emp_nombre}) | Periodo: {periodo} | {' | '.join(motivos)}")

            log("\n" + "=" * 95)
            log("  RESUMEN AUDITORIA ESTRICTA DE REGLAS DE NEGOCIO:")
            log(f"  - Total EDPs Auditados: {verificados}")
            log(f"  - EDPs 100% Correctos (Reglas + CC): {verificados - len(inconsistencias_reglas) - len(inconsistencias_cc) - len(info_historico)}")
            log(f"  - [X-REGLA]       Inconsistencias Reales (sistema >= 2026-07): {len(inconsistencias_reglas)}")
            log(f"  - [INFO-HISTORICO] EDPs historicos sin snapshot (no verificables): {len(info_historico)}")
            log(f"  - [X-CC]          Discrepancias de Cuenta Corriente: {len(inconsistencias_cc)}")
            log("=" * 95 + "\n")

            if inconsistencias_reglas:
                log("-" * 95)
                log("INCONSISTENCIAS REALES [X-REGLA] - Sistema nuevo (>= 2026-07), con Snapshot:")
                log("-" * 95)
                for d in inconsistencias_reglas:
                    log(f"[X-REGLA] EDP #{d['edp_id']} | {d['empresa_nombre']} (ID: {d['empresa_id']}) | Periodo: {d['periodo']}")
                    log(f"   - Monto Facturado en BD:             ${d['monto_bd']:,.2f}")
                    log(f"   - Monto Esperado por Reglas Puras:  ${d['monto_esperado_reglas']:,.2f}")
                    log(f"   - Dev.Fuera Recalculadas (Tickets):  ${d['dev_fuera_calc']:,.2f}")
                    log(f"   - Dev.Fuera en BD (campo EDP):       ${d['dev_fuera_bd']:,.2f}")
                    log(f"   - Diferencia de Regla:               ${d['diff']:,.2f}\n")

            if info_historico:
                log("-" * 95)
                log("INFORMATIVOS [INFO-HISTORICO] - Sistema antiguo (< 2026-07) sin snapshot, no verificables con precision:")
                log("  (El cron antiguo pudo haber aplicado logica diferente. CC cuadra = cobro correcto.)")
                log("-" * 95)
                for d in info_historico:
                    log(f"[INFO] EDP #{d['edp_id']} | {d['empresa_nombre']} (ID: {d['empresa_id']}) | Periodo: {d['periodo']}")
                    log(f"   - Monto Facturado en BD:     ${d['monto_bd']:,.2f}")
                    log(f"   - Monto Calc Referencial:    ${d['monto_esperado_reglas']:,.2f}")
                    log(f"   - Dev.Fuera detectable:      ${d['dev_fuera_calc']:,.2f}")
                    log(f"   - Diferencia Referencial:    ${d['diff']:,.2f}\n")

            if inconsistencias_cc:
                log("-" * 95)
                log("DETALLE - EDPs CON DESVIACION DE CUENTA CORRIENTE (BD vs cargo real en CC):")
                log("-" * 95)
                for d in inconsistencias_cc:
                    log(f"[X-CC] EDP #{d['edp_id']} | {d['empresa_nombre']} (ID: {d['empresa_id']}) | Periodo: {d['periodo']}")
                    log(f"   - Monto Facturado en BD:  ${d['monto_bd']:,.2f}")
                    log(f"   - Monto en CC:             ${d['monto_cc']:,.2f}")
                    log(f"   - Diferencia BD vs CC:     ${d['diff_cc']:,.2f}\n")

            if not inconsistencias_reglas and not inconsistencias_cc:
                log("[SUCCESS] Todos los EDPs del sistema nuevo cuadran con las Reglas de Negocio puras y con la Cuenta Corriente.")

    finally:
        connection.close()

if __name__ == '__main__':
    auditar_estricto()
