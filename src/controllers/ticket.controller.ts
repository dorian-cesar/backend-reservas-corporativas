// src/controllers/ticket.controller.ts

import { Request, Response } from "express";
import { Op } from "sequelize";
import { Ticket } from "../models/ticket.model";
import { ITicketCreate, ITicketUpdate } from "../interfaces/ticket.interface";
import { User } from "../models/user.model";
import { CentroCosto } from "../models/centro_costo.model";

/**
 * Construye un objeto de filtros Sequelize a partir de los parámetros de consulta recibidos.
 * Permite filtrar por cualquier campo del modelo Ticket, soportando operadores "desde", "hasta" e "igual".
 * Ejemplo de query params:
 *   ?origin=SCL&destination=PMC&travelDate_desde=2024-06-01&travelDate_hasta=2024-06-30&fare=15000
 */
function buildTicketFilters(query: any): Record<string, any> {
    const filters: Record<string, any> = {};
    const ticketFields = [
        "id", "ticketNumber", "ticketStatus", "origin", "destination", "travelDate",
        "departureTime", "seatNumbers", "fare", "monto_boleto", "monto_devolucion",
        "confirmedAt", "id_User", "created_at", "updated_at"
    ];

    for (const key of Object.keys(query)) {
        // Soporta campos con sufijos _desde, _hasta, o igual
        for (const field of ticketFields) {
            if (key === field) {
                filters[field] = query[key];
            }
            if (key === `${field}_desde`) {
                if (!filters[field]) filters[field] = {};
                filters[field][Op.gte] = query[key];
            }
            if (key === `${field}_hasta`) {
                if (!filters[field]) filters[field] = {};
                filters[field][Op.lte] = query[key];
            }
        }
    }
    return filters;
}

/**
 * Listar tickets con filtros opcionales.
 */
export const getTickets = async (req: Request, res: Response) => {
    try {
        const rol = (req.user as any).rol;
        const empresa_id = (req.user as any).empresa_id;

        // Construcción de filtros dinámicos
        const filters = buildTicketFilters(req.query);

        if (rol === "admin") {
            // Solo tickets de usuarios de la empresa del admin
            const users = await User.findAll({ where: { empresa_id } });
            const userIds = users.map(u => u.id);
            filters.id_User = userIds;
            const tickets = await Ticket.findAll({ where: filters });
            return res.json(tickets);
        }

        if (rol === "superuser") {
            const tickets = await Ticket.findAll({ where: filters });
            return res.json(tickets);
        }

        return res.status(403).json({ message: "No autorizado" });
        } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Error en servidor" });
    }
};

/**
 * Crear ticket.
 */
export const create = async (
    req: Request<{}, {}, ITicketCreate>,
    res: Response
) => {
    try {
        const {
            ticketNumber,
            ticketStatus,
            origin,
            destination,
            travelDate,
            departureTime,
            seatNumbers,
            fare,
            monto_boleto,
            monto_devolucion,
            confirmedAt,
            id_User
        } = req.body;

        // Validación de usuario
        const user = await User.findByPk(id_User);
        if (!user) return res.status(404).json({ message: "Usuario no existe" });

        // Si es admin, solo puede crear tickets para usuarios de su empresa
        if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== user.empresa_id)
            return res.status(403).json({ message: "No autorizado" });

        const ticket = await Ticket.create({
            ticketNumber,
            ticketStatus,
            origin,
            destination,
            travelDate: typeof travelDate === "string" ? new Date(travelDate) : travelDate,
            departureTime,
            seatNumbers,
            fare,
            monto_boleto,
            monto_devolucion,
            confirmedAt: typeof confirmedAt === "string" ? new Date(confirmedAt) : confirmedAt,
            id_User
        });

        res.status(201).json(ticket);
        } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Error en servidor" });
    }
};

/**
 * Actualizar ticket.
 */
export const update = async (
    req: Request<{ id: string }, {}, ITicketUpdate>,
    res: Response
) => {
    try {
        const id = req.params.id;
        const data = req.body;
        const ticket = await Ticket.findByPk(id, { raw: false });

        if (!ticket) return res.status(404).json({ message: "Ticket no existe" });

        // Validación de usuario
        const userId = ticket.getDataValue('id_User');
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ message: "Usuario no existe" });

        if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== user.empresa_id)
            return res.status(403).json({ message: "No autorizado" });

        // Normalizar tipos para campos Date
        const updateData: any = { ...data };
        if (updateData.travelDate !== undefined) {
            updateData.travelDate = typeof updateData.travelDate === "string"
                ? new Date(updateData.travelDate)
                : updateData.travelDate;
        }
        if (updateData.confirmedAt !== undefined) {
            updateData.confirmedAt = typeof updateData.confirmedAt === "string"
                ? new Date(updateData.confirmedAt)
                : updateData.confirmedAt;
        }

        await ticket.update(updateData);

        const updated = await Ticket.findByPk(id);
        res.json(updated);
        } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Error en servidor" });
    }
};

/**
 * Eliminar ticket.
 */
export const remove = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const ticket = await Ticket.findByPk(id);

        if (!ticket) return res.status(404).json({ message: "Ticket no existe" });

        // Validación de usuario
        const user = await User.findByPk(ticket.id_User);
        if (!user) return res.status(404).json({ message: "Usuario no existe" });

        if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== user.empresa_id)
            return res.status(403).json({ message: "No autorizado" });

        await ticket.destroy();
        res.json({ message: "Eliminado" });
        } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Error en servidor" });
    }
};

/**
 * Cambiar estado del ticket.
 */
export const setStatus = async (
    req: Request<{ id: string }, {}, { ticketStatus: "Confirmed" | "Anulado" }>,
    res: Response
) => {
    try {
        const id = req.params.id;
        const { ticketStatus } = req.body;

        const ticket = await Ticket.findByPk(id);
        if (!ticket) return res.status(404).json({ message: "Ticket no existe" });

        // Validación de usuario
        const user = await User.findByPk(ticket.id_User);
        if (!user) return res.status(404).json({ message: "Usuario no existe" });

        if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== user.empresa_id)
            return res.status(403).json({ message: "No autorizado" });

        ticket.ticketStatus = ticketStatus;
        await ticket.save();

        res.json(ticket);
        } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Error en servidor" });
    }
};

/**
 * Buscar tickets por ticketNumber
 */
export const getTicketsByTicketNumber = async (
    req: Request<{}, {}, {}, { ticketNumber?: string }>,
    res: Response
) => {
    try {
        const { ticketNumber } = req.query;
        const { rol, empresa_id, id } = req.user as any;

        // Construir condición de búsqueda
        const whereClause: any = {};

        if (ticketNumber) {
            whereClause.ticketNumber = ticketNumber;
        }

        // Solo tickets del usuario autenticado
        whereClause.id_User = id;

        const tickets = await Ticket.findAll({ where: whereClause });
        return res.json(tickets);
        } catch (err) {
        console.log(err)
        res.status(500).json({ message: 'Error en servidor' });
    }
};

/**
 * Buscar tickets por empresa, incluyendo datos del usuario y centro de costo.
 */
export const getTicketsByEmpresa = async (
    req: Request<{ id_empresa: string }>,
    res: Response
) => {
    try {
        const id_empresa = parseInt(req.params.id_empresa, 10);

        const users = await User.findAll({ where: { empresa_id: id_empresa } });
        if (!users.length) {
            return res.status(404).json({ message: "No existen usuarios para la empresa indicada" });
        }
        const userIds = users.map(u => u.id);

        const filters = buildTicketFilters(req.query);
        filters.id_User = userIds;

        const tickets = await Ticket.findAll({
            where: filters,
            include: [
                {
                    model: User,
                    attributes: [
                        'id',
                        'nombre',
                        'rut',
                        'email',
                        'rol',
                        'empresa_id',
                        'centro_costo_id',
                        'estado',
                        'created_at',
                        'updated_at'
                    ],
                    include: [
                        {
                            model: CentroCosto,
                            attributes: [
                                'id',
                                'nombre',
                                'empresa_id'
                            ]
                        }
                    ]
                }
            ]
        });

        return res.json(tickets);
        } catch (err) {
        console.log(err)
        console.error(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};

/**
 * Buscar tickets por usuario.
 */
export const getTicketsByUser = async (
    req: Request<{ id_User: string }>,
    res: Response
) => {
    try {
        const id_User = parseInt(req.params.id_User, 10);

        const user = await User.findByPk(id_User);
        if (!user) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        const filters = buildTicketFilters(req.query);
        filters.id_User = id_User;

        const tickets = await Ticket.findAll({ where: filters });

        return res.json(tickets);
        } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Error en servidor" });
    }
};
