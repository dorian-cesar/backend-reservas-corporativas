// src/models/empresa.model.ts

import { Table, Column, Model, DataType, HasMany } from "sequelize-typescript";
import { CentroCosto } from "./centro_costo.model";
import { CuentaCorriente } from "./cuenta_corriente.model";
import { Pasajero } from "./pasajero.model";
import { EmpresaTramo } from "./empresa_tramos.model";

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
  fact_manual?: boolean;
  tipo_facturacion?: "Masiva" | "Especial";
  contacto_fact_nombre?: string;
  contacto_fact_email?: string;
  contacto_fact_telefono?: string;
  ejecutivo_com_nombre?: string;
  ejecutivo_com_email?: string;
  ejecutivo_com_telefono?: string;
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

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    field: 'fact_manual'
  })
  declare fact_manual?: boolean;

  @Column({
    type: DataType.ENUM("Masiva", "Especial"),
    allowNull: false,
    defaultValue: "Masiva",
    field: "tipo_facturacion"
  })
  declare tipo_facturacion: "Masiva" | "Especial";

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
    defaultValue: "",
    field: "contacto_fact_nombre"
  })
  declare contacto_fact_nombre: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
    defaultValue: "",
    field: "contacto_fact_email"
  })
  declare contacto_fact_email: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "",
    field: "contacto_fact_telefono"
  })
  declare contacto_fact_telefono: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
    defaultValue: "",
    field: "ejecutivo_com_nombre"
  })
  declare ejecutivo_com_nombre: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
    defaultValue: "",
    field: "ejecutivo_com_email"
  })
  declare ejecutivo_com_email: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "",
    field: "ejecutivo_com_telefono"
  })
  declare ejecutivo_com_telefono: string;

  @HasMany(() => CentroCosto)
  declare centrosCosto: CentroCosto[];

  @HasMany(() => CuentaCorriente)
  declare cuentasCorriente: CuentaCorriente[];

  @HasMany(() => Pasajero, { foreignKey: "id_empresa" })
  declare pasajeros: Pasajero[];

  @HasMany(() => EmpresaTramo, { foreignKey: "id_empresa", as: "tramos" })
  declare tramos: EmpresaTramo[];
}