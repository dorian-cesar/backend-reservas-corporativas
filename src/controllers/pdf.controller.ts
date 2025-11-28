import { Request, Response } from 'express';
import { Ticket } from '../models/ticket.model';
import { User } from '../models/user.model';
import { generateTicketPDF } from '../services/pdf.service';

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
            include: [{
                model: User,
                required: true,
                attributes: ['id', 'nombre', 'rut']
            }],
            order: [['travelDate', 'DESC']]
        });

        if (tickets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No se encontraron tickets con el número proporcionado'
            });
        }

        const formattedTickets = tickets.map(ticket => {
            const ticketData = ticket.toJSON() as any;

            return {
                origen: {
                    origen: ticketData.origin,
                    fecha_viaje: ticketData.travelDate,
                    hora_salida: ticketData.departureTime
                },
                destino: {
                    destino: ticketData.destination
                },
                boleto: {
                    numero_asiento: ticketData.seatNumbers,
                    numero_ticket: ticketData.ticketNumber,
                    estado_confirmacion: ticketData.ticketStatus
                },
                pasajero: {
                    nombre: ticketData.user?.nombre || 'No disponible',
                    documento: ticketData.user?.rut || 'No disponible',
                    precio_original: ticketData.fare,
                    precio_boleto: ticketData.monto_boleto,
                    precio_devolucion: ticketData.monto_devolucion
                }
            };
        });

        // Si el usuario quiere PDF
        if (format === 'pdf') {
            const pdfBytes = await generateTicketPDF(formattedTickets[0]);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="boleto-${ticketNumber}.pdf"`);

            return res.send(Buffer.from(pdfBytes));
        }

        // Por defecto devolver JSON
        return res.json({
            success: true,
            data: formattedTickets,
            total: tickets.length
        });

    } catch (error) {
        console.error('Error fetching tickets with passenger info:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};