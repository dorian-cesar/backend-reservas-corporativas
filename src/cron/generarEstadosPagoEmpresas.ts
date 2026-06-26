import { connectDB } from "../database";
import { Empresa } from "../models/empresa.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Pasajero } from "../models/pasajero.model";
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
 * USANDO id_empresa DIRECTO de tickets
 */
export const generarEstadosPagoEmpresas = async () => {
    await connectDB();
    const hoy = new Date();
    const periodoActual = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;

    console.log(`[${new Date().toISOString()}] === INICIO generarEstadosPagoEmpresas ===`);

    // Buscar todas las empresas
    const empresas = await Empresa.findAll({});
    console.log(`[${new Date().toISOString()}] Empresas encontradas: ${empresas.length}`);

    for (const empresa of empresas) {
        const empresaId = empresa.id;
        const empresaNombre = empresa.nombre;
        const diaFacturacion = empresa.dia_facturacion || 1;
        const diaVencimiento = empresa.dia_vencimiento || 1;

        console.log(`[${new Date().toISOString()}] Procesando empresa ID: ${empresaId} (${empresaNombre}), Día facturación: ${diaFacturacion}, Día vencimiento: ${diaVencimiento}`);

        // Buscar el primer y último ticket de la empresa USANDO id_empresa DIRECTO
        const primerTicket = await Ticket.findOne({
            where: { id_empresa: empresaId },
            order: [['created_at', 'ASC']]
        });

        const ultimoTicket = await Ticket.findOne({
            where: { id_empresa: empresaId },
            order: [['created_at', 'DESC']]
        });

        if (primerTicket) {
            console.log(`[${new Date().toISOString()}] Primer ticket: #${primerTicket.ticketNumber} - ${primerTicket.created_at}`);
        } else {
            console.log(`[${new Date().toISOString()}] No hay tickets para empresa ${empresaId}`);
        }

        // Si no hay tickets, igual debe generar estados de cuenta vacíos desde la fecha de creación de la empresa
        let fechaInicio: Date;
        if (primerTicket && primerTicket.created_at) {
            fechaInicio = new Date(primerTicket.created_at);
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

        // Procesar cada periodo histórico para EstadoCuenta y cargo global
        for (const { periodo, inicio, fin, esPeriodoActual } of periodos) {
            console.log(`[${new Date().toISOString()}] === Procesando periodo ${periodo} (inicio: ${inicio.toISOString()}, fin: ${fin.toISOString()}) ===`);

            // Calcular fecha_facturacion y fecha_vencimiento para el periodo
            let fecha_facturacion: Date | null = null;
            let fecha_vencimiento: Date | null = null;

            const anioSiguiente = inicio.getMonth() === 11 ? inicio.getFullYear() + 1 : inicio.getFullYear();
            const mesSiguiente = (inicio.getMonth() + 1) % 12;

            fecha_facturacion = new Date(anioSiguiente, mesSiguiente, diaFacturacion, 0, 0, 0, 0);
            fecha_vencimiento = new Date(anioSiguiente, mesSiguiente, diaVencimiento, 0, 0, 0, 0);

            // Buscar todos los tickets del periodo USANDO id_empresa DIRECTO y confirmedAt
            const tickets = await Ticket.findAll({
                where: {
                    id_empresa: empresaId,
                    ticketStatus: { [Op.in]: ['Confirmed', 'Anulado'] },
                    confirmedAt: {
                        [Op.gte]: inicio,
                        [Op.lt]: fin
                    }
                },
                include: [
                    {
                        model: Pasajero,
                        include: [{
                            model: CentroCosto,
                            attributes: ['id', 'nombre']
                        }],
                        required: false
                    }
                ]
            });

            console.log(`[${new Date().toISOString()}] Tickets en periodo ${periodo}: ${tickets.length}`);

            // Cálculo usando monto_boleto y monto_devolucion directamente de los tickets
            const total_tickets = tickets.length;
            const total_tickets_anulados = tickets.filter(t => t.ticketStatus === 'Anulado').length;
            const monto_bruto = tickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
            const devoluciones = tickets.reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
            
            const monto_neto_consumo = monto_bruto - devoluciones;

            // Calcular descuento por tramos si aplica (para todas las empresas)
            let porcentajeDescuento = 0;
            const tramos = await EmpresaTramo.findAll({
                where: { id_empresa: empresaId },
                order: [['monto_desde', 'ASC']]
            });
            for (const tramo of tramos) {
                const desde = Number(tramo.monto_desde);
                const hasta = tramo.monto_hasta !== null && tramo.monto_hasta !== undefined ? Number(tramo.monto_hasta) : null;
                if (monto_neto_consumo >= desde && (hasta === null || monto_neto_consumo <= hasta)) {
                    porcentajeDescuento = Number(tramo.porcentaje_descuento);
                }
            }

            const descuento = monto_neto_consumo * (porcentajeDescuento / 100);
            const monto_facturado = monto_neto_consumo - descuento;

            console.log(`[${new Date().toISOString()}] Periodo ${periodo}: total_tickets=${total_tickets}, total_tickets_anulados=${total_tickets_anulados}, monto_bruto=${monto_bruto}, devoluciones=${devoluciones}, monto_neto_consumo=${monto_neto_consumo}, porcentaje_descuento=${porcentajeDescuento}%, monto_facturado=${monto_facturado}`);

            // Detalle por centro de costo - USANDO CENTRO DE COSTO DEL PASAJERO
            const detallePorCC: Record<string, {
                nombre: string,
                total_tickets: number,
                total_anulados: number,
                monto_facturado: number
            }> = {};

            // Inicializar con centro de costo "Sin asignar"
            detallePorCC["Sin asignar"] = {
                nombre: "Sin asignar",
                total_tickets: 0,
                total_anulados: 0,
                monto_facturado: 0
            };

            for (const ticket of tickets) {
                const pasajero = ticket.pasajero;
                const centroCostoNombre = pasajero?.centroCosto?.nombre || "Sin asignar";

                if (!detallePorCC[centroCostoNombre]) {
                    detallePorCC[centroCostoNombre] = {
                        nombre: centroCostoNombre,
                        total_tickets: 0,
                        total_anulados: 0,
                        monto_facturado: 0
                    };
                }

                detallePorCC[centroCostoNombre].total_tickets += 1;
                if (ticket.ticketStatus === 'Anulado') {
                    detallePorCC[centroCostoNombre].total_anulados += 1;
                }
                const boleto = Number(ticket.monto_boleto) || 0;
                const devolucion = Number(ticket.monto_devolucion) || 0;
                detallePorCC[centroCostoNombre].monto_facturado += (boleto - devolucion);
            }

            console.log(`[${new Date().toISOString()}] Detalle por centro de costo para periodo ${periodo}: ${JSON.stringify(detallePorCC)}`);

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
                    suma_devoluciones: devoluciones,
                    porcentaje_descuento: porcentajeDescuento,
                    detalle_por_cc: JSON.stringify(detallePorCC),
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
                    suma_devoluciones: devoluciones,
                    porcentaje_descuento: porcentajeDescuento,
                    detalle_por_cc: JSON.stringify(detallePorCC),
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
                        descripcion: porcentajeDescuento > 0 
                            ? `Cargo automático por facturación periodo ${periodo} (Descuento del ${porcentajeDescuento}% aplicado).`
                            : `Cargo automático por facturación periodo ${periodo}.`,
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