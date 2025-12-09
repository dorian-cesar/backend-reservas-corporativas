import { Request, Response } from 'express';
import { Ticket } from '../models/ticket.model';
import { User } from '../models/user.model';
import { Pasajero } from '../models/pasajero.model';
import { Empresa } from '../models/empresa.model';
import { generateTicketPDFTemplate1, generateTicketPDFTemplate2, TicketPDFData } from '../services/pdf.service';

export const getTicketsWithPassengerInfo = async (req: Request, res: Response) => {
    try {
        const { ticketNumber } = req.params;
        const { format } = req.query;

        if (!ticketNumber) {
            return res.status(400).json({
                success: false,
                message: 'El parámetro ticketNumber es requerido'
            });
        }

        const tickets = await Ticket.findAll({
            where: {
                ticketNumber: ticketNumber
            },
            include: [
                {
                    model: User,
                    required: true,
                    attributes: ['id', 'nombre', 'rut', 'email', 'rol'],
                    include: [{
                        model: Empresa,
                        attributes: ['id', 'nombre', 'rut', 'cuenta_corriente', 'estado']
                    }]
                },
                {
                    model: Pasajero,
                    attributes: ['id', 'nombre', 'rut', 'correo'],
                    required: false
                },

            ],
            order: [['travelDate', 'DESC']]
        });

        if (tickets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No se encontraron tickets con el número proporcionado'
            });
        }

        // Para formato JSON normal
        if (format !== 'pdf') {
            const formattedTickets = tickets.map(ticket => {
                const ticketData = ticket.toJSON() as any;
                const userData = ticketData.user || {};
                const empresaData = userData.empresa || {};
                const passengerData = ticketData.pasajero || {};

                return {
                    ticket: {
                        id: ticketData.id,
                        ticketNumber: ticketData.ticketNumber,
                        pnrNumber: ticketData.pnrNumber,
                        ticketStatus: ticketData.ticketStatus,
                        origin: ticketData.origin,
                        destination: ticketData.destination,
                        terminal_origen: ticketData.terminal_origen || "",
                        terminal_destino: ticketData.terminal_destino || "",
                        travelDate: ticketData.travelDate,
                        departureTime: ticketData.departureTime,
                        seatNumbers: ticketData.seatNumbers,
                        fare: ticketData.fare,
                        monto_boleto: ticketData.monto_boleto,
                        monto_devolucion: ticketData.monto_devolucion,
                        confirmedAt: ticketData.confirmedAt,
                        created_at: ticketData.created_at,
                        updated_at: ticketData.updated_at
                    },
                    cliente: {
                        id: userData.id || null,
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
                        nombre: passengerData.nombre || userData.nombre || 'No disponible',
                        rut: passengerData.rut || userData.rut || null,
                        correo: passengerData.correo || userData.email || 'No disponible'
                    }
                };
            });

            return res.json({
                success: true,
                data: formattedTickets,
                total: tickets.length
            });
        }

        // Para formato PDF (tomamos el primer ticket)
        const ticket = tickets[0];
        const ticketData = ticket.toJSON() as any;
        const userData = ticketData.user || {};
        const empresaData = userData.empresa || {};
        const passengerData = ticketData.pasajero || {};

        const pdfData: TicketPDFData = {
            ticket: {
                id: ticketData.id,
                ticketNumber: ticketData.ticketNumber,
                pnrNumber: ticketData.pnrNumber,
                ticketStatus: ticketData.ticketStatus,
                origin: ticketData.origin,
                destination: ticketData.destination,
                terminal_origen: ticketData.terminal_origen,
                terminal_destino: ticketData.terminal_destino,
                travelDate: ticketData.travelDate,
                departureTime: ticketData.departureTime,
                seatNumbers: ticketData.seatNumbers,
                fare: ticketData.fare,
                monto_boleto: ticketData.monto_boleto,
                monto_devolucion: ticketData.monto_devolucion,
                confirmedAt: ticketData.confirmedAt,
                created_at: ticketData.created_at,
                updated_at: ticketData.updated_at
            },
            cliente: {
                id: userData.id || null,
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
                nombre: passengerData.nombre || userData.nombre || 'No disponible',
                rut: passengerData.rut || userData.rut || null,
                correo: passengerData.correo || userData.email || 'No disponible'
            }
        };

        const pdfBytes = await generateTicketPDFTemplate2(pdfData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="boleto-${ticketNumber}.pdf"`);

        return res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('Error fetching tickets with passenger info:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};