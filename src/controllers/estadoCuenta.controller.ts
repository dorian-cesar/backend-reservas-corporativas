import { Request, Response } from "express";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Op } from "sequelize";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Pasajero } from "../models/pasajero.model";
import { Empresa } from "../models/empresa.model";
import { CentroCosto } from "../models/centro_costo.model";


export const ejecutarEDPManual = async (req: Request, res: Response) => {
    try {
        const { empresa_id, fecha_desde, fecha_hasta } = req.body;

        // Validaciones
        if (!empresa_id) {
            return res.status(400).json({
                message: "El ID de la empresa es requerido"
            });
        }

        if (!fecha_desde || !fecha_hasta) {
            return res.status(400).json({
                message: "Las fechas desde y hasta son requeridas"
            });
        }

        // Verificar que la empresa existe
        const empresa = await Empresa.findByPk(empresa_id);
        if (!empresa) {
            return res.status(404).json({
                message: "Empresa no encontrada"
            });
        }

        // *** SOLUCIÓN: Función para parsear fechas correctamente sin problemas de zona horaria ***
        function parseDateSafely(dateStr: string): Date {
            // Si viene en formato YYYY-MM-DD (con guiones)
            if (dateStr.includes('-')) {
                const [year, month, day] = dateStr.split('-').map(Number);
                // Crear fecha usando los componentes numéricos directamente (año, mes, día)
                // Nota: mes es 0-indexed en JavaScript, por eso restamos 1
                return new Date(year, month - 1, day);
            }
            // Si viene en formato YYYY/MM/DD (con slashes)
            else if (dateStr.includes('/')) {
                const [year, month, day] = dateStr.split('/').map(Number);
                return new Date(year, month - 1, day);
            }
            // Si viene en cualquier otro formato, intentar con el constructor por defecto
            else {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) {
                    throw new Error(`Formato de fecha no reconocido: ${dateStr}`);
                }
                return date;
            }
        }

        // Parsear fechas de manera segura
        let fechaDesde: Date, fechaHasta: Date;

        try {
            fechaDesde = parseDateSafely(fecha_desde);
            fechaHasta = parseDateSafely(fecha_hasta);
        } catch (error) {
            return res.status(400).json({
                message: "Error al parsear las fechas",
                error: error instanceof Error ? error.message : "Formato de fecha inválido"
            });
        }

        // Validar que las fechas sean válidas
        if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
            return res.status(400).json({
                message: "Fechas inválidas después del parseo"
            });
        }

        // Validar que fecha_desde sea menor o igual a fecha_hasta
        if (fechaDesde > fechaHasta) {
            return res.status(400).json({
                message: "La fecha desde debe ser menor o igual a la fecha hasta"
            });
        }

        // *** CORRECCIÓN: Ajustar fechas según la lógica de negocio ***

        // Para la consulta de tickets:
        // - inicioConsulta = fecha_desde a las 00:00:00 (exactamente el día que enviaron)
        // - finConsulta = fecha_hasta - 1 día a las 23:59:59 (un día antes)

        const inicioConsulta = new Date(fechaDesde);
        inicioConsulta.setHours(0, 0, 0, 0);

        // Crear fecha_hasta_ajustada = fecha_hasta - 1 día
        const finConsulta = new Date(fechaHasta);
        finConsulta.setDate(finConsulta.getDate() - 1); // Restar un día
        finConsulta.setHours(23, 59, 59, 999);

        // Para guardar en estado_cuenta (usar las mismas fechas ajustadas)
        const inicioPeriodoStr = formatDateForDB(inicioConsulta);
        const finPeriodoStr = formatDateForDB(finConsulta);

        console.log(`=== INICIO FACTURACIÓN MANUAL ===`);
        console.log(`Empresa: ${empresa.nombre} (ID: ${empresa_id})`);
        console.log(`Fechas recibidas: ${fecha_desde} → ${fecha_hasta}`);
        console.log(`Fechas parseadas: ${fechaDesde.toISOString()} → ${fechaHasta.toISOString()}`);
        console.log(`Período facturado: ${inicioPeriodoStr} → ${finPeriodoStr}`);

        // Verificar si ya existe un estado de cuenta para este período
        const existe = await EstadoCuenta.findOne({
            where: {
                empresa_id: empresa_id,
                fecha_inicio: inicioPeriodoStr,
                fecha_fin: finPeriodoStr
            }
        });

        if (existe) {
            return res.status(400).json({
                message: "Ya existe un estado de cuenta para este período",
                estado_cuenta_existente: existe
            });
        }

        // Obtener tickets del período (usando las fechas ajustadas)
        const tickets = await Ticket.findAll({
            where: {
                id_empresa: empresa_id,
                confirmedAt: {
                    [Op.between]: [inicioConsulta, finConsulta]
                }
            },
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'rut', 'email'],
                    required: false
                },
                {
                    model: Pasajero,
                    required: false,
                    attributes: ['id', 'nombre', 'rut', 'correo', 'telefono', 'id_centro_costo'],
                    include: [{ model: CentroCosto, required: false }]
                }
            ]
        });

        // Calcular totales
        const total_confirmados = tickets.filter(t => t.ticketStatus === 'Confirmed').length;
        const total_anulados = tickets.filter(t => t.ticketStatus === 'Anulado').length;

        // Sumar montos
        const monto_bruto = tickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
        const devoluciones = tickets.reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
        const monto_facturado = monto_bruto - devoluciones;

        // Generar detalle por centro de costo
        const detallePorCC: any = {};

        // Crear estado de cuenta
        const estadoCuenta = await EstadoCuenta.create({
            empresa_id: empresa_id,
            periodo: `${fechaDesde.getFullYear()}-${String(fechaDesde.getMonth() + 1).padStart(2, '0')}`,
            fecha_inicio: inicioPeriodoStr,
            fecha_fin: finPeriodoStr,
            fecha_generacion: new Date(),
            fecha_facturacion: new Date(),
            total_tickets: tickets.length,
            total_tickets_anulados: total_anulados,
            monto_facturado: monto_facturado,
            suma_devoluciones: devoluciones,
            detalle_por_cc: JSON.stringify(detallePorCC),
            pagado: false,
        });

        // Crear cargo en cuenta corriente
        if (estadoCuenta && estadoCuenta.id) {
            const ultimoMovimiento = await CuentaCorriente.findOne({
                where: { empresa_id: empresa_id },
                order: [["fecha_movimiento", "DESC"], ["id", "DESC"]],
            });

            let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;
            const nuevoSaldo = saldoActual - monto_facturado;

            const cargo = await CuentaCorriente.create({
                empresa_id: empresa_id,
                tipo_movimiento: "cargo",
                monto: monto_facturado,
                descripcion: `Cargo por estado de cuenta #${estadoCuenta.id} - Período ${inicioPeriodoStr} al ${finPeriodoStr}`,
                saldo: nuevoSaldo,
                referencia: `CARGO-EDC-${estadoCuenta.id}`,
                pagado: false,
                fecha_movimiento: new Date(),
                estado_cuenta_id: estadoCuenta.id
            });

            return res.status(201).json({
                message: "Facturación EDP manual ejecutada correctamente",
                data: {
                    estado_cuenta: estadoCuenta,
                    cargo_cuenta_corriente: cargo,
                    resumen: {
                        total_tickets: tickets.length,
                        tickets_confirmados: total_confirmados,
                        tickets_anulados: total_anulados,
                        monto_bruto,
                        devoluciones,
                        monto_facturado,
                        detalle_por_cc: detallePorCC,
                        fechas_utilizadas: {
                            fecha_desde_enviada: fecha_desde,
                            fecha_hasta_enviada: fecha_hasta,
                            fecha_desde_parseada: formatDateForDB(fechaDesde),
                            fecha_hasta_parseada: formatDateForDB(fechaHasta),
                            fecha_inicio_real: inicioPeriodoStr,
                            fecha_fin_real: finPeriodoStr
                        }
                    }
                }
            });
        } else {
            throw new Error("Error al crear el estado de cuenta");
        }

    } catch (error) {
        console.error("Error en facturación manual:", error);
        return res.status(500).json({
            message: "Error al ejecutar facturación manual",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};

function formatDateForDB(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}


export const listarEstadosCuenta = async (req: Request, res: Response) => {
    try {
        const { empresaId, empresa_id, periodo, pagado, desde, hasta } = req.query;

        // Soporta ambos nombres: empresaId (del frontend) y empresa_id (directo)
        const empresaIdFinal = empresaId || empresa_id;

        const where: any = {};

        if (empresaIdFinal) where.empresa_id = empresaIdFinal;
        if (periodo) where.periodo = periodo;
        if (pagado !== undefined) where.pagado = pagado === "true";

        if (desde || hasta) {
            const fechaFiltro: any = {};

            if (desde) {
                fechaFiltro[Op.gte] = new Date(desde as string);
            }

            if (hasta) {
                const hastaDate = new Date(hasta as string);
                hastaDate.setDate(hastaDate.getDate() + 1);
                fechaFiltro[Op.lt] = hastaDate;
            }

            where.fecha_generacion = fechaFiltro;
        }

        const estados = await EstadoCuenta.findAll({
            where,
            include: [
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut', 'cuenta_corriente', 'estado']
                }
            ],
            order: [["fecha_generacion", "DESC"]],
        });

        return res.json(estados);
    } catch (error) {
        console.error("Error al listar estados de cuenta:", error);
        return res.status(500).json({
            message: "Error al obtener estados de cuenta",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};

export const listarTicketsDeEstadoCuenta = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const page = req.query.page ? parseInt(req.query.page as string, 10) : null;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : null;
        const offset = page && limit ? (page - 1) * limit : undefined;

        const estado = await EstadoCuenta.findByPk(id);
        if (!estado) return res.status(404).json({ message: "Estado de cuenta no encontrado" });

        const estadoData = estado.toJSON();

        if (!estadoData.fecha_inicio || !estadoData.fecha_fin) {
            return res.status(400).json({
                message: "El estado de cuenta no tiene fechas de período definidas",
                detalles: {
                    fecha_inicio: estadoData.fecha_inicio,
                    fecha_fin: estadoData.fecha_fin
                }
            });
        }

        const empresaId = estadoData.empresa_id;

        let inicio: Date;
        let fin: Date;

        try {
            inicio = new Date(estadoData.fecha_inicio);
            fin = new Date(estadoData.fecha_fin);

            if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
                return res.status(400).json({
                    message: "Fechas inválidas en el estado de cuenta",
                    detalles: {
                        fecha_inicio: estadoData.fecha_inicio,
                        fecha_fin: estadoData.fecha_fin
                    }
                });
            }

            fin.setHours(23, 59, 59, 999);

        } catch (error) {
            return res.status(400).json({
                message: "Error al procesar las fechas del estado de cuenta",
                error: error instanceof Error ? error.message : "Error desconocido"
            });
        }

        const whereCondition: any = {
            confirmedAt: {
                [Op.between]: [inicio, fin]
            }
        };

        if (empresaId) {
            const empresa = await Empresa.findByPk(empresaId);
            if (empresa) {
                whereCondition.id_empresa = empresaId;
            } else {
                return res.status(404).json({
                    message: "Empresa no encontrada",
                    empresaId
                });
            }
        } else {
            whereCondition.id_empresa = null;
        }

        const queryOptions: any = {
            where: whereCondition,
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'rut', 'email'],
                    required: false
                },
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut', 'cuenta_corriente'],
                    required: empresaId ? true : false
                },
                {
                    model: Pasajero,
                    required: false,
                    attributes: ['id', 'nombre', 'rut', 'correo', 'telefono', 'id_centro_costo'],
                    include: [{ model: CentroCosto, required: false }]
                }
            ],
            order: [["confirmedAt", "DESC"]],
        };

        if (page && limit) {
            queryOptions.limit = limit;
            queryOptions.offset = offset;
        }

        const tickets = await Ticket.findAll(queryOptions);

        if (page && limit) {
            const total = await Ticket.count({ where: whereCondition });

            return res.json({
                data: tickets,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            });
        }

        return res.json(tickets);

    } catch (error) {
        console.error("❌ Error al obtener tickets:", error);
        return res.status(500).json({
            message: "Error al obtener tickets del estado de cuenta",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};

/**
 * Obtener un estado de cuenta por ID
 */
export const obtenerEstadoCuenta = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const estado = await EstadoCuenta.findByPk(id);
        if (!estado) return res.status(404).json({ message: "Estado de cuenta no encontrado" });

        return res.json(estado);
    } catch (error) {
        console.error("Error al obtener estado de cuenta:", error);
        return res.status(500).json({
            message: "Error al obtener estado de cuenta",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};

export const aplicarDescuentoEstadoCuenta = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { porcentaje_descuento, descripcion_descuento } = req.body;

        // Validaciones
        if (!porcentaje_descuento || isNaN(Number(porcentaje_descuento))) {
            return res.status(400).json({
                message: "Porcentaje de descuento inválido o faltante"
            });
        }

        const porcentaje = Number(porcentaje_descuento);
        if (porcentaje < 0 || porcentaje > 100) {
            return res.status(400).json({
                message: "El porcentaje de descuento debe estar entre 0 y 100"
            });
        }

        // Buscar el estado de cuenta
        const estadoCuenta = await EstadoCuenta.findByPk(id);
        if (!estadoCuenta) {
            return res.status(404).json({ message: "Estado de cuenta no encontrado" });
        }

        // Verificar que no esté pagado
        if (estadoCuenta.pagado) {
            return res.status(400).json({
                message: "No se puede aplicar descuento a un estado de cuenta ya pagado"
            });
        }

        // Verificar que no tenga ya un descuento aplicado
        if (estadoCuenta.porcentaje_descuento && estadoCuenta.porcentaje_descuento > 0) {
            return res.status(400).json({
                message: "Este estado de cuenta ya tiene un descuento aplicado",
                porcentaje_actual: estadoCuenta.porcentaje_descuento
            });
        }

        // Calcular montos
        const montoNeto = Number(estadoCuenta.monto_facturado);
        const montoDescuento = montoNeto * (porcentaje / 100);

        // 1. Obtener último saldo para calcular nuevo
        const ultimoMovimiento = await CuentaCorriente.findOne({
            where: { empresa_id: estadoCuenta.empresa_id },
            order: [["fecha_movimiento", "DESC"], ["id", "DESC"]],
        });

        let nuevoSaldo = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

        // 2. El descuento es un ABONO (suma al saldo)
        nuevoSaldo = nuevoSaldo + montoDescuento;

        // 3. Crear movimiento de ABONO por el descuento
        const abonoDescuento = await CuentaCorriente.create({
            empresa_id: estadoCuenta.empresa_id,
            tipo_movimiento: "abono",
            monto: montoDescuento,
            descripcion: descripcion_descuento || `Descuento del ${porcentaje}% aplicado al estado de cuenta ${estadoCuenta.periodo}`,
            saldo: nuevoSaldo,
            referencia: `DESCUENTO-EDC-${estadoCuenta.id}`,
            fecha_movimiento: new Date(),
            estado_cuenta_id: estadoCuenta.id // Vinculamos el abono con el estado de cuenta
        });

        // 4. Actualizar estado de cuenta con el porcentaje de descuento
        await estadoCuenta.update({
            porcentaje_descuento: porcentaje
        });

        return res.json({
            message: "Descuento aplicado correctamente",
            descuento_aplicado: {
                porcentaje,
                monto_descuento: montoDescuento,
                monto_original: montoNeto,
                nuevo_saldo_empresa: nuevoSaldo
            },
            movimiento_descuento: abonoDescuento,
            estado_cuenta: estadoCuenta
        });

    } catch (error) {
        console.error("Error al aplicar descuento:", error);
        return res.status(500).json({
            message: "Error al aplicar descuento",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};

/**
 * Revertir descuento de un estado de cuenta
 * Crea un CARGO para compensar el abono del descuento
 */
export const revertirDescuentoEstadoCuenta = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { descripcion } = req.body;

        const estadoCuenta = await EstadoCuenta.findByPk(id);
        if (!estadoCuenta) {
            return res.status(404).json({ message: "Estado de cuenta no encontrado" });
        }

        // Verificar que tenga un descuento aplicado
        if (!estadoCuenta.porcentaje_descuento) {
            return res.status(400).json({
                message: "Este estado de cuenta no tiene descuento aplicado"
            });
        }

        // Verificar que no esté pagado
        if (estadoCuenta.pagado) {
            return res.status(400).json({
                message: "No se puede revertir descuento a un estado de cuenta ya pagado"
            });
        }

        // Buscar el movimiento de descuento
        const movimientoDescuento = await CuentaCorriente.findOne({
            where: {
                empresa_id: estadoCuenta.empresa_id,
                tipo_movimiento: 'abono',
                referencia: `DESCUENTO-EDC-${estadoCuenta.id}`
            }
        });

        if (!movimientoDescuento) {
            return res.status(404).json({
                message: "No se encontró el movimiento de descuento asociado"
            });
        }

        // Calcular montos
        const montoOriginal = Number(estadoCuenta.monto_facturado);
        const porcentaje = estadoCuenta.porcentaje_descuento;
        const montoDescuento = montoOriginal * (porcentaje / 100);

        // 1. Obtener último saldo
        const ultimoMovimiento = await CuentaCorriente.findOne({
            where: { empresa_id: estadoCuenta.empresa_id },
            order: [["fecha_movimiento", "DESC"], ["id", "DESC"]],
        });

        let nuevoSaldo = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

        // 2. Crear CARGO para compensar el descuento (resta del saldo)
        nuevoSaldo = nuevoSaldo - montoDescuento;

        const cargoCompensatorio = await CuentaCorriente.create({
            empresa_id: estadoCuenta.empresa_id,
            tipo_movimiento: "cargo",
            monto: montoDescuento,
            descripcion: descripcion || `Reversión de descuento del ${porcentaje}% al estado de cuenta ${estadoCuenta.periodo}`,
            saldo: nuevoSaldo,
            referencia: `REV-DESCUENTO-EDC-${estadoCuenta.id}`,
            fecha_movimiento: new Date(),
            estado_cuenta_id: estadoCuenta.id
        });

        // 3. Eliminar el movimiento de descuento original
        await movimientoDescuento.destroy();

        // 4. Actualizar estado de cuenta (quitar porcentaje)
        await estadoCuenta.update({
            porcentaje_descuento: 0
        });

        // 5. Recalcular saldos posteriores al movimiento eliminado
        await recalcularSaldosDesde(estadoCuenta.empresa_id, cargoCompensatorio.fecha_movimiento);

        return res.json({
            message: "Descuento revertido correctamente",
            movimiento_compensatorio: cargoCompensatorio,
            estado_cuenta: estadoCuenta
        });

    } catch (error) {
        console.error("Error al revertir descuento:", error);
        return res.status(500).json({
            message: "Error al revertir descuento",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};

/**
 * Función helper para recalcular saldos desde una fecha
 */
const recalcularSaldosDesde = async (empresaId: number, fechaDesde: Date): Promise<void> => {
    // Obtener todos los movimientos desde la fecha indicada
    const movimientos = await CuentaCorriente.findAll({
        where: {
            empresa_id: empresaId,
            fecha_movimiento: { [Op.gte]: fechaDesde }
        },
        order: [["fecha_movimiento", "ASC"], ["id", "ASC"]]
    });

    if (movimientos.length === 0) return;

    // Obtener saldo anterior al primer movimiento
    const saldoAnterior = await CuentaCorriente.findOne({
        where: {
            empresa_id: empresaId,
            fecha_movimiento: { [Op.lt]: fechaDesde }
        },
        order: [["fecha_movimiento", "DESC"]]
    });

    let saldoAcumulado = saldoAnterior ? Number(saldoAnterior.saldo) : 0;

    // Recalcular cada movimiento
    for (const movimiento of movimientos) {
        if (movimiento.tipo_movimiento === "abono") {
            saldoAcumulado += Number(movimiento.monto);
        } else if (movimiento.tipo_movimiento === "cargo") {
            saldoAcumulado -= Number(movimiento.monto);
        }

        // Actualizar si el saldo cambió
        if (Math.abs(Number(movimiento.saldo) - saldoAcumulado) > 0.01) {
            await movimiento.update({ saldo: saldoAcumulado });
        }
    }
};

/**
 * Obtener información del descuento aplicado a un estado de cuenta
 */
export const obtenerDescuentoEstadoCuenta = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const estadoCuenta = await EstadoCuenta.findByPk(id);
        if (!estadoCuenta) {
            return res.status(404).json({ message: "Estado de cuenta no encontrado" });
        }

        // Buscar movimiento de descuento si existe
        const movimientoDescuento = await CuentaCorriente.findOne({
            where: {
                empresa_id: estadoCuenta.empresa_id,
                tipo_movimiento: 'abono',
                referencia: `DESCUENTO-EDC-${estadoCuenta.id}`
            }
        });

        const montoOriginal = Number(estadoCuenta.monto_facturado);
        const porcentaje = estadoCuenta.porcentaje_descuento || 0;
        const montoDescuento = montoOriginal * (porcentaje / 100);
        const montoFinal = montoOriginal - montoDescuento;

        return res.json({
            estado_cuenta: estadoCuenta,
            descuento: movimientoDescuento ? {
                existe: true,
                porcentaje,
                monto_descuento: montoDescuento,
                monto_original: montoOriginal,
                monto_final: montoFinal,
                movimiento: movimientoDescuento
            } : {
                existe: false,
                porcentaje: 0,
                monto_descuento: 0,
                monto_original: montoOriginal,
                monto_final: montoOriginal
            }
        });

    } catch (error) {
        console.error("Error al obtener descuento:", error);
        return res.status(500).json({
            message: "Error al obtener información de descuento",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};