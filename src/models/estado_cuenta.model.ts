// src/models/estado_cuenta.model.ts

import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { Empresa } from "./empresa.model";

export interface IEstadoCuenta {
  id?: number;
  empresa_id: number;
  periodo: string;
  fecha_generacion: Date;
  fecha_inicio?: string; // VARCHAR(19) en la base de datos
  fecha_fin?: string; // VARCHAR(19) en la base de datos
  fecha_facturacion?: Date;
  fecha_vencimiento?: Date;
  total_tickets: number;
  total_tickets_anulados: number;
  monto_facturado: number;
  detalle_por_cc: string; // JSON con detalle por centro de costo
  pagado: boolean;
  fecha_pago?: Date;
  suma_devoluciones?: number;
}

@Table({ tableName: "estados_cuenta", timestamps: false })
export class EstadoCuenta extends Model<IEstadoCuenta> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => Empresa)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare empresa_id: number;

  @Column({ type: DataType.STRING(7), allowNull: false })
  declare periodo: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare fecha_generacion: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare fecha_vencimiento: Date;

  @Column({ type: DataType.STRING(19), allowNull: true })
  declare fecha_inicio?: string;

  @Column({ type: DataType.DATE, allowNull: true })
  declare fecha_facturacion: Date;

  @Column({ type: DataType.STRING(19), allowNull: true })
  declare fecha_fin?: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare total_tickets: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare total_tickets_anulados: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  declare monto_facturado: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  declare suma_devoluciones: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare detalle_por_cc: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare pagado: boolean;

  @Column({ type: DataType.DATE, allowNull: true })
  declare fecha_pago?: Date;

  @BelongsTo(() => Empresa)
  declare empresa: Empresa;
}
