import { Request, Response } from "express";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Op } from "sequelize";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";


/**
 * Marca un estado de cuenta como pagado y genera un abono en la cuenta corriente.
 */
export const pagarEstadoCuenta = async (req: Request, res: Response) => {
    try {
        const { estadoCuentaId, monto } = req.body;

        const estadoCuenta = await EstadoCuenta.findByPk(estadoCuentaId);
        if (!estadoCuenta) {
            return res.status(404).json({ message: "Estado de cuenta no encontrado" });
        }

        const estadoData = estadoCuenta.toJSON();

        if (estadoData.pagado) {
            return res.status(400).json({ message: "El estado de cuenta ya está pagado" });
        }

        // Registrar abono en cuenta corriente
        await CuentaCorriente.create({
            empresa_id: estadoData.empresa_id,
            tipo_movimiento: "abono",
            monto: monto,
            descripcion: `Abono por pago de estado de cuenta #${estadoData.id} periodo ${estadoData.periodo}`,
            saldo: 0,
            referencia: `ABONO-EDC-${estadoData.id}`
        });

        // Marcar como pagado
        estadoCuenta.pagado = true;
        estadoCuenta.fecha_pago = new Date();
        await estadoCuenta.save();

        return res.json({
            message: "Estado de cuenta pagado correctamente",
            estadoCuenta: estadoCuenta.toJSON()
        });
    } catch (error) {
        console.error("Error al pagar estado de cuenta:", error);
        return res.status(500).json({
            message: "Error al procesar el pago",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};

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

        const estado = await EstadoCuenta.findByPk(id);
        if (!estado) return res.status(404).json({ message: "Estado de cuenta no encontrado" });

        const estadoData = estado.toJSON();

        if (!estadoData.periodo || estadoData.periodo.trim() === '') {
            return res.status(400).json({
                message: "El estado de cuenta no tiene período asignado"
            });
        }

        const empresaId = estadoData.empresa_id;
        const periodo = estadoData.periodo.trim();


        // Usar fecha_inicio y fecha_fin si están disponibles
        let inicio: Date;
        let fin: Date;

        if (estadoData.fecha_inicio && estadoData.fecha_fin) {
            inicio = new Date(estadoData.fecha_inicio);
            fin = new Date(estadoData.fecha_fin);

        } else {
            // Si no hay fechas específicas, intentar interpretar el período
            // Formato esperado: "01", "02", ..., "12" o "1", "2", ..., "12"
            const mesStr = periodo.replace(/[^0-9]/g, ''); // Extraer solo números
            const mesNum = parseInt(mesStr, 10);

            if (isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
                return res.status(400).json({
                    message: "Período inválido. Debe ser un número de mes (1-12)",
                    periodoRecibido: periodo
                });
            }

            // Usar el año actual para el mes especificado
            const ahora = new Date();
            const year = ahora.getFullYear();

            // Si el mes es mayor al actual, usar año anterior
            let yearCalculado = year;
            if (mesNum > ahora.getMonth() + 1) {
                yearCalculado = year - 1;
            }

            inicio = new Date(yearCalculado, mesNum - 1, 1);
            fin = new Date(yearCalculado, mesNum, 0); // último día del mes

            console.log('📅 Calculando fechas desde período numérico:', {
                periodo,
                mesNum,
                yearCalculado,
                inicio: inicio.toISOString(),
                fin: fin.toISOString()
            });
        }

        // Buscar tickets
        const tickets = await Ticket.findAll({
            include: [
                {
                    model: User,
                    where: { empresa_id: empresaId },
                    attributes: ['id', 'nombre', 'email', 'empresa_id', 'centro_costo_id']
                }
            ],
            where: {
                travelDate: {
                    [Op.between]: [inicio, fin]
                }
            },
            order: [["travelDate", "DESC"]],
        });

        console.log(`✅ Encontrados ${tickets.length} tickets para el período`);

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
