// src/models/edp_ticket_snapshot.model.ts

import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { EstadoCuenta } from "./estado_cuenta.model";

export interface IEdpTicketSnapshot {
  id?: number;
  edp_id: number;
  ticket_data: string; // JSON serializado del ticket completo (con relaciones)
}

@Table({ tableName: "edp_ticket_snapshots", timestamps: false })
export class EdpTicketSnapshot extends Model<IEdpTicketSnapshot> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => EstadoCuenta)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare edp_id: number;

  @Column({ type: DataType.TEXT("long"), allowNull: false })
  declare ticket_data: string;

  @BelongsTo(() => EstadoCuenta)
  declare estadoCuenta: EstadoCuenta;
}
