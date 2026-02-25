import "../database";
import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { Pasajero } from "../models/pasajero.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Op } from "sequelize";

/** Convierte Date a string en formato YYYY-MM-DD HH:mm:ss para campos que esperan string */
function formatDateForDB(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/** Limita día al último del mes si no existe */
function clampDay(year: number, monthZeroBased: number, day: number): number {
    const last = new Date(year, monthZeroBased + 1, 0).getDate();
    return Math.min(day, last);
}

/** Crea una fecha con hora específica */
function createDate(year: number, month: number, day: number, hour: number = 12, minute: number = 0, second: number = 0): Date {
    return new Date(year, month, day, hour, minute, second);
}

/** Calcula el período de facturación para una fecha dada */
function calcularPeriodo(fecha: Date, diaFacturacion: number): { inicio: Date; fin: Date } {
    const mes = fecha.getMonth();
    const anio = fecha.getFullYear();
    const diaFecha = fecha.getDate();

    if (diaFecha < diaFacturacion) {
        // Estamos en el período que empezó el mes anterior
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
            diaFacturacion - 1,
            23, 59, 59
        );

        return { inicio, fin };
    } else {
        // Estamos en el período que empezó este mes
        const inicio = createDate(
            anio,
            mes,
            clampDay(anio, mes, diaFacturacion),
            0, 0, 0
        );

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

/** Determina si un período está completo (ya pasó su fecha de fin) */
function periodoEstaCompleto(periodo: { fin: Date }, hoy: Date): boolean {
    // Un período está completo si su fecha de fin es anterior a hoy
    return periodo.fin < hoy;
}

/** Obtiene el primer ticket de una empresa */
async function obtenerPrimerTicket(empresaId: number): Promise<Date | null> {
    const primerTicket = await Ticket.findOne({
        where: {
            id_empresa: empresaId,
            ticketStatus: { [Op.in]: ['Confirmed', 'Anulado'] }
        },
        order: [['confirmedAt', 'ASC']]
    });

    return primerTicket ? primerTicket.confirmedAt : null;
}

/** Calcula estadísticas para un período específico usando Sequelize */
async function calcularEstadisticasPeriodo(
    empresaId: number,
    inicio: Date,
    fin: Date
): Promise<{
    confirmados: number;
    anulados: number;
    montoTotal: number;
    devoluciones: number;
    totalTickets: number;
    montoBruto: number;
}> {
    const tickets = await Ticket.findAll({
        where: {
            id_empresa: empresaId,
            confirmedAt: {
                [Op.between]: [inicio, fin]
            },
            ticketStatus: { [Op.in]: ['Confirmed', 'Anulado'] }
        },
        include: [{
            model: Pasajero,
            required: true,
            attributes: ['id', 'nombre', 'rut', 'id_empresa']
        }]
    });

    const confirmados = tickets.filter(t => t.ticketStatus === 'Confirmed').length;
    const anulados = tickets.filter(t => t.ticketStatus === 'Anulado').length;

    const montoBruto = tickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
    const devoluciones = tickets.reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
    const montoTotal = montoBruto - devoluciones;

    return {
        confirmados,
        anulados,
        montoTotal,
        devoluciones,
        totalTickets: tickets.length,
        montoBruto
    };
}

/** Genera estados de cuenta desde una fecha hasta hoy */
async function generarEstadosParaEmpresa(
    empresa: any,
    primerTicket: Date,
    hoy: Date
): Promise<void> {
    const empresaId = Number(empresa.id);
    const diaFacturacion = empresa.dia_facturacion;
    const nombre = empresa.nombre || `#${empresaId}`;

    console.log(`\n--- Procesando empresa ${nombre} (ID: ${empresaId}) ---`);
    console.log(`Día facturación: ${diaFacturacion}`);
    console.log(`Primer ticket: ${formatDateForDB(primerTicket)}`);

    if (!diaFacturacion) {
        console.log(`❌ Empresa sin día de facturación definido, se omite`);
        return;
    }

    // Encontrar el primer período que contiene tickets
    let fechaActual = new Date(primerTicket);
    fechaActual.setHours(12, 0, 0, 0);

    // Calcular el primer período
    let periodoActual = calcularPeriodo(fechaActual, diaFacturacion);

    // Obtener último saldo de cuenta corriente
    const ultimoMovimiento = await CuentaCorriente.findOne({
        where: { empresa_id: empresaId },
        order: [["fecha_movimiento", "DESC"]],
    });

    let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;
    console.log(`Saldo inicial: $${saldoActual.toLocaleString('es-CL')}`);

    let periodosGenerados = 0;
    let periodosSaltados = 0;
    const maxIteraciones = 1000;
    let iteraciones = 0;

    while (iteraciones < maxIteraciones) {
        iteraciones++;

        // Verificar si el período está completo (ya pasó su fecha de fin)
        if (!periodoEstaCompleto(periodoActual, hoy)) {
            console.log(`\n📅 Período: ${formatDateForDB(periodoActual.inicio)} → ${formatDateForDB(periodoActual.fin)}`);
            console.log(`   ⏸️  Período no está completo (fecha fin en el futuro), se detiene generación`);
            break;
        }

        const inicioStr = formatDateForDB(periodoActual.inicio);
        const finStr = formatDateForDB(periodoActual.fin);

        console.log(`\n📅 Período: ${inicioStr} → ${finStr}`);

        // Verificar si ya existe
        const existe = await EstadoCuenta.findOne({
            where: {
                empresa_id: empresaId,
                fecha_inicio: inicioStr,
                fecha_fin: finStr,
            },
        });

        if (existe) {
            console.log(`   ⏭️  Estado ya existe (ID: ${existe.id}), se omite`);
            periodosSaltados++;
        } else {
            // Calcular estadísticas
            const stats = await calcularEstadisticasPeriodo(
                empresaId,
                periodoActual.inicio,
                periodoActual.fin
            );

            if (stats.totalTickets === 0) {
                console.log(`   ⏭️  Sin tickets en el período, se omite`);
                periodosSaltados++;
            } else {
                console.log(`   📊 Tickets: ${stats.totalTickets} (${stats.confirmados} confirmados, ${stats.anulados} anulados)`);
                console.log(`   💰 Monto neto: $${stats.montoTotal.toLocaleString('es-CL')}`);

                // Crear estado de cuenta
                const estadoCuenta = await EstadoCuenta.create({
                    empresa_id: empresaId,
                    periodo: `${(periodoActual.inicio.getMonth() + 1).toString().padStart(2, '0')}/${periodoActual.inicio.getFullYear()}`,
                    fecha_inicio: inicioStr,
                    fecha_fin: finStr,
                    fecha_generacion: new Date(),
                    total_tickets: stats.totalTickets,
                    total_tickets_anulados: stats.anulados,
                    monto_facturado: stats.montoTotal,
                    suma_devoluciones: stats.devoluciones,
                    detalle_por_cc: JSON.stringify({
                        periodo_completo: `${inicioStr} al ${finStr}`,
                        tickets_confirmados: stats.confirmados,
                        tickets_anulados: stats.anulados,
                        monto_bruto: stats.montoBruto,
                        fecha_generacion: new Date().toISOString()
                    }),
                    pagado: false,
                });

                console.log(`   ✅ Estado creado (ID: ${estadoCuenta.id})`);

                // Crear movimiento en cuenta corriente
                if (estadoCuenta.id) {
                    saldoActual = saldoActual - stats.montoTotal;

                    await CuentaCorriente.create({
                        empresa_id: empresaId,
                        tipo_movimiento: "cargo",
                        monto: stats.montoTotal,
                        descripcion: `Cargo por estado de cuenta #${estadoCuenta.id} periodo ${estadoCuenta.periodo}`,
                        saldo: saldoActual,
                        referencia: `CARGO-EDC-${estadoCuenta.id}`,
                        pagado: false,
                        fecha_movimiento: periodoActual.fin,
                        estado_cuenta_id: estadoCuenta.id
                    });

                    console.log(`   ✅ Cargo en CC: $${stats.montoTotal.toLocaleString('es-CL')}`);
                    console.log(`   💰 Nuevo saldo: $${saldoActual.toLocaleString('es-CL')}`);

                    periodosGenerados++;
                }
            }
        }

        // Calcular el siguiente período
        const siguienteFecha = new Date(periodoActual.fin);
        siguienteFecha.setDate(siguienteFecha.getDate() + 1);
        siguienteFecha.setHours(12, 0, 0, 0);

        periodoActual = calcularPeriodo(siguienteFecha, diaFacturacion);
    }

    console.log(`\n✅ Empresa ${nombre}:`);
    console.log(`   • Períodos generados: ${periodosGenerados}`);
    console.log(`   • Períodos saltados: ${periodosSaltados}`);
    console.log(`   • Saldo final: $${saldoActual.toLocaleString('es-CL')}`);

    if (!periodoEstaCompleto(periodoActual, hoy)) {
        console.log(`   ⏸️  Último período no generado (aún no termina)`);
    }
}

/** Script principal */
export const recalcularEstadosCuenta = async (): Promise<void> => {
    console.log(`[${new Date().toISOString()}] === INICIO RECÁLCULO COMPLETO ===`);

    try {
        const hoy = new Date();
        hoy.setHours(12, 0, 0, 0);
        console.log(`Fecha actual: ${formatDateForDB(hoy)}`);

        // ⚠️ ADVERTENCIA: Esto eliminará todos los datos
        console.log("\n⚠️  ⚠️  ⚠️  ADVERTENCIA ⚠️  ⚠️  ⚠️");
        console.log("Este script ELIMINARÁ todos los estados de cuenta y cuentas corrientes existentes.");
        console.log("Presiona Ctrl+C para cancelar o espera 5 segundos para continuar...");

        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log("\n🧹 Limpiando datos existentes...");
        const deletedCC = await CuentaCorriente.destroy({ where: {} });
        console.log(`✅ Movimientos de cuenta corriente eliminados: ${deletedCC}`);

        const deletedEstados = await EstadoCuenta.destroy({ where: {} });
        console.log(`✅ Estados de cuenta eliminados: ${deletedEstados}`);

        // Obtener todas las empresas activas
        const empresas = await Empresa.findAll({
            where: { estado: true },
        });

        console.log(`\n🏢 Empresas a procesar: ${empresas.length}`);

        // Procesar cada empresa
        for (const empresa of empresas) {
            try {
                const empresaId = Number(empresa.id ?? empresa.get?.("id"));
                if (!empresaId) {
                    console.error(`❌ Empresa sin ID válido, se omite`);
                    continue;
                }

                const primerTicket = await obtenerPrimerTicket(empresaId);

                if (!primerTicket) {
                    console.log(`📭 Empresa ${empresa.nombre} sin tickets, se omite`);
                    continue;
                }

                await generarEstadosParaEmpresa(
                    {
                        id: empresaId,
                        nombre: empresa.nombre,
                        dia_facturacion: empresa.dia_facturacion,
                    },
                    primerTicket,
                    hoy
                );

            } catch (error) {
                console.error(`❌ Error procesando empresa ${empresa.id}:`, error);
            }
        }

        console.log(`\n[${new Date().toISOString()}] === RECÁLCULO COMPLETADO ===`);

    } catch (error) {
        console.error("🔥 ERROR EN RECÁLCULO:", error);
        throw error;
    }
};

// Ejecutar si se llama directamente
if (require.main === module) {
    recalcularEstadosCuenta()
        .then(() => {
            console.log("✅ Script finalizado exitosamente");
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ Error en script:", error);
            process.exit(1);
        });
}