import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    BelongsTo,
    CreatedAt,
} from "sequelize-typescript";
import { User } from "./user.model";
import { Empresa } from "./empresa.model";

/**
 * Interfaz para el modelo UserEmpresa.
 */
export interface IUserEmpresa {
    id?: number;
    user_id: number;
    empresa_id: number;
    created_at?: Date;
}

@Table({
    tableName: "user_empresas",
    timestamps: false,
    indexes: [
        {
            name: "idx_user_id",
            fields: ["user_id"],
        },
        {
            name: "idx_empresa_id",
            fields: ["empresa_id"],
        },
        {
            name: "uq_user_empresa",
            fields: ["user_id", "empresa_id"],
            unique: true,
        },
    ],
})
export class UserEmpresa extends Model<IUserEmpresa> {
    @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
    declare id: number;

    @ForeignKey(() => User)
    @Column({ type: DataType.INTEGER, allowNull: false })
    declare user_id: number;

    @ForeignKey(() => Empresa)
    @Column({ type: DataType.INTEGER, allowNull: false })
    declare empresa_id: number;

    @CreatedAt
    @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
    declare created_at?: Date;

    @BelongsTo(() => User)
    declare user: User;

    @BelongsTo(() => Empresa)
    declare empresa: Empresa;
}