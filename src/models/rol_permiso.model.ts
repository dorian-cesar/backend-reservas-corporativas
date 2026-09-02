import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
} from "sequelize-typescript";

export interface IRolPermiso {
  id?: number;
  modulo: string;
  accion: string;
  clave: string;
  subusuario: boolean;
  empresa: boolean;
  admin: boolean;
  auditoria: boolean;
  contralor: boolean;
  admincc: boolean;
  superuser: boolean;
  soporte: boolean;
  created_at?: Date;
  updated_at?: Date;
}

@Table({
  tableName: "roles_permisos",
  timestamps: true,
  underscored: true,
  indexes: [
    { name: "idx_modulo", fields: ["modulo"] },
    { name: "idx_clave", fields: ["clave"], unique: true },
  ],
})
export class RolPermiso extends Model<IRolPermiso> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  declare id: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  declare modulo: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
  })
  declare accion: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
    unique: true,
  })
  declare clave: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare subusuario: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare empresa: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare admin: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare auditoria: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare contralor: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare admincc: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  declare superuser: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  declare soporte: boolean;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
    field: "created_at",
  })
  declare created_at?: Date;

  @UpdatedAt
  @Column({
    type: DataType.DATE,
    defaultValue: DataType.NOW,
    field: "updated_at",
  })
  declare updated_at?: Date;
}
