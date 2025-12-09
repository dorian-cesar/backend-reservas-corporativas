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
import { CentroCosto } from "./centro_costo.model";
import { Ticket } from "./ticket.model";

/**
 * Interfaz para el modelo Pasajero.
 */
export interface IPasajero {
  id?: number;
  nombre: string;
  rut: string;
  correo: string;
  telefono?: string;
  id_empresa: number;
  id_centro_costo?: number;
}

@Table({
  tableName: "pasajeros",
  timestamps: false,
})
export class Pasajero extends Model<IPasajero> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare nombre: string;

  @Column({ type: DataType.STRING(20), allowNull: false, unique: true })
  declare rut: string;

  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  declare correo: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare telefono?: string;

  @ForeignKey(() => Empresa)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    field: "id_empresa",
  })
  declare id_empresa: number;

  @ForeignKey(() => CentroCosto)
  @Column({
    type: DataType.INTEGER,
    allowNull: true, // Permite NULL
    field: "id_centro_costo",
  })
  declare id_centro_costo?: number;

  @BelongsTo(() => Empresa, {
    foreignKey: "id_empresa",
    targetKey: "id",
  })
  declare empresa: Empresa;

  @BelongsTo(() => CentroCosto, {
    // ¡FALTA ESTA RELACIÓN!
    foreignKey: "id_centro_costo",
    targetKey: "id",
  })
  declare centroCosto?: CentroCosto;

  @HasMany(() => Ticket, { foreignKey: "id_pasajero" })
  declare tickets: Ticket[];
}
