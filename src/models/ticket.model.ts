// src/models/ticket.model.ts

import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    BelongsTo,
    CreatedAt,
    UpdatedAt,
} from 'sequelize-typescript';
import { User } from './user.model';

/**
 * Estado posible del ticket.
 */
export type TicketStatus = 'Confirmed' | 'Anulado';

/**
 * Interfaz para el modelo Ticket.
 */
export interface ITicket {
    id?: number;
    ticketNumber: string;
    ticketStatus: TicketStatus;
    origin: string;
    destination: string;
    travelDate: Date;
    departureTime: string;
    seatNumbers: string;
    fare: number;
    monto_boleto: number;
    monto_devolucion: number;
    confirmedAt: Date;
    id_User: number;
    nombre_pasajero: string;
    rut_pasajero?: string;
    email_pasajero?: string;
    created_at?: Date;
    updated_at?: Date;
}

@Table({
    tableName: 'tickets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
})
export class Ticket extends Model<ITicket> {
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    declare id: number;

    @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
    ticketNumber!: string;

    @Column({ type: DataType.ENUM('Confirmed', 'Anulado'), allowNull: false })
    ticketStatus!: TicketStatus;

    @Column({ type: DataType.STRING(100), allowNull: false })
    origin!: string;

    @Column({ type: DataType.STRING(100), allowNull: false })
    destination!: string;

    @Column({ type: DataType.DATEONLY, allowNull: false })
    travelDate!: Date;

    @Column({ type: DataType.STRING(20), allowNull: false })
    departureTime!: string;

    @Column({ type: DataType.STRING(20), allowNull: false })
    seatNumbers!: string;

    @Column({ type: DataType.INTEGER, allowNull: false })
    fare!: number;

    @Column({ type: DataType.INTEGER, allowNull: false })
    monto_boleto!: number;

    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    monto_devolucion!: number;

    @Column({ type: DataType.DATE, allowNull: false })
    confirmedAt!: Date;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    id_User!: number;

    @Column({ type: DataType.STRING(150), allowNull: false })
    nombre_pasajero!: string;

    @Column({ type: DataType.STRING(50), allowNull: true })
    rut_pasajero?: string;

    @Column({ type: DataType.STRING(150), allowNull: true })
    email_pasajero?: string;

    @BelongsTo(() => User)
    user?: User;

    @CreatedAt
    @Column({ type: DataType.DATE, allowNull: true })
    created_at?: Date;

    @UpdatedAt
    @Column({ type: DataType.DATE, allowNull: true })
    updated_at?: Date;
}
