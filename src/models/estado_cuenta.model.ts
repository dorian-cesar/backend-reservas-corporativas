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
  fecha_inicio?: string;
  fecha_fin?: string;
  total_tickets: number;
  total_tickets_anulados: number;
  monto_facturado: number;
  detalle_por_cc: string;
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
  empresa_id!: number;

  @Column({ type: DataType.STRING(7), allowNull: false })
  periodo!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  fecha_generacion!: Date;

  @Column({ type: DataType.STRING(19) })
  fecha_inicio?: string;

  @Column({ type: DataType.STRING(19) })
  fecha_fin?: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  total_tickets!: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  total_tickets_anulados!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  monto_facturado!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  suma_devoluciones!: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  detalle_por_cc!: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  pagado!: boolean;

  @Column({ type: DataType.DATE })
  fecha_pago?: Date;

  @BelongsTo(() => Empresa)
  empresa!: Empresa;
}
