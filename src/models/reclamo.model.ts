import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
} from "sequelize-typescript";
import { Ticket } from "./ticket.model";
import { User } from "./user.model";

export interface IReclamo {
  id?: number;
  ticket_id: number;
  user_id?: number | null;
  motivo: string;
  descripcion: string;
  estado?: string;
  motivo_rechazo?: string;
  fecha_creacion?: Date;
  fecha_resolucion?: Date;
  user?: User;
}

@Table({ tableName: "reclamos", timestamps: false })
export class Reclamo extends Model<IReclamo> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => Ticket)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare ticket_id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare user_id?: number | null;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare motivo: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare descripcion: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "Pendiente",
  })
  declare estado: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare motivo_rechazo?: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare fecha_creacion: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare fecha_resolucion?: Date;

  @BelongsTo(() => Ticket)
  declare ticket: Ticket;

  @BelongsTo(() => User, "user_id")
  declare user?: User;
}
