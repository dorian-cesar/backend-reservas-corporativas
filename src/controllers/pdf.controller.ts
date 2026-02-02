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
            devoluciones: number; // Nueva propiedad
        }>();

        centrosCostoDB.forEach(cc => {
            const plain = cc.get({ plain: true });
            centrosMap.set(plain.id, {
                id: plain.id,
                nombre: plain.nombre,
                cantidad_tickets: 0,
                monto_facturado: 0,
                devoluciones: 0,
            });
        });

        let ticketsConfirmados = 0;
        let ticketsAnulados = 0;
        let montoTotalBruto = 0;
        let devolucionesTotal = 0;

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
                const esAnulado = ticketPlain.ticketStatus === 'Anulado';
                const montoTicket = Number(ticketPlain.monto_boleto ?? 0);
                const montoDevolucion = Number(ticketPlain.monto_devolucion ?? 0);

                // Totales generales
                if (esAnulado) {
                    ticketsAnulados += 1;
                    devolucionesTotal += montoDevolucion;
                } else {
                    ticketsConfirmados += 1;
                    montoTotalBruto += montoTicket;
                }

                // Por centro de costo
                if (pasajero && pasajero.centroCosto) {
                    const centroId = pasajero.centroCosto.id;
                    const centro = centrosMap.get(centroId);

                    if (centro) {
                        centro.cantidad_tickets += 1;
                        if (esAnulado) {
                            centro.devoluciones += montoDevolucion;
                        } else {
                            centro.monto_facturado += montoTicket;
                        }
                    }
                }
            });
        }

        // USAR LOS DATOS DEL ESTADO DE CUENTA (que ya vienen procesados correctamente)
        // Estos son los valores reales que deben mostrarse
        const montoBrutoEstado = Number(estadoData.monto_facturado || 0);
        const devolucionesEstado = Number(estadoData.suma_devoluciones || 0);
        const montoNetoEstado = montoBrutoEstado - devolucionesEstado;

        // Calcular montos netos por centro de costo
        const centrosCostoArray = Array.from(centrosMap.values())
            .map(cc => ({
                ...cc,
                monto_neto: cc.monto_facturado - cc.devoluciones, // Monto neto por centro
            }))
            .sort((a, b) => b.monto_neto - a.monto_neto); // Ordenar por monto neto

        // Calcular totales NETOS desde los datos del estado de cuenta
        const totalTicketsNetos = (estadoData.total_tickets || 0) - (estadoData.total_tickets_anulados || 0);
        const totalMontoNeto = montoNetoEstado;

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
                tickets_generados: estadoData.total_tickets || 0,
                tickets_anulados: estadoData.total_tickets_anulados || 0,
                suma_devoluciones: devolucionesEstado,
                monto_bruto_facturado: montoBrutoEstado,
            },
            centros_costo: centrosCostoArray.map(cc => ({
                id: cc.id,
                nombre: cc.nombre,
                cantidad_tickets: cc.cantidad_tickets,
                monto_facturado: cc.monto_neto, // Usar monto NETO en el desglose
            })),
            totales: {
                cantidad_tickets: totalTicketsNetos, // Tickets netos (confirmados - anulados)
                monto_facturado: totalMontoNeto,     // Monto NETO a facturar
            },
        };

        // Log para debugging
        console.log('Resumen del estado de cuenta:');
        console.log('- Tickets totales:', estadoData.total_tickets);
        console.log('- Tickets anulados:', estadoData.total_tickets_anulados);
        console.log('- Monto bruto facturado:', montoBrutoEstado);
        console.log('- Suma devoluciones:', devolucionesEstado);
        console.log('- Monto neto:', montoNetoEstado);
        console.log('- Descuento aplicado:', estadoData.porcentaje_descuento || 0, '%');

        // Si hay descuento, ajustar el monto final
        if (estadoData.porcentaje_descuento && estadoData.porcentaje_descuento > 0) {
            const porcentajeDescuento = estadoData.porcentaje_descuento;
            const montoDescuento = totalMontoNeto * (porcentajeDescuento / 100);
            const montoFinalConDescuento = totalMontoNeto - montoDescuento;

            console.log('- Descuento aplicado:', porcentajeDescuento + '%');
            console.log('- Monto descuento:', montoDescuento);
            console.log('- Monto final con descuento:', montoFinalConDescuento);
        }

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
