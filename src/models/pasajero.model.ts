import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Empresa } from './empresa.model';

/**
 * Interfaz para el modelo Pasajero.
 */
export interface IPasajero {
    id?: number;
    nombre: string;
    rut: string;
    correo: string;
    id_empresa: number;
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
        field: 'id_empresa' // Especificar el nombre de columna exacto
    })
    id_empresa!: number;

    @BelongsTo(() => Empresa, {
        foreignKey: 'id_empresa',
        targetKey: 'id'
    })
    empresa!: Empresa;
}