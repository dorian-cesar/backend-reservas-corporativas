// src/cron/generarEstadosPagoEmpresas.ts

import { Empresa } from "../models/empresa.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Op } from "sequelize";

/**
 * Genera o actualiza automáticamente los estados de pago para las empresas para todos los periodos históricos,
 * desde el primer ticket registrado hasta el mes actual, usando los días de facturación y vencimiento definidos en la base de datos.
 * El estado de cuenta del periodo actual se genera hasta la fecha de hoy.
 * Si detecta más de un periodo a cerrar según el día de facturación, crea o actualiza todos los estados de cuenta necesarios.
 * Genera estados de cuenta vacíos si no hay tickets en el periodo.
 *
 * Se añaden logs detallados para depuración.
 *
 * Ahora incluye fecha_facturacion y fecha_vencimiento calculadas en base a los días configurados en la empresa.
 */
export const generarEstadosPagoEmpresas = async () => {
    const hoy = new Date();
    const periodoActual = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;

    console.log(`[${new Date().toISOString()}] === INICIO generarEstadosPagoEmpresas ===`);

    // Buscar todas las empresas
    const empresas = await Empresa.findAll({});
    console.log(`[${new Date().toISOString()}] Empresas encontradas: ${empresas.length}`);

    for (const empresa of empresas) {
        const empresaId = empresa.get('id');
        const diaFacturacion = empresa.get('dia_facturacion') || 1;
        const diaVencimiento = empresa.get('dia_vencimiento') || 1;
        console.log(`[${new Date().toISOString()}] Procesando empresa ID: ${empresaId}, Día facturación: ${diaFacturacion}, Día vencimiento: ${diaVencimiento}`);

        // Buscar usuarios de la empresa
        const users = await User.findAll({
            where: { empresa_id: empresaId }
        });
        const userIds = users.map(u => u.id);
        console.log(`[${new Date().toISOString()}] Usuarios encontrados para empresa ${empresaId}: ${userIds.length}`);

        // Buscar el primer y último ticket de la empresa
        const primerTicket = await Ticket.findOne({
            where: { id_User: { [Op.in]: userIds } },
            order: [['created_at', 'ASC']]
        });
        const ultimoTicket = await Ticket.findOne({
            where: { id_User: { [Op.in]: userIds } },
            order: [['created_at', 'DESC']]
        });

        if (primerTicket) {
            console.log(`[${new Date().toISOString()}] Primer ticket: #${primerTicket.get('ticketNumber')} - ${primerTicket.get('created_at')}`);
        } else {
            console.log(`[${new Date().toISOString()}] No hay tickets para empresa ${empresaId}`);
        }

        // Si no hay tickets, igual debe generar estados de cuenta vacíos desde la fecha de creación de la empresa
        let fechaInicio: Date;
        if (primerTicket && primerTicket.get('created_at')) {
            fechaInicio = new Date(String(primerTicket.get('created_at')));
        } else if (empresa.get('created_at')) {
            fechaInicio = new Date(String(empresa.get('created_at')));
        } else {
            fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0);
        }

        // Ajustar fechaInicio al primer día de facturación posterior o igual
        if (fechaInicio.getDate() > diaFacturacion) {
            fechaInicio.setMonth(fechaInicio.getMonth() + 1);
        }
        fechaInicio.setDate(diaFacturacion);
        fechaInicio.setHours(0, 0, 0, 0);

        const fechaFin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

        // Generar periodos mensuales desde fechaInicio hasta fechaFin
        const periodos: { periodo: string, inicio: Date, fin: Date, esPeriodoActual: boolean }[] = [];
        let fechaIter = new Date(fechaInicio);

        let periodosGenerados = 0;
        while (fechaIter <= fechaFin) {
            const inicioPeriodo = new Date(fechaIter);
            const siguientePeriodo = new Date(inicioPeriodo);
            siguientePeriodo.setMonth(siguientePeriodo.getMonth() + 1);
            const finPeriodo = new Date(siguientePeriodo);
            finPeriodo.setHours(0, 0, 0, 0);

            const periodo = `${inicioPeriodo.getFullYear()}-${(inicioPeriodo.getMonth() + 1).toString().padStart(2, '0')}`;
            const esPeriodoActual = hoy >= inicioPeriodo && hoy < finPeriodo;

            periodos.push({
                periodo,
                inicio: inicioPeriodo,
                fin: esPeriodoActual ? fechaFin : finPeriodo,
                esPeriodoActual
            });

            fechaIter = new Date(siguientePeriodo);
            periodosGenerados++;
        }
        if (periodosGenerados === 0) {
            const inicioPeriodo = new Date(hoy.getFullYear(), hoy.getMonth(), diaFacturacion, 0, 0, 0);
            const siguientePeriodo = new Date(inicioPeriodo);
            siguientePeriodo.setMonth(siguientePeriodo.getMonth() + 1);
            const finPeriodo = new Date(siguientePeriodo);
            finPeriodo.setHours(0, 0, 0, 0);

            const periodo = `${inicioPeriodo.getFullYear()}-${(inicioPeriodo.getMonth() + 1).toString().padStart(2, '0')}`;
            const esPeriodoActual = hoy >= inicioPeriodo && hoy < finPeriodo;

            periodos.push({
                periodo,
                inicio: inicioPeriodo,
                fin: esPeriodoActual ? fechaFin : finPeriodo,
                esPeriodoActual
            });
        }

        console.log(`[${new Date().toISOString()}] Periodos generados para empresa ${empresaId}: ${periodos.map(p => p.periodo).join(', ')}`);

        // Eliminar lógica que pasa los tickets a la cuenta corriente

        // Procesar cada periodo histórico para EstadoCuenta y cargo global
        for (const { periodo, inicio, fin, esPeriodoActual } of periodos) {
            console.log(`[${new Date().toISOString()}] === Procesando periodo ${periodo} (inicio: ${inicio.toISOString()}, fin: ${fin.toISOString()}) ===`);

            // Calcular fecha_facturacion y fecha_vencimiento para el periodo
            // fecha_facturacion: día_facturacion del mes siguiente al inicio del periodo
            // fecha_vencimiento: día_vencimiento del mes siguiente al inicio del periodo
            let fecha_facturacion: Date | null = null;
            let fecha_vencimiento: Date | null = null;

            // La fecha de facturación y vencimiento se calculan para el mes siguiente al inicio del periodo
            // Ejemplo: periodo 2024-06, inicio 2024-06-01, fecha_facturacion = 2024-07-diaFacturacion
            const anioSiguiente = inicio.getMonth() === 11 ? inicio.getFullYear() + 1 : inicio.getFullYear();
            const mesSiguiente = (inicio.getMonth() + 1) % 12;

            fecha_facturacion = new Date(anioSiguiente, mesSiguiente, diaFacturacion, 0, 0, 0, 0);
            fecha_vencimiento = new Date(anioSiguiente, mesSiguiente, diaVencimiento, 0, 0, 0, 0);

            // Buscar todos los tickets del periodo
            const tickets = await Ticket.findAll({
                where: {
                    id_User: { [Op.in]: userIds },
                    ticketStatus: { [Op.in]: ['Confirmed', 'Anulado'] },
                    created_at: {
                        [Op.gte]: inicio,
                        [Op.lt]: fin
                    }
                }
            });
            console.log(`[${new Date().toISOString()}] Tickets en periodo ${periodo}: ${tickets.length}`);

            // Cálculo usando monto_boleto y monto_devolucion directamente de los tickets
            let total_tickets = 0;
            let total_tickets_anulados = 0;
            let monto_cargos = 0;
            let monto_abonos = 0;

            for (const ticket of tickets) {
                const ticketStatus = ticket.get('ticketStatus');
                if (ticketStatus === 'Confirmed') {
                    total_tickets += 1;
                    monto_cargos += Number(ticket.get('monto_boleto')) || 0;
                }
                if (ticketStatus === 'Anulado') {
                    total_tickets_anulados += 1;
                    monto_abonos += Number(ticket.get('monto_devolucion')) || 0;
                }
            }

            const monto_facturado = monto_cargos - monto_abonos;

            console.log(`[${new Date().toISOString()}] Periodo ${periodo}: total_tickets=${total_tickets}, total_tickets_anulados=${total_tickets_anulados}, monto_cargos=${monto_cargos}, monto_abonos=${monto_abonos}, monto_facturado=${monto_facturado}`);

            // Detalle por centro de costo
            const ccMap: Record<number, { nombre: string, total_tickets: number, total_anulados: number, monto_facturado: number }> = {};
            for (const user of users) {
                if (!user.centro_costo_id) continue;
                if (!ccMap[user.centro_costo_id]) {
                    const cc = await CentroCosto.findByPk(user.centro_costo_id);
                    ccMap[user.centro_costo_id] = {
                        nombre: cc ? cc.nombre : 'Sin nombre',
                        total_tickets: 0,
                        total_anulados: 0,
                        monto_facturado: 0
                    };
                }
            }
            for (const ticket of tickets) {
                const user = users.find(u => u.id === ticket.id_User);
                if (!user || !user.centro_costo_id) continue;
                const cc = ccMap[user.centro_costo_id];
                const ticketStatus = ticket.get('ticketStatus');
                if (ticketStatus === 'Confirmed') {
                    cc.total_tickets += 1;
                    cc.monto_facturado += Number(ticket.get('monto_boleto')) || 0;
                }
                if (ticketStatus === 'Anulado') {
                    cc.total_anulados += 1;
                    cc.monto_facturado -= Number(ticket.get('monto_devolucion')) || 0;
                }
            }

            console.log(`[${new Date().toISOString()}] Detalle por centro de costo para periodo ${periodo}: ${JSON.stringify(ccMap)}`);

            // Buscar si ya existe EstadoCuenta para este periodo y empresa
            let estadoCuenta = await EstadoCuenta.findOne({
                where: {
                    empresa_id: empresaId,
                    periodo
                }
            });

            if (estadoCuenta) {
                // Actualizar EstadoCuenta existente
                await estadoCuenta.update({
                    fecha_generacion: esPeriodoActual ? hoy : fin,
                    total_tickets,
                    total_tickets_anulados,
                    monto_facturado,
                    detalle_por_cc: JSON.stringify(ccMap),
                    fecha_facturacion,
                    fecha_vencimiento
                });
                console.log(`[${new Date().toISOString()}] EstadoCuenta actualizado para empresa ${empresaId}, periodo ${periodo}`);
            } else {
                // Crear EstadoCuenta nuevo, aunque no haya tickets
                await EstadoCuenta.create({
                    empresa_id: empresaId,
                    periodo,
                    fecha_generacion: esPeriodoActual ? hoy : fin,
                    total_tickets,
                    total_tickets_anulados,
                    monto_facturado,
                    detalle_por_cc: JSON.stringify(ccMap),
                    pagado: false,
                    fecha_facturacion,
                    fecha_vencimiento
                });
                console.log(`[${new Date().toISOString()}] EstadoCuenta creado para empresa ${empresaId}, periodo ${periodo}`);
            }

            // Cargo global en CuentaCorriente solo si hay monto facturado neto positivo y no existe ya el cargo global para este periodo
            if (monto_facturado > 0) {
                const referenciaGlobal = `FACT-${empresaId}-${periodo}`;
                const existeCargoGlobal = await CuentaCorriente.findOne({
                    where: {
                        empresa_id: empresaId,
                        referencia: referenciaGlobal
                    }
                });
                if (!existeCargoGlobal) {
                    await CuentaCorriente.create({
                        empresa_id: empresaId,
                        tipo_movimiento: "cargo",
                        monto: monto_facturado,
                        descripcion: `Cargo automático por facturación periodo ${periodo}.`,
                        saldo: 0,
                        referencia: referenciaGlobal
                    });
                    console.log(`[${new Date().toISOString()}] Cargo global creado en cuenta corriente para empresa ${empresaId}, periodo ${periodo}, monto: ${monto_facturado}`);
                } else {
                    console.log(`[${new Date().toISOString()}] Cargo global YA EXISTE en cuenta corriente para empresa ${empresaId}, periodo ${periodo}`);
                }
            } else {
                console.log(`[${new Date().toISOString()}] No se crea cargo global para empresa ${empresaId}, periodo ${periodo} (monto_facturado <= 0)`);
            }
        }
    }

    console.log(`[${new Date().toISOString()}] === FIN generarEstadosPagoEmpresas ===`);
};
