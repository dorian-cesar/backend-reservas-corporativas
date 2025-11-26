// src/interfaces/ticket.interface.ts

import { TicketStatus } from "../models/ticket.model";

/**
 * Interfaz para la creación de tickets.
 */
export interface ITicketCreate {
    ticketNumber: string;
    ticketStatus: TicketStatus;
    origin: string;
    destination: string;
    travelDate: Date | string;
    departureTime: string;
    seatNumbers: string;
    fare: number;
    monto_boleto: number;
    monto_devolucion: number;
    confirmedAt: Date | string;
    id_User: number;
}

/**
 * Interfaz para la actualización de tickets.
 */
export interface ITicketUpdate {
    ticketNumber?: string;
    ticketStatus?: TicketStatus;
    origin?: string;
    destination?: string;
    travelDate?: Date | string;
    departureTime?: string;
    seatNumbers?: string;
    fare?: number;
    monto_boleto?: number;
    monto_devolucion?: number;
    confirmedAt?: Date | string;
    id_User?: number;
}
