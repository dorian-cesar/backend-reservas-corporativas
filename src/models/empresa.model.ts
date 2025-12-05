// src/models/empresa.model.ts

import { Table, Column, Model, DataType, HasMany } from 'sequelize-typescript';
import { CentroCosto } from './centro_costo.model';
import { CuentaCorriente } from './cuenta_corriente.model';
import { Pasajero } from './pasajero.model';

/**
 * Interfaz para el modelo Empresa.
 */
export interface IEmpresa {
    id?: number;
    rut?: string;
    nombre: string;
    cuenta_corriente?: string;
    estado?: boolean;
    recargo?: number;
    porcentaje_devolucion?: number;
    dia_facturacion?: number;
    dia_vencimiento?: number;
    monto_maximo?: number;
    monto_acumulado?: number;
}

@Table({ tableName: 'empresas', timestamps: false })
export class Empresa extends Model<IEmpresa> {
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    declare id: number;

    @Column({ type: DataType.STRING(20), allowNull: true })
    rut?: string;

    @Column({ type: DataType.STRING(150), allowNull: false })
    nombre!: string;

    @Column({ type: DataType.STRING(20), allowNull: true })
    cuenta_corriente?: string;

    @Column({ type: DataType.BOOLEAN, defaultValue: true })
    estado!: boolean;

    @Column({ type: DataType.INTEGER, defaultValue: 0 })
    recargo!: number;

    @Column({ type: DataType.DECIMAL(5, 2), defaultValue: 0.00 })
    porcentaje_devolucion!: number;

    @Column({ type: DataType.INTEGER, allowNull: true })
    dia_facturacion?: number;

    @Column({ type: DataType.INTEGER, allowNull: true })
    dia_vencimiento?: number;

    @Column({ type: DataType.INTEGER, allowNull: true })
    monto_maximo?: number;

    @Column({ type: DataType.INTEGER, allowNull: true })
    monto_acumulado?: number;

    @HasMany(() => CentroCosto)
    centrosCosto!: CentroCosto[];

    @HasMany(() => CuentaCorriente)
    cuentasCorriente!: CuentaCorriente[];

    @HasMany(() => Pasajero, { foreignKey: 'id_empresa' })
    pasajeros!: Pasajero[];
}
