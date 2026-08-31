import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { CuentaCorriente } from "./cuenta_corriente.model";
import { User } from "./user.model";

export type TipoDocumentoAdjunto =
  | "HES"
  | "Nota de Compra"
  | "Nota de Reserva"
  | "Comprobante de Pago"
  | "Factura"
  | "Otro";

export interface ICuentaCorrienteAdjunto {
  id?: number;
  cuenta_corriente_id: number;
  tipo_documento: string;
  nombre_original: string;
  s3_key: string;
  s3_url: string;
  mime_type?: string;
  tamano_bytes?: number;
  fecha_subida?: Date;
  usuario_id?: number;
}

@Table({ tableName: "cuenta_corriente_adjuntos", timestamps: false })
export class CuentaCorrienteAdjunto extends Model<ICuentaCorrienteAdjunto> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => CuentaCorriente)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare cuenta_corriente_id: number;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare tipo_documento: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare nombre_original: string;

  @Column({ type: DataType.STRING(500), allowNull: false })
  declare s3_key: string;

  @Column({ type: DataType.STRING(1000), allowNull: false })
  declare s3_url: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare mime_type?: string;

  @Column({ type: DataType.BIGINT, allowNull: true })
  declare tamano_bytes?: number;

  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  declare fecha_subida: Date;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare usuario_id?: number;

  @BelongsTo(() => CuentaCorriente, { onDelete: "CASCADE" })
  declare cuenta_corriente: CuentaCorriente;

  @BelongsTo(() => User, { onDelete: "SET NULL" })
  declare usuario?: User;
}
