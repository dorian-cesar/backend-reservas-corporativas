import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
} from "sequelize-typescript";
import { Empresa } from "./empresa.model";
import { User } from "./user.model";

export type TipoGestionCobranza =
  | "Llamada Telefónica"
  | "Envío de Email"
  | "Reunión Presencial"
  | "Videollamada / Meet"
  | "WhatsApp / Mensajería"
  | "Compromiso de Pago"
  | "Envío de Carta Notificación"
  | "Visita a Terreno"
  | "Otro";

export type EstadoGestionCobranza =
  | "Contactado"
  | "No Contesta"
  | "Compromiso de Pago"
  | "Pagado / Comprobante"
  | "En Seguimiento"
  | "Rechaza Pago / Disputa"
  | "Datos Incorrectos"
  | "Finalizado";

export interface ICobranzaGestion {
  id?: number;
  empresa_id: number;
  user_id: number;
  tipo_gestion: string;
  estado_gestion: string;
  contacto_nombre?: string | null;
  contacto_telefono?: string | null;
  contacto_email?: string | null;
  monto_compromiso?: number | null;
  fecha_compromiso?: Date | string | null;
  observaciones?: string | null;
  proxima_accion?: string | null;
  fecha_proxima_accion?: Date | string | null;
  fecha_gestion?: Date | string;
  created_at?: Date;
  updated_at?: Date;
  empresa?: Empresa;
  user?: User;
}

@Table({
  tableName: "cobranza_gestiones",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
})
export class CobranzaGestion extends Model<ICobranzaGestion> {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => Empresa)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare empresa_id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare user_id: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    defaultValue: "Llamada Telefónica",
  })
  declare tipo_gestion: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    defaultValue: "Contactado",
  })
  declare estado_gestion: string;

  @Column({ type: DataType.STRING(150), allowNull: true })
  declare contacto_nombre?: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare contacto_telefono?: string | null;

  @Column({ type: DataType.STRING(150), allowNull: true })
  declare contacto_email?: string | null;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: true,
    defaultValue: null,
  })
  declare monto_compromiso?: number | null;

  @Column({ type: DataType.DATEONLY, allowNull: true, defaultValue: null })
  declare fecha_compromiso?: Date | string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare observaciones?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare proxima_accion?: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true, defaultValue: null })
  declare fecha_proxima_accion?: Date | string | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare fecha_gestion: Date;

  @BelongsTo(() => Empresa, "empresa_id")
  declare empresa: Empresa;

  @BelongsTo(() => User, "user_id")
  declare user: User;
}
