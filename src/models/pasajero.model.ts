import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Empresa } from './empresa.model';
import { CentroCosto } from './centro_costo.model';
import { Ticket } from './ticket.model';

/**
 * Interfaz para el modelo Pasajero.
 */
export interface IPasajero {
    id?: number;
    nombre: string;
    rut: string;
    correo: string;
    id_empresa: number;
    id_centro_costo?: number;
}

@Table({
    tableName: 'pasajeros',
    timestamps: false
})
export class Pasajero extends Model<IPasajero> {
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    declare id: number;

    @Column({ type: DataType.STRING(255), allowNull: false })
    nombre!: string;

    @Column({ type: DataType.STRING(20), allowNull: false, unique: true })
    rut!: string;

    @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
    correo!: string;

    @ForeignKey(() => Empresa)
    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        field: 'id_empresa'
    })
    id_empresa!: number;

    @ForeignKey(() => CentroCosto)
    @Column({
        type: DataType.INTEGER,
        allowNull: true, // Permite NULL
        field: 'id_centro_costo'
    })
    id_centro_costo?: number;

    @BelongsTo(() => Empresa, {
        foreignKey: 'id_empresa',
        targetKey: 'id'
    })
    empresa!: Empresa;

    @BelongsTo(() => CentroCosto, {  // ¡FALTA ESTA RELACIÓN!
        foreignKey: 'id_centro_costo',
        targetKey: 'id'
    })
    centroCosto?: CentroCosto;

    @HasMany(() => Ticket, { foreignKey: 'id_pasajero' })
    tickets!: Ticket[];
}