// src/controllers/ticket.controller.ts

import { Request, Response } from "express";
import { Ticket } from "../models/ticket.model";
import { ITicketCreate, ITicketUpdate } from "../interfaces/ticket.interface";
import { User } from "../models/user.model";

/**
 * Listar tickets.
 */
export const getTickets = async (req: Request, res: Response) => {
    try {
        const rol = (req.user as any).rol;
        const empresa_id = (req.user as any).empresa_id;

        if (rol === "admin") {
            // Solo tickets de usuarios de la empresa del admin
            const users = await User.findAll({ where: { empresa_id } });
            const userIds = users.map(u => u.id);
            const tickets = await Ticket.findAll({ where: { id_User: userIds } });
            return res.json(tickets);
        }

        if (rol === "superuser") {
            const tickets = await Ticket.findAll();
            return res.json(tickets);
        }

        return res.status(403).json({ message: "No autorizado" });
    } catch (err) {
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
        res.status(500).json({ message: 'Error en servidor' });
    }
};


/**
 * Buscar tickets por empresa.
 */
export const getTicketsByEmpresa = async (
    req: Request<{ id_empresa: string }>,
    res: Response
) => {
    try {
        const rol = (req.user as any).rol;
        const id_empresa = parseInt(req.params.id_empresa, 10);


        const users = await User.findAll({ where: { empresa_id: id_empresa } });
        if (!users.length) {
            return res.status(404).json({ message: "No existen usuarios para la empresa indicada" });
        }
        const userIds = users.map(u => u.id);
        const tickets = await Ticket.findAll({ where: { id_User: userIds } });

        return res.json(tickets);
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};
