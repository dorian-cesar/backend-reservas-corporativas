import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import { Empresa } from "./empresa.model";
import { Pasajero } from "./pasajero.model";

@Table({ tableName: "centros_costo", timestamps: false })
export class CentroCosto extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(150), allowNull: false })
  declare nombre: string;

  @ForeignKey(() => Empresa)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare empresa_id: number;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  declare estado: boolean;

  @Column({ type: DataType.DATE, allowNull: true, defaultValue: DataType.NOW })
  declare created_at?: Date;

  @Column({ type: DataType.DATE, allowNull: true, defaultValue: DataType.NOW })
  declare updated_at?: Date;

  @BelongsTo(() => Empresa)
  declare empresa: Empresa;

  @HasMany(() => Pasajero, { foreignKey: "id_centro_costo" })
  declare pasajeros: Pasajero[];
}
