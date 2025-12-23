// src/models/user.model.ts
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { Empresa } from "./empresa.model";
import { CentroCosto } from "./centro_costo.model";

export type Rol =
  | "superuser"
  | "admin"
  | "empresa"
  | "subusuario"
  | "auditoria"
  | "contralor";
export interface IUser {
  id?: number;
  nombre: string;
  rut?: string;
  email: string;
  password?: string;
  twoFactorSecret?: string;
  rol?: Rol;
  empresa_id?: number;
  centro_costo_id?: number;
  estado?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

@Table({ tableName: "users", timestamps: false })
export class User extends Model<IUser> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(150), allowNull: false })
  declare nombre: string;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare rut?: string;

  @Column({ type: DataType.STRING(150), allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare password: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare twoFactorSecret?: string;

  @Column({
    type: DataType.ENUM(
      "superuser",
      "admin",
      "empresa",
      "subusuario",
      "auditoria",
      "contralor"
    ),
    defaultValue: "empresa",
  })
  declare rol: Rol;

  @ForeignKey(() => Empresa)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare empresa_id?: number;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  declare estado: boolean;

  @ForeignKey(() => CentroCosto)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare centro_costo_id?: number;

  @Column({ type: DataType.DATE, allowNull: true, defaultValue: DataType.NOW })
  declare created_at?: Date;

  @Column({ type: DataType.DATE, allowNull: true, defaultValue: DataType.NOW })
  declare updated_at?: Date;

  @BelongsTo(() => Empresa)
  declare empresa?: Empresa;

  @BelongsTo(() => CentroCosto)
  declare centroCosto?: CentroCosto;
}