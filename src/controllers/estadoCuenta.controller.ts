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
    const { estadoCuentaId, monto } = req.body;

    const estadoCuenta = await EstadoCuenta.findByPk(estadoCuentaId);
    if (!estadoCuenta) {
        return res.status(404).json({ message: "Estado de cuenta no encontrado" });
    }
    if (estadoCuenta.pagado) {
        return res.status(400).json({ message: "El estado de cuenta ya está pagado" });
    }

    // Registrar abono en cuenta corriente
    await CuentaCorriente.create({
        empresa_id: estadoCuenta.empresa_id,
        tipo_movimiento: "abono",
        monto: monto,
        descripcion: `Abono por pago de estado de cuenta #${estadoCuenta.id} periodo ${estadoCuenta.periodo}`,
        saldo: 0,
        referencia: `ABONO-EDC-${estadoCuenta.id}`
    });

    // Marcar como pagado
    estadoCuenta.pagado = true;
    estadoCuenta.fecha_pago = new Date();
    await estadoCuenta.save();

    return res.json({ message: "Estado de cuenta pagado correctamente" });
};


export const listarEstadosCuenta = async (req: Request, res: Response) => {
    try {
        const { empresaId, periodo, pagado, desde, hasta } = req.query;

        const where: any = {};

        if (empresaId) where.empresa_id = empresaId;
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
        return res.status(500).json({ message: "Error al obtener estados de cuenta" });
    }
};

export const listarTicketsDeEstadoCuenta = async (req: Request, res: Response) => {
    const { id } = req.params;

    const estado = await EstadoCuenta.findByPk(id);
    if (!estado) return res.status(404).json({ message: "Estado no encontrado" });

    const estadoData = estado.toJSON();

    if (!estadoData.periodo || estadoData.periodo.trim() === '') {
        return res.status(400).json({
            message: "El estado de cuenta no tiene período asignado"
        });
    }

    const empresaId = estadoData.empresa_id;
    const periodo = estadoData.periodo.trim();

    // Validar formato del período
    const periodoRegex = /^\d{4}-\d{2}$/;
    if (!periodoRegex.test(periodo)) {
        return res.status(400).json({
            message: "Formato de período inválido. Debe ser YYYY-MM"
        });
    }

    try {
        const [year, month] = periodo.split("-");

        // Validar que year y month sean números válidos
        const yearNum = Number(year);
        const monthNum = Number(month);

        if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
            return res.status(400).json({
                message: "Período inválido. El mes debe estar entre 01 y 12"
            });
        }

        const inicio = new Date(yearNum, monthNum - 1, 1);
        const fin = new Date(yearNum, monthNum, 0); // último día del mes

        const tickets = await Ticket.findAll({
            include: [
                {
                    model: User,
                    where: { empresa_id: empresaId },
                    attributes: []
                }
            ],
            where: {
                travelDate: {
                    [Op.between]: [inicio, fin]
                }
            },
            order: [["travelDate", "DESC"]],
        });

        return res.json(tickets);

    } catch (error) {
        console.error("Error al obtener tickets:", error);
        return res.status(500).json({
            message: "Error al obtener tickets del estado de cuenta"
        });
    }
};