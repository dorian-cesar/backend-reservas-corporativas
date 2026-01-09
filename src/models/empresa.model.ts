// src/models/empresa.model.ts

import { Table, Column, Model, DataType, HasMany } from "sequelize-typescript";
import { CentroCosto } from "./centro_costo.model";
import { CuentaCorriente } from "./cuenta_corriente.model";
import { Pasajero } from "./pasajero.model";

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
  newLogin?: boolean;
}

@Table({ tableName: "empresas", timestamps: false })
export class Empresa extends Model<IEmpresa> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare rut?: string;

  @Column({ type: DataType.STRING(150), allowNull: false })
  declare nombre: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare cuenta_corriente?: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  declare estado: boolean;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  declare recargo: number;

  @Column({ type: DataType.DECIMAL(5, 2), defaultValue: 0.0 })
  declare porcentaje_devolucion: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare dia_facturacion?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare dia_vencimiento?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare monto_maximo?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare monto_acumulado?: number;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare newLogin?: boolean;

  @HasMany(() => CentroCosto)
  declare centrosCosto: CentroCosto[];

  @HasMany(() => CuentaCorriente)
  declare cuentasCorriente: CuentaCorriente[];

  @HasMany(() => Pasajero, { foreignKey: "id_empresa" })
  declare pasajeros: Pasajero[];
}