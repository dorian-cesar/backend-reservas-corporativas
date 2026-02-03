import "../database";
import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { QueryTypes } from "sequelize";
import { Op } from "sequelize";

/** Limita día al último del mes si no existe */
function clampDay(year: number, monthZeroBased: number, day: number): number {
    const last = new Date(year, monthZeroBased + 1, 0).getDate();
    return Math.min(day, last);
}

/** Formato SQL local YYYY-MM-DD HH:mm:ss */
function formatSQL(d: Date): string {
    const p = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
        d.getHours()
    )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Crea una fecha con hora específica */
function createDate(year: number, month: number, day: number, hour: number = 0, minute: number = 0, second: number = 0): Date {
    return new Date(year, month, day, hour, minute, second);
}

/** Calcula el período de facturación para una fecha dada */
function calcularPeriodo(fecha: Date, diaFacturacion: number): { inicio: Date; fin: Date } {
    const mes = fecha.getMonth();
    const anio = fecha.getFullYear();

    // Si la fecha es antes del día de facturación, el período empieza el mes anterior
    if (fecha.getDate() < diaFacturacion) {
        let mesInicio = mes - 1;
        let anioInicio = anio;

        if (mesInicio < 0) {
            mesInicio = 11;
            anioInicio--;
        }

        const inicio = createDate(
            anioInicio,
            mesInicio,
            clampDay(anioInicio, mesInicio, diaFacturacion),
            0, 0, 0
        );

        const fin = createDate(
            anio,
            mes,
            clampDay(anio, mes, diaFacturacion) - 1,
            23, 59, 59
        );

        return { inicio, fin };
    } else {
        // Si la fecha es en o después del día de facturación, el período empieza este mes
        const inicio = createDate(
            anio,
            mes,
            clampDay(anio, mes, diaFacturacion),
            0, 0, 0
        );

        // Fin: día anterior al día de facturación del siguiente mes
        let mesFin = mes + 1;
        let anioFin = anio;

        if (mesFin > 11) {
            mesFin = 0;
            anioFin++;
        }

        const fin = createDate(
            anioFin,
            mesFin,
            clampDay(anioFin, mesFin, diaFacturacion) - 1,
            23, 59, 59
        );

        return { inicio, fin };
    }
}

/** Obtiene el primer ticket de una empresa */
async function obtenerPrimerTicket(empresaId: number, sequelize: any): Promise<Date | null> {
    const sql = `
    SELECT MIN(T.confirmedAt) as primer_ticket
    FROM tickets T
    JOIN pasajeros P ON T.id_pasajero = P.id
    WHERE P.id_empresa = :empresaId
      AND T.ticketStatus IN ('Confirmed', 'Anulado')
  `;

    const result: any = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: { empresaId },
    });

    if (result[0] && result[0].primer_ticket) {
        return new Date(result[0].primer_ticket);
    }

    return null;
}

/** Calcula estadísticas para un período específico */
async function calcularEstadisticasPeriodo(
    empresaId: number,
    inicio: Date,
    fin: Date,
    sequelize: any
): Promise<{
    confirmados: number;
    anulados: number;
    montoTotal: number;
    devoluciones: number;
    totalTickets: number;
    montoBruto: number;
    devolucionesBrutas: number;
}> {
    const sql = `
    SELECT
      SUM(CASE WHEN T.ticketStatus = 'Anulado' THEN 1 ELSE 0 END) AS anulados,
      SUM(CASE WHEN T.ticketStatus = 'Confirmed' THEN 1 ELSE 0 END) AS confirmados,
      SUM(CASE WHEN T.ticketStatus = 'Anulado' THEN T.monto_devolucion ELSE 0 END) AS devoluciones_brutas,
      COUNT(T.monto_boleto) AS total,
      SUM(T.monto_boleto) AS monto_bruto
    FROM tickets T
    JOIN pasajeros P ON T.id_pasajero = P.id
    WHERE P.id_empresa = :empresaId
      AND T.confirmedAt BETWEEN :inicio AND :fin
  `;

    const result: any = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: {
            empresaId,
            inicio: formatSQL(inicio),
            fin: formatSQL(fin),
        },
    });

    const data = result[0] || {};

    const empresa = await Empresa.findByPk(empresaId);
    const porcentajeDevolucion = Number(empresa?.porcentaje_devolucion ?? 0);

    const devolucionesBrutas = Number(data.devoluciones_brutas || 0);
    const montoBruto = Number(data.monto_bruto || 0);

    // Retención = lo que NO se devuelve
    // 1.00 → 0
    // 0.80 → 0.20
    const porcentajeRetencion = 1 - porcentajeDevolucion;

    const devolucionesAjustadas =
        porcentajeDevolucion > 0
            ? devolucionesBrutas * porcentajeRetencion
            : devolucionesBrutas;

    return {
        confirmados: Number(data.confirmados || 0),
        anulados: Number(data.anulados || 0),
        montoTotal: montoBruto - devolucionesAjustadas, // monto neto
        devoluciones: devolucionesAjustadas,            // devoluciones ajustadas
        totalTickets:
            Number(data.confirmados || 0) +
            Number(data.anulados || 0),
        montoBruto,
        devolucionesBrutas,
    };
}

/** Genera estados de cuenta desde una fecha hasta hoy */
async function generarEstadosParaEmpresa(
    empresa: any,
    primerTicket: Date,
    hoy: Date,
    sequelize: any
): Promise<void> {
    const empresaId = Number(empresa.id);
    const diaFacturacion = empresa.dia_facturacion;
    const nombre = empresa.nombre || `#${empresaId}`;

    console.log(`\n--- Procesando empresa ${nombre} (ID: ${empresaId}) ---`);
    console.log(`Día facturación: ${diaFacturacion}`);
    console.log(`Primer ticket: ${primerTicket.toISOString()}`);

    if (!diaFacturacion) {
        console.log(`❌ Empresa sin día de facturación definido, se omite`);
        return;
    }

    // Empezar desde el primer ticket
    let fechaActual = new Date(primerTicket);

    // Ajustar fechaActual al inicio del período que contiene el primer ticket
    const periodoPrimerTicket = calcularPeriodo(fechaActual, diaFacturacion);
    fechaActual = new Date(periodoPrimerTicket.inicio);

    // Obtener último saldo de cuenta corriente (0 si no existe)
    const ultimoMovimiento = await CuentaCorriente.findOne({
        where: { empresa_id: empresaId },
        order: [["fecha_movimiento", "DESC"]],
    });

    let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

    // Generar estados hasta hoy
    while (fechaActual < hoy) {
        const periodo = calcularPeriodo(fechaActual, diaFacturacion);

        // No generar período futuro
        if (periodo.inicio >= hoy || periodo.fin >= hoy) {
            break;
        }

        const inicioStr = formatSQL(periodo.inicio);
        const finStr = formatSQL(periodo.fin);

        console.log(`\n📅 Período: ${inicioStr} → ${finStr}`);

        // Verificar si ya existe un estado para este período
        const existe = await EstadoCuenta.findOne({
            where: {
                empresa_id: empresaId,
                fecha_inicio: inicioStr,
                fecha_fin: finStr,
            },
        });

        if (existe) {
            console.log(`   ⏭️  Estado ya existe, se omite`);
            // Avanzar al siguiente período
            fechaActual = new Date(periodo.fin);
            fechaActual.setDate(fechaActual.getDate() + 1);
            continue;
        }

        // Calcular estadísticas del período
        const stats = await calcularEstadisticasPeriodo(
            empresaId,
            periodo.inicio,
            periodo.fin,
            sequelize
        );

        if (stats.totalTickets === 0) {
            console.log(`   ⏭️  Sin tickets en el período, se omite`);
            // Avanzar al siguiente período
            fechaActual = new Date(periodo.fin);
            fechaActual.setDate(fechaActual.getDate() + 1);
            continue;
        }

        console.log(`   📊 Tickets: ${stats.totalTickets} (${stats.confirmados} confirmados, ${stats.anulados} anulados)`);
        console.log(`   💰 Monto: $${stats.montoTotal}, Devoluciones: $${stats.devoluciones}`);

        // Crear estado de cuenta
        const estadoCuenta = await EstadoCuenta.create({
            empresa_id: empresaId,
            periodo: `${periodo.inicio.getMonth() + 1}/${periodo.inicio.getFullYear()}`,
            fecha_inicio: inicioStr,
            fecha_fin: finStr,
            fecha_generacion: new Date(),
            total_tickets: stats.totalTickets,
            total_tickets_anulados: stats.anulados,
            monto_facturado: stats.montoTotal,
            suma_devoluciones: stats.devoluciones,
            detalle_por_cc: JSON.stringify({}),
            pagado: false,
        });

        // Crear movimiento en cuenta corriente
        if (estadoCuenta && estadoCuenta.id) {
            const montoNeto = stats.montoTotal - stats.devoluciones;

            // El cargo neto disminuye el saldo
            saldoActual = saldoActual - montoNeto;

            await CuentaCorriente.create({
                empresa_id: empresaId,
                tipo_movimiento: "cargo",
                monto: montoNeto,
                descripcion: `Cargo por estado de cuenta #${estadoCuenta.id} periodo ${estadoCuenta.periodo} (Neto: $${montoNeto}, Devoluciones: $${stats.devoluciones})`,
                saldo: saldoActual,
                referencia: `CARGO-EDC-${estadoCuenta.id}`,
                pagado: false,
                fecha_movimiento: new Date(periodo.fin), // Fecha del fin del período
            });

            console.log(`   ✅ Estado creado (ID: ${estadoCuenta.id})`);
            console.log(`   ✅ Cargo en CC: $${montoNeto} (Saldo: $${saldoActual})`);
        }

        // Avanzar al siguiente período
        fechaActual = new Date(periodo.fin);
        fechaActual.setDate(fechaActual.getDate() + 1);
    }
}

/** Script principal */
export const recalcularEstadosCuenta = async (): Promise<void> => {
    console.log(`[${new Date().toISOString()}] === INICIO RECÁLCULO COMPLETO ===`);

    try {
        const sequelize = (Ticket as any).sequelize;
        if (!sequelize) throw new Error("Sequelize no inicializado.");

        const hoy = new Date();
        console.log(`Fecha actual: ${hoy.toISOString()}`);

        // 1️⃣ Limpiar datos existentes
        console.log("\n🧹 Limpiando datos existentes...");

        const deletedEstados = await EstadoCuenta.destroy({ where: {} });
        console.log(`✅ Estados de cuenta eliminados: ${deletedEstados}`);

        const deletedCC = await CuentaCorriente.destroy({ where: {} });
        console.log(`✅ Movimientos de cuenta corriente eliminados: ${deletedCC}`);

        // 2️⃣ Obtener todas las empresas activas
        const empresas = await Empresa.findAll({
            where: { estado: true },
        });

        console.log(`\n🏢 Empresas a procesar: ${empresas.length}`);

        // 3️⃣ Procesar cada empresa
        for (const empresa of empresas) {
            try {
                const empresaId = Number(empresa.id ?? empresa.get?.("id"));
                if (!empresaId) {
                    console.error(`❌ Empresa sin ID válido, se omite`);
                    continue;
                }

                // Obtener primer ticket de la empresa
                const primerTicket = await obtenerPrimerTicket(empresaId, sequelize);

                if (!primerTicket) {
                    console.log(`📭 Empresa ${empresa.nombre} sin tickets, se omite`);
                    continue;
                }

                // Generar estados desde el primer ticket hasta hoy
                await generarEstadosParaEmpresa(
                    {
                        id: empresaId,
                        nombre: empresa.nombre,
                        dia_facturacion: empresa.dia_facturacion,
                    },
                    primerTicket,
                    hoy,
                    sequelize
                );

            } catch (error) {
                console.error(`❌ Error procesando empresa ${empresa.id}:`, error);
            }
        }

        console.log(`\n[${new Date().toISOString()}] === RECÁLCULO COMPLETADO ===`);
        console.log(`✅ Todos los estados de cuenta han sido recalculados correctamente`);

    } catch (error) {
        console.error("🔥 ERROR EN RECÁLCULO:", error);
        throw error;
    }
};

// Ejecutar si se llama directamente
if (require.main === module) {
    recalcularEstadosCuenta()
        .then(() => {
            console.log("Script finalizado exitosamente");
            process.exit(0);
        })
        .catch((error) => {
            console.error("Error en script:", error);
            process.exit(1);
        });
}