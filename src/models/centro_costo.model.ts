import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Empresa } from './empresa.model';

@Table({ tableName: 'centros_costo', timestamps: false })
export class CentroCosto extends Model {
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    declare id: number;

    @Column({ type: DataType.STRING(150), allowNull: false })
    nombre!: string;

    @ForeignKey(() => Empresa)
    @Column({ type: DataType.INTEGER, allowNull: false })
    empresa_id!: number;

    @Column({ type: DataType.BOOLEAN, defaultValue: true })
    estado!: boolean;

    @Column({ type: DataType.DATE, allowNull: true })
    created_at?: Date;

    @Column({ type: DataType.DATE, allowNull: true })
    updated_at?: Date;

    @BelongsTo(() => Empresa)
    empresa!: Empresa;
}
