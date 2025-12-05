// src/controllers/ticket.controller.ts

import { Request, Response } from "express";
import { Op } from "sequelize";
import { Ticket } from "../models/ticket.model";
import { ITicketCreate, ITicketUpdate } from "../interfaces/ticket.interface";
import { User } from "../models/user.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Pasajero } from "../models/pasajero.model"; // Nueva importación

import { sendTicketCancellationEmail, sendTicketConfirmationEmail } from "../services/mail.service";
import { generateTicketPDFTemplate1, generateTicketPDFTemplate2, TicketPDFData } from "../services/pdf.service";
import { Empresa } from "../models/empresa.model";

/**
 * Construye un objeto de filtros Sequelize a partir de los parámetros de consulta recibidos.
 * Permite filtrar por cualquier campo del modelo Ticket, soportando operadores "desde", "hasta" e "igual".
 * Ejemplo de query params:
 *   ?origin=SCL&destination=PMC&travelDate_desde=2024-06-01&travelDate_hasta=2024-06-30&fare=15000
 */
function buildTicketFilters(query: any): Record<string, any> {
    const filters: Record<string, any> = {};
    const ticketFields = [
        "id", "ticketNumber", "pnrNumber", "ticketStatus", "origin", "destination", "travelDate",
        "departureTime", "seatNumbers", "fare", "monto_boleto", "monto_devolucion",
        "confirmedAt", "id_User", "id_pasajero", // Cambiado: ahora usamos id_pasajero
        "created_at", "updated_at"
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
            const tickets = await Ticket.findAll({
                where: filters,
                include: [
                    {
                        model: User,
                        attributes: ['id', 'nombre', 'email', 'empresa_id']
                    },
                    {
                        model: Pasajero,
                        attributes: ['id', 'nombre', 'rut', 'correo'],
                        required: false
                    }
                ]
            });

            const ticketsJSON = tickets.map(ticket => ticket.toJSON());
            return res.json(ticketsJSON);
        }

        if (rol === "superuser") {
            const tickets = await Ticket.findAll({
                where: filters,
                include: [
                    {
                        model: User,
                        attributes: ['id', 'nombre', 'email', 'empresa_id']
                    },
                    {
                        model: Pasajero,
                        attributes: ['id', 'nombre', 'rut', 'correo'],
                        required: false
                    }
                ]
            });

            const ticketsJSON = tickets.map(ticket => ticket.toJSON());
            return res.json(ticketsJSON);
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
            pnrNumber,
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
            id_User,
            id_pasajero
        } = req.body;

        // Validar que el usuario existe
        const user = await User.findByPk(id_User);
        if (!user) return res.status(404).json({ message: "Usuario no existe" });

        const userData = user.toJSON();

        if (!userData.empresa_id) {
            return res.status(400).json({
                message: "El usuario no tiene empresa asignada",
                detalles: {
                    userId: userData.id,
                    userName: userData.nombre,
                    userEmail: userData.email
                }
            });
        }

        let pasajeroData = null;
        if (id_pasajero) {
            const pasajero = await Pasajero.findByPk(id_pasajero);
            if (!pasajero) {
                return res.status(404).json({ message: "Pasajero no encontrado" });
            }

            const pasajeroJSON = pasajero.toJSON();
            if (pasajeroJSON.id_empresa !== userData.empresa_id) {
                return res.status(400).json({
                    message: "El pasajero no pertenece a la misma empresa que el usuario",
                    detalles: {
                        empresa_pasajero: pasajeroJSON.id_empresa,
                        empresa_usuario: userData.empresa_id
                    }
                });
            }
            pasajeroData = pasajeroJSON;
        }

        const empresa = await Empresa.findByPk(userData.empresa_id);
        if (!empresa) {
            return res.status(400).json({
                message: "La empresa asignada al usuario no existe",
                detalles: {
                    userId: userData.id,
                    empresaId: userData.empresa_id
                }
            });
        }

        const empresaData = empresa.toJSON();

        // Validar límite de monto máximo
        if (empresaData.monto_maximo !== null && empresaData.monto_maximo !== undefined) {
            const montoActual = empresaData.monto_acumulado || 0;
            const montoMaximo = empresaData.monto_maximo;
            const montoNuevo = montoActual + monto_boleto;

            if (montoNuevo > montoMaximo) {
                return res.status(400).json({
                    message: `La empresa ha excedido su límite de gasto. Límite: $${montoMaximo}, Actual: $${montoActual}, Nuevo ticket: $${monto_boleto}`,
                    detalles: {
                        monto_maximo: montoMaximo,
                        monto_acumulado: montoActual,
                        monto_ticket: monto_boleto,
                        monto_nuevo_total: montoNuevo,
                        disponible: montoMaximo - montoActual
                    }
                });
            }
        }

        // Crear el ticket
        const ticket = await Ticket.create({
            ticketNumber,
            pnrNumber,
            ticketStatus,
            origin,
            destination,
            travelDate: typeof travelDate === "string" ? new Date(travelDate) : travelDate,
            departureTime,
            seatNumbers,
            fare,
            monto_boleto,
            monto_devolucion: monto_devolucion || 0,
            confirmedAt: typeof confirmedAt === "string" ? new Date(confirmedAt) : confirmedAt,
            id_User,
            id_pasajero
        });

        try {
            const montoActual = empresaData.monto_acumulado || 0;
            const nuevoMontoAcumulado = montoActual + monto_boleto;

            await empresa.update({
                monto_acumulado: nuevoMontoAcumulado
            });

            await empresa.reload();
            const empresaActualizada = empresa.toJSON();

            console.log('Monto acumulado actualizado correctamente:', {
                empresaId: empresaActualizada.id,
                montoActualizado: empresaActualizada.monto_acumulado
            });
        } catch (error) {
            console.error('Error al actualizar monto acumulado:', error);
        }

        // Envío de email
        let emailSent = false;
        let emailError: string | null = null;

        try {
            // Determinar el email destino
            let emailDestino = null;
            let nombrePasajero = "Pasajero";
            let rutPasajero = "";

            if (pasajeroData) {
                // Usar datos del pasajero
                emailDestino = pasajeroData.correo;
                nombrePasajero = pasajeroData.nombre;
                rutPasajero = pasajeroData.rut || '';
            } else {
                // Fallback a datos del usuario
                emailDestino = userData.email;
                nombrePasajero = userData.nombre;
                rutPasajero = userData.rut || '';
            }

            console.log('[MAIL] Email destino para confirmación:', {
                emailDestino,
                nombrePasajero,
                tienePasajero: !!pasajeroData
            });

            if (emailDestino) {
                const pdfData: TicketPDFData = {
                    ticket: {
                        id: ticket.id,
                        ticketNumber: ticketNumber,
                        pnrNumber: pnrNumber,
                        ticketStatus: ticketStatus,
                        origin: origin,
                        destination: destination,
                        travelDate: typeof travelDate === "string" ? travelDate : (travelDate as Date).toISOString().split('T')[0],
                        departureTime: departureTime,
                        seatNumbers: seatNumbers,
                        fare: fare,
                        monto_boleto: monto_boleto,
                        monto_devolucion: monto_devolucion || 0,
                        confirmedAt: typeof confirmedAt === "string" ? confirmedAt : (confirmedAt as Date).toISOString(),
                        created_at: ticket.created_at?.toISOString(),
                        updated_at: ticket.updated_at?.toISOString()
                    },
                    cliente: {
                        id: userData.id,
                        nombre: userData.nombre || 'No disponible',
                        rut: userData.rut || null,
                        email: userData.email || 'No disponible',
                        rol: userData.rol || null
                    },
                    empresa: {
                        id: empresaData.id || null,
                        nombre: empresaData.nombre || 'No disponible',
                        rut: empresaData.rut || null,
                        cuenta_corriente: empresaData.cuenta_corriente || null,
                        estado: empresaData.estado || null
                    },
                    pasajero: {
                        nombre: pasajeroData?.nombre || userData.nombre || 'No disponible',
                        rut: pasajeroData?.rut || userData.rut || null,
                        correo: pasajeroData?.correo || userData.email || 'No disponible'
                    }
                };
                
                const pdfBytes = await generateTicketPDFTemplate2(pdfData as TicketPDFData);
                const pdfBuffer = Buffer.from(pdfBytes);

                await sendTicketConfirmationEmail({
                    email: emailDestino!,
                    nombre: nombrePasajero,
                    rut: rutPasajero
                }, pdfData, pdfBuffer);

                emailSent = true;
                console.log('[MAIL] Email enviado exitosamente a:', emailDestino);
            } else {
                console.log('[MAIL] No se puede enviar email: no hay email disponible');
            }
        } catch (err) {
            console.error('[MAIL] Error enviando email de confirmación:', err);
            emailError = (err as Error).message;
        }

        const ticketConRelaciones = await Ticket.findByPk(ticket.id, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'email']
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false
                }
            ]
        });

        if (!ticketConRelaciones) {
            return res.status(500).json({ message: "Error al obtener ticket creado" });
        }

        const ticketJSON = ticketConRelaciones.toJSON();

        res.status(201).json({
            ...ticketJSON,
            emailInfo: {
                sent: emailSent,
                error: emailError || null,
                message: emailSent
                    ? 'Email enviado exitosamente'
                    : emailError
                        ? `Ticket creado pero email no enviado: ${emailError}`
                        : 'Ticket creado pero email no enviado'
            }
        });
    } catch (err) {
        console.error('Error general en create:', err)
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

        const ticket = await Ticket.findByPk(id, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'email', 'empresa_id']
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false
                }
            ]
        });

        if (!ticket) return res.status(404).json({ message: "Ticket no existe" });

        const ticketData = ticket.toJSON();
        const userData = ticketData.user ? ticketData.user : null;

        if (!userData) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        // if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== userData.empresa_id)
        //     return res.status(403).json({ message: "No autorizado" });

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

        if (updateData.id_pasajero !== undefined) {
            if (updateData.id_pasajero === null) {
                // Permitir establecer como null
                updateData.id_pasajero = null;
            } else if (updateData.id_pasajero) {
                const pasajero = await Pasajero.findByPk(updateData.id_pasajero);
                if (!pasajero) {
                    return res.status(404).json({ message: "Pasajero no encontrado" });
                }

                const pasajeroJSON = pasajero.toJSON();
                if (pasajeroJSON.id_empresa !== userData.empresa_id) {
                    return res.status(400).json({
                        message: "El pasajero no pertenece a la misma empresa que el usuario",
                        detalles: {
                            empresa_pasajero: pasajeroJSON.id_empresa,
                            empresa_usuario: userData.empresa_id
                        }
                    });
                }
            }
        }

        const estadoAnterior = ticketData.ticketStatus;
        const montoDevolucionAnterior = ticketData.monto_devolucion || 0;
        const montoDevolucionNuevo = data.monto_devolucion || 0;

        if (data.ticketStatus === "Anulado" && estadoAnterior === "Confirmed") {
            if (userData.empresa_id) {
                try {
                    const empresa = await Empresa.findByPk(userData.empresa_id);
                    if (empresa) {
                        const empresaData = empresa.toJSON();
                        const montoActual = empresaData.monto_acumulado || 0;

                        // Usar el monto_devolucion del update o del ticket existente
                        const montoDevolucion = data.monto_devolucion !== undefined
                            ? data.monto_devolucion
                            : ticketData.monto_devolucion || ticketData.monto_boleto;

                        // Asegurarnos de que el monto de devolución sea positivo
                        const montoARestar = Math.abs(montoDevolucion);

                        // Restar el monto (pero no dejar negativo)
                        const nuevoMonto = Math.max(0, montoActual - montoARestar);

                        await empresa.update({
                            monto_acumulado: nuevoMonto
                        });
                    }
                } catch (error) {
                    console.error('Error al ajustar monto acumulado por anulación:', error);
                }
            }
        }

        let emailAnulacionSent = false;
        let emailAnulacionError: string | null = null;

        if (data.ticketStatus === "Anulado" && estadoAnterior !== "Anulado") {
            try {
                // Obtener datos para el PDF
                const empresa = await Empresa.findByPk(userData.empresa_id);
                const empresaData = empresa ? empresa.toJSON() : null;
                
                // Obtener datos del pasajero si existe
                let pasajeroData = null;
                if (ticketData.id_pasajero) {
                    const pasajero = await Pasajero.findByPk(ticketData.id_pasajero);
                    pasajeroData = pasajero ? pasajero.toJSON() : null;
                }
        
                const emailDestino = pasajeroData?.correo || userData.email;
                const nombrePasajero = pasajeroData?.nombre || userData.nombre;
                const rutPasajero = pasajeroData?.rut || userData.rut || '';
        
                if (emailDestino) {
                    // Preparar datos para el PDF
                    const pdfDataForCancellation: any = {
                        origen: {
                            origen: ticketData.origin,
                            fecha_viaje: ticketData.travelDate instanceof Date
                                ? ticketData.travelDate.toISOString()
                                : ticketData.travelDate,
                            hora_salida: ticketData.departureTime
                        },
                        destino: {
                            destino: ticketData.destination
                        },
                        boleto: {
                            numero_asiento: ticketData.seatNumbers,
                            numero_ticket: ticketData.ticketNumber,
                            pnr_number: ticketData.pnrNumber,
                            estado_confirmacion: "Anulado"
                        },
                        pasajero: {
                            nombre: nombrePasajero,
                            documento: rutPasajero,
                            precio_original: ticketData.fare,
                            precio_boleto: ticketData.monto_boleto,
                            precio_devolucion: data.monto_devolucion || ticketData.monto_devolucion
                        }
                    };
        
                    console.log('[PDF] Datos para PDF de anulación:', pdfDataForCancellation);
        
                    await sendTicketCancellationEmail({
                        email: emailDestino!,
                        nombre: nombrePasajero,
                        rut: rutPasajero
                    }, pdfDataForCancellation);
        
                    emailAnulacionSent = true;
                    console.log('[MAIL] Email de anulación enviado exitosamente a:', emailDestino);
                }
            } catch (err) {
                console.error('[MAIL] Error enviando email de anulación:', err);
                emailAnulacionError = (err as Error).message;
            }
        }

        // Actualizar el ticket
        await ticket.update(updateData);

        const ticketActualizado = await Ticket.findByPk(id, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'email']
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false
                }
            ]
        });

        if (!ticketActualizado) {
            return res.status(500).json({ message: "Error al obtener ticket actualizado" });
        }

        const respuesta = ticketActualizado.toJSON();

        res.json({
            ...respuesta,
            message: "Ticket actualizado correctamente",
            ajustesRealizados: {
                estadoCambiado: data.ticketStatus !== undefined,
                devolucionAjustada: montoDevolucionNuevo !== montoDevolucionAnterior
            },
            emailInfo: data.ticketStatus === "Anulado" && estadoAnterior !== "Anulado" ? {
                sent: emailAnulacionSent,
                error: emailAnulacionError || null,
                message: emailAnulacionSent
                    ? 'Email de anulación enviado exitosamente'
                    : emailAnulacionError
                        ? `Ticket actualizado pero email de anulación no enviado: ${emailAnulacionError}`
                        : 'Ticket actualizado pero email de anulación no enviado'
            } : undefined
        });
    } catch (err) {
        console.error('Error en update:', err);
        res.status(500).json({ message: "Error en servidor", error: (err as Error).message });
    }
};

/**
 * Eliminar ticket.
 */
export const remove = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const ticket = await Ticket.findByPk(id, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'empresa_id']
                }
            ]
        });

        if (!ticket) return res.status(404).json({ message: "Ticket no existe" });

        const ticketData = ticket.toJSON();
        const userData = ticketData.user ? ticketData.user : null;

        if (!userData) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== userData.empresa_id)
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

        const ticket = await Ticket.findByPk(id, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'empresa_id']
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false
                }
            ]
        });

        if (!ticket) return res.status(404).json({ message: "Ticket no existe" });

        // Convertir a objeto plano
        const ticketData = ticket.toJSON();
        const userData = ticketData.user ? ticketData.user : null;

        if (!userData) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        // if ((req.user as any).rol === "admin") {
        //     if (userData.empresa_id !== (req.user as any).empresa_id)
        //         return res.status(403).json({ message: "No autorizado" });
        // }

        const estadoAnterior = ticketData.ticketStatus;
        ticket.ticketStatus = ticketStatus;
        await ticket.save();

        if (estadoAnterior === "Confirmed" && ticketStatus === "Anulado") {
            if (userData.empresa_id) {
                try {
                    const empresa = await Empresa.findByPk(userData.empresa_id);
                    if (empresa) {
                        const empresaData = empresa.toJSON();
                        const montoActual = empresaData.monto_acumulado || 0;
                        const montoTicket = ticketData.monto_devolucion || 0;

                        // Restar el monto
                        const nuevoMonto = Math.max(0, montoActual - montoTicket);

                        await empresa.update({
                            monto_acumulado: nuevoMonto
                        });

                        console.log('Monto acumulado ajustado por anulación:', {
                            empresaId: empresaData.id,
                            montoAnterior: montoActual,
                            montoRestado: montoTicket,
                            montoNuevo: nuevoMonto
                        });
                    }
                } catch (error) {
                    console.error('Error al ajustar monto acumulado por anulación:', error);
                }
            }
        }

        const ticketActualizado = await Ticket.findByPk(id, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'email']
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false
                }
            ]
        });

        if (!ticketActualizado) {
            return res.status(500).json({ message: "Error al obtener ticket actualizado" });
        }

        const ticketActualizadoJSON = ticketActualizado.toJSON();

        res.json({
            ...ticketActualizadoJSON,
            message: "Estado del ticket actualizado"
        });
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

        const tickets = await Ticket.findAll({
            where: whereClause,
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'email']
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false
                }
            ]
        });

        const ticketsJSON = tickets.map(ticket => ticket.toJSON());
        return res.json(ticketsJSON);
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
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false,
                    include: [
                        {
                            model: CentroCosto,
                            attributes: ['id', 'nombre']
                        }
                    ]
                }
            ]
        });

        const ticketsJSON = tickets.map(ticket => ticket.toJSON());
        return res.json(ticketsJSON);
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

        const tickets = await Ticket.findAll({
            where: filters,
            include: [
                {
                    model: User,
                    attributes: ['id', 'nombre', 'email']
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false
                }
            ]
        });

        const ticketsJSON = tickets.map(ticket => ticket.toJSON());
        return res.json(ticketsJSON);
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const checkDisponibilidad = async (
    req: Request<{}, {}, { id_User: number; monto_boleto: number }>,
    res: Response
) => {
    try {
        const { id_User, monto_boleto } = req.body;

        // Validar datos requeridos
        if (!id_User || monto_boleto === undefined || monto_boleto === null) {
            return res.status(400).json({
                message: "id_User y monto_boleto son requeridos",
                disponible: false
            });
        }

        // Buscar usuario
        const user = await User.findByPk(id_User);
        if (!user) {
            return res.status(404).json({
                message: "Usuario no encontrado",
                disponible: false
            });
        }

        const userData = user.toJSON();

        if (!userData.empresa_id) {
            return res.status(400).json({
                message: "El usuario no tiene empresa asignada",
                disponible: false,
                detalles: {
                    userId: userData.id,
                    userName: userData.nombre
                }
            });
        }

        // Buscar empresa
        const empresa = await Empresa.findByPk(userData.empresa_id);
        if (!empresa) {
            return res.status(400).json({
                message: "La empresa asignada al usuario no existe",
                disponible: false,
                detalles: {
                    empresaId: userData.empresa_id
                }
            });
        }

        const empresaData = empresa.toJSON();

        // Verificar límite de monto máximo
        if (empresaData.monto_maximo !== null && empresaData.monto_maximo !== undefined) {
            const montoActual = empresaData.monto_acumulado || 0;
            const montoMaximo = empresaData.monto_maximo;
            const montoNuevo = montoActual + monto_boleto;

            if (montoNuevo > montoMaximo) {
                return res.status(200).json({
                    disponible: false,
                    message: `La empresa ha excedido su límite de gasto. Límite: $${montoMaximo}, Actual: $${montoActual}, Nuevo ticket: $${monto_boleto}`,
                    detalles: {
                        monto_maximo: montoMaximo,
                        monto_acumulado: montoActual,
                        monto_ticket: monto_boleto,
                        monto_nuevo_total: montoNuevo,
                        disponible: montoMaximo - montoActual,
                        excedido: (montoNuevo > montoMaximo) ? montoNuevo - montoMaximo : 0
                    }
                });
            }

            // Si hay disponibilidad
            return res.status(200).json({
                disponible: true,
                message: "Disponibilidad verificada correctamente",
                detalles: {
                    monto_maximo: montoMaximo,
                    monto_acumulado: montoActual,
                    monto_ticket: monto_boleto,
                    monto_nuevo_total: montoNuevo,
                    disponible: montoMaximo - montoActual,
                    porcentaje_disponible: Math.round(((montoMaximo - montoNuevo) / montoMaximo) * 100)
                }
            });
        }

        // Si no hay límite configurado
        return res.status(200).json({
            disponible: true,
            message: "Empresa sin límite de gasto configurado",
            detalles: {
                monto_acumulado: empresaData.monto_acumulado || 0,
                monto_ticket: monto_boleto,
                monto_nuevo_total: (empresaData.monto_acumulado || 0) + monto_boleto
            }
        });

    } catch (err) {
        console.error('Error en checkDisponibilidad:', err);
        res.status(500).json({
            message: "Error en servidor",
            disponible: false,
            error: (err as Error).message
        });
    }
};