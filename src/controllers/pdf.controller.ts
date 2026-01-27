import { Request, Response } from 'express';
import { Ticket } from '../models/ticket.model';
import { User } from '../models/user.model';
import { Pasajero } from '../models/pasajero.model';
import { Empresa, IEmpresa } from '../models/empresa.model';
import { Op } from 'sequelize';
import { CentroCosto } from '../models/centro_costo.model';
import { EstadoCuenta } from '../models/estado_cuenta.model';
import { generateTicketPDFTemplate1, generateTicketPDFTemplate2, TicketPDFData, generateEDPPDF, EDPPDFData } from '../services/pdf.service';

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

export const generarPDFEstadoCuenta = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        console.log('Generando PDF para estado de cuenta ID:', id);

        const estadoCuenta = await EstadoCuenta.findByPk(id);
        if (!estadoCuenta) {
            return res.status(404).json({ message: "Estado de cuenta no encontrado" });
        }
        const estadoData = estadoCuenta.toJSON();

        const empresa = await Empresa.findByPk(estadoData.empresa_id);
        if (!empresa) {
            return res.status(404).json({ message: "Empresa no encontrada" });
        }
        const empresaData = empresa.get({ plain: true }) as IEmpresa;

        const centrosCostoDB = await CentroCosto.findAll({
            where: { empresa_id: estadoData.empresa_id },
            attributes: ['id', 'nombre'],
        });

        const centrosMap = new Map<number, {
            id: number;
            nombre: string;
            cantidad_tickets: number;
            monto_facturado: number;
        }>();

        centrosCostoDB.forEach(cc => {
            const plain = cc.get({ plain: true });
            centrosMap.set(plain.id, {
                id: plain.id,
                nombre: plain.nombre,
                cantidad_tickets: 0,
                monto_facturado: 0,
            });
        });

        if (estadoData.fecha_inicio && estadoData.fecha_fin) {
            const tickets = await Ticket.findAll({
                where: {
                    id_empresa: estadoData.empresa_id,
                    confirmedAt: {
                        [Op.between]: [
                            new Date(estadoData.fecha_inicio),
                            new Date(estadoData.fecha_fin),
                        ],
                    },
                },
                include: [
                    {
                        model: Pasajero,
                        attributes: ['id', 'id_centro_costo'],
                        required: false,
                        include: [
                            {
                                model: CentroCosto,
                                attributes: ['id'],
                                required: false,
                            },
                        ],
                    },
                ],
            });

            console.log('Tickets encontrados:', tickets.length);

            tickets.forEach(ticket => {
                const ticketPlain = ticket.get({ plain: true });
                const pasajero = ticketPlain.pasajero;

                if (!pasajero || !pasajero.centroCosto) return;

                const centroId = pasajero.centroCosto.id;
                const centro = centrosMap.get(centroId);

                if (!centro) return;

                centro.cantidad_tickets += 1;
                centro.monto_facturado += Number(ticketPlain.monto_boleto ?? 0);
            });
        }

        const centrosCostoArray = Array.from(centrosMap.values()).sort(
            (a, b) => a.nombre.localeCompare(b.nombre)
        );

        const totalTickets = centrosCostoArray.reduce(
            (sum, cc) => sum + cc.cantidad_tickets,
            0
        );

        const totalMonto = centrosCostoArray.reduce(
            (sum, cc) => sum + cc.monto_facturado,
            0
        );

        const edpData: EDPPDFData = {
            edp: {
                numero_edp: estadoData.id!.toString(),
                fecha_generacion: estadoData.fecha_generacion
                    ? new Date(estadoData.fecha_generacion).toLocaleDateString('es-CL')
                    : null,
                periodo_reservas:
                    estadoData.fecha_inicio && estadoData.fecha_fin
                        ? `${new Date(estadoData.fecha_inicio).toLocaleDateString('es-CL')} - ${new Date(
                            estadoData.fecha_fin
                        ).toLocaleDateString('es-CL')}`
                        : null,
            },
            empresa: {
                id: Number(empresaData.id),
                nombre: empresaData.nombre,
                rut: empresaData.rut ?? 'No disponible',
                cuenta_corriente: empresaData.cuenta_corriente ?? null,
            },
            resumen: {
                tickets_generados: totalTickets,
                tickets_anulados: estadoData.total_tickets_anulados ?? 0,
                suma_devoluciones: estadoData.suma_devoluciones ?? 0,
                monto_bruto_facturado: totalMonto,
            },
            centros_costo: centrosCostoArray,
            totales: {
                cantidad_tickets: totalTickets,
                monto_facturado: totalMonto,
            },
        };

        const pdfBytes = await generateEDPPDF(edpData);
        const pdfBuffer = Buffer.from(pdfBytes);

        const fileName = `EDP-${empresaData.nombre.replace(/\s+/g, '-')}-${estadoData.periodo || 'sin-fecha'}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        return res.send(pdfBuffer);

    } catch (error) {
        console.error("Error al generar PDF de estado de cuenta:", error);
        return res.status(500).json({
            message: "Error al generar PDF",
            error: error instanceof Error ? error.message : "Error desconocido",
        });
    }
};
