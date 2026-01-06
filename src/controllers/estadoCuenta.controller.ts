import { Request, Response } from "express";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Op } from "sequelize";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Pasajero } from "../models/pasajero.model";
import { Empresa } from "../models/empresa.model";


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

        // 1. VERIFICAR QUE TENGA FECHAS VÁLIDAS
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

        // 2. CONVERTIR FECHAS STRING A DATE
        let inicio: Date;
        let fin: Date;

        try {
            inicio = new Date(estadoData.fecha_inicio);
            fin = new Date(estadoData.fecha_fin);

            // Validar que las fechas sean válidas
            if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
                return res.status(400).json({
                    message: "Fechas inválidas en el estado de cuenta",
                    detalles: {
                        fecha_inicio: estadoData.fecha_inicio,
                        fecha_fin: estadoData.fecha_fin
                    }
                });
            }

            // Asegurar que fin sea el final del día
            fin.setHours(23, 59, 59, 999);

        } catch (error) {
            return res.status(400).json({
                message: "Error al procesar las fechas del estado de cuenta",
                error: error instanceof Error ? error.message : "Error desconocido"
            });
        }

        const whereCondition: any = {
            // Usar confirmedAt en lugar de travelDate
            confirmedAt: {
                [Op.between]: [inicio, fin]
            }
        };
        
        if (empresaId) {
            // Verificar si la empresa existe primero
            const empresa = await Empresa.findByPk(empresaId);
            if (empresa) {
                // Filtrar por id_empresa
                whereCondition.id_empresa = empresaId;
            } else {
                // Si la empresa no existe, devolver error o tickets sin empresa
                return res.status(404).json({ 
                    message: "Empresa no encontrada",
                    empresaId 
                });
            }
        } else {
            // Si no hay empresaId, buscar tickets sin empresa asignada
            whereCondition.id_empresa = null;
        }

        // 4. BUSCAR TICKETS
        const tickets = await Ticket.findAll({
            where: whereCondition,
            include: [
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut'],
                    required: empresaId ? true : false
                },
                {
                    model: Pasajero,
                    required: false,
                    attributes: ['id', 'nombre', 'rut', 'correo', 'telefono']
                }
            ],
            order: [["confirmedAt", "DESC"]],
        });

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
