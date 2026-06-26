// src/models/empresa_tramos.model.ts

import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { Empresa } from "./empresa.model";

export interface IEmpresaTramo {
  id?: number;
  id_empresa: number;
  monto_desde: number;
  monto_hasta?: number | null;
  porcentaje_descuento: number;
}

@Table({ tableName: "empresa_tramos", timestamps: false })
export class EmpresaTramo extends Model<IEmpresaTramo> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => Empresa)
  @Column({ type: DataType.INTEGER, allowNull: false, field: "id_empresa" })
  declare id_empresa: number;

  @Column({ type: DataType.INTEGER, allowNull: false, field: "monto_desde" })
  declare monto_desde: number;

  @Column({ type: DataType.INTEGER, allowNull: true, field: "monto_hasta" })
  declare monto_hasta?: number | null;

  @Column({
    type: DataType.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.0,
    field: "porcentaje_descuento",
    get() {
      const val = this.getDataValue("porcentaje_descuento");
      return val === null || val === undefined ? 0 : Number(val);
    }
  })
  declare porcentaje_descuento: number;

  @BelongsTo(() => Empresa, { foreignKey: "id_empresa", onDelete: "CASCADE" })
  declare empresa: Empresa;
}
