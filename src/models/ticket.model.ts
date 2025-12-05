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
import { Pasajero } from './pasajero.model';

/**
 * Estado posible del ticket.
 */
export type TicketStatus = 'Confirmed' | 'Anulado';


export interface ITicket extends ITicketBase {
    // Relaciones que Sequelize agregará
    user?: User;
    pasajero?: Pasajero;
}
/**
 * Interfaz para el modelo Ticket.
 */
export interface ITicketBase {
    id?: number;
    ticketNumber: string;
    pnrNumber?: string;
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
    id_pasajero?: number;
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

    @Column({ type: DataType.STRING(50), allowNull: true })
    pnrNumber?: string;

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

    @ForeignKey(() => Pasajero)
    @Column({
        type: DataType.INTEGER,
        allowNull: true, // Permite NULL para compatibilidad con tickets existentes
        field: 'id_pasajero'
    })
    id_pasajero?: number;

    @BelongsTo(() => User)
    user?: User;

    @BelongsTo(() => Pasajero, {
        foreignKey: 'id_pasajero',
        targetKey: 'id'
    })
    pasajero?: Pasajero;

    @CreatedAt
    @Column({ type: DataType.DATE, allowNull: true })
    created_at?: Date;

    @UpdatedAt
    @Column({ type: DataType.DATE, allowNull: true })
    updated_at?: Date;
}
