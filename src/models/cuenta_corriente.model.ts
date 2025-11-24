import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Empresa } from './empresa.model';

export type TipoMovimiento = 'abono' | 'cargo';

export interface ICuentaCorriente {
    id?: number;
    empresa_id: number;
    fecha_movimiento?: Date;
    tipo_movimiento: TipoMovimiento;
    monto: number;
    descripcion?: string;
    saldo: number;
    referencia?: string;
}

@Table({ tableName: 'cuenta_corriente', timestamps: false })
export class CuentaCorriente extends Model<ICuentaCorriente> {
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    declare id: number;

    @ForeignKey(() => Empresa)
    @Column({ type: DataType.INTEGER, allowNull: false })
    empresa_id!: number;

    @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
    fecha_movimiento!: Date;

    @Column({ type: DataType.ENUM('abono', 'cargo'), allowNull: false })
    tipo_movimiento!: TipoMovimiento;

    @Column({ type: DataType.DECIMAL(12,2), allowNull: false })
    monto!: number;

    @Column({ type: DataType.STRING(255), allowNull: true })
    descripcion?: string;

    @Column({ type: DataType.DECIMAL(12,2), allowNull: false })
    saldo!: number;

    @Column({ type: DataType.STRING(100), allowNull: true })
    referencia?: string;

    @BelongsTo(() => Empresa)
    empresa!: Empresa;
}
