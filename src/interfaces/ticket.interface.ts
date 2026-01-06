// src/interfaces/ticket.interface.ts

import { TicketStatus } from "../models/ticket.model";

/**
 * Interfaz para la creación de tickets.
 */
export interface ITicketCreate {
    ticketNumber: string;
    pnrNumber?: string;
    ticketStatus: TicketStatus;
    origin: string;
    destination: string;
    terminal_origen?: string;
    terminal_destino?: string;
    travelDate: Date | string;
    departureTime: string;
    seatNumbers: string;
    fare: number;
    monto_boleto: number;
    monto_devolucion: number;
    confirmedAt: Date | string;
    id_User: number;
    id_pasajero?: number;
    id_empresa?: number; // NUEVO CAMPO
}

/**
 * Interfaz para la actualización de tickets.
 */
export interface ITicketUpdate {
    ticketNumber?: string;
    pnrNumber?: string;
    ticketStatus?: TicketStatus;
    origin?: string;
    destination?: string;
    terminal_origen?: string;
    terminal_destino?: string;
    travelDate?: Date | string;
    departureTime?: string;
    seatNumbers?: string;
    fare?: number;
    monto_boleto?: number;
    monto_devolucion?: number;
    confirmedAt?: Date | string;
    id_User?: number;
    id_pasajero?: number;
    id_empresa?: number; // NUEVO CAMPO
}