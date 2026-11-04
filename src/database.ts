// src/database.ts

process.env.TZ = "America/Santiago";

import { Sequelize } from "sequelize-typescript";
import "./models/associations";
import { EstadoCuenta } from "./models/estado_cuenta.model";

import { Empresa } from "./models/empresa.model";
import { EmpresaTramo } from "./models/empresa_tramos.model";
import { CentroCosto } from "./models/centro_costo.model";
import { User } from "./models/user.model";
import { CuentaCorriente } from "./models/cuenta_corriente.model";
import { Ticket } from "./models/ticket.model";
import * as dotenv from "dotenv";
import { Pasajero } from "./models/pasajero.model";
import { UserEmpresa } from "./models/user_empresa.model";
import { Reclamo } from "./models/reclamo.model";
import { EdpTicketSnapshot } from "./models/edp_ticket_snapshot.model";
import { CuentaCorrienteAdjunto } from "./models/cuenta_corriente_adjunto.model";
import { CobranzaGestion } from "./models/cobranza_gestion.model";
import { RolPermiso } from "./models/rol_permiso.model";

dotenv.config();

export const sequelize = new Sequelize({
  dialect: "mysql",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "multiempresa_db",
  models: [
    Empresa,
    EmpresaTramo,
    CentroCosto,
    User,
    CuentaCorriente,
    CuentaCorrienteAdjunto,
    Ticket,
    EstadoCuenta,
    Pasajero,
    UserEmpresa,
    Reclamo,
    EdpTicketSnapshot,
    CobranzaGestion,
    RolPermiso,
  ],
  logging: false,
  timezone: (() => {
    const offsetMinutes = -new Date().getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absOffset = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
    const minutes = String(absOffset % 60).padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
  })(),
});

// Guard de seguridad contra borrado accidental de tablas
const isLocal = (host: string) => {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
};

const dbHost = process.env.DB_HOST || "localhost";
if (!isLocal(dbHost)) {
  const originalSync = sequelize.sync.bind(sequelize);
  sequelize.sync = async (options?: any) => {
    if (options && options.force === true) {
      throw new Error(
        "🚨 BARRERA DE SEGURIDAD: Se ha bloqueado 'sync({ force: true })' porque estás conectado a una base de datos remota (" +
          dbHost +
          "). Esto previene la pérdida total de datos.",
      );
    }
    return originalSync(options);
  };
}

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection established successfully.");

    // Verificar/crear la columna 'owner' en la tabla 'empresas' sin alterar ni borrar registros existentes
    const [columns]: any = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'empresas' 
        AND COLUMN_NAME = 'owner';
    `);
    if (columns.length === 0) {
      console.log("➕ Agregando columna 'owner' a la tabla 'empresas'...");
      await sequelize.query(`
        ALTER TABLE empresas 
        ADD COLUMN owner ENUM('Pullman', 'Wit') NOT NULL DEFAULT 'Pullman';
      `);
      console.log("✅ Columna 'owner' agregada exitosamente a la base de datos.");
    }

    // Verificar/crear la columna 'owner' en la tabla 'users' sin alterar ni borrar registros existentes
    const [userColumns]: any = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'owner';
    `);
    if (userColumns.length === 0) {
      console.log("➕ Agregando columna 'owner' a la tabla 'users'...");
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN owner ENUM('Pullman', 'Wit') NOT NULL DEFAULT 'Pullman';
      `);
      console.log("✅ Columna 'owner' agregada exitosamente a la tabla 'users'.");
    }

    // Verificar/crear columnas de tracking de emails en 'estados_cuenta'
    const [edpColumns]: any = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'estados_cuenta' 
        AND COLUMN_NAME IN ('email_estado', 'email_fecha_envio', 'email_destinatarios', 'email_motivo');
    `);
    const existingCols = edpColumns.map((c: any) => c.COLUMN_NAME);

    if (!existingCols.includes("email_estado")) {
      console.log("➕ Agregando columna 'email_estado' a la tabla 'estados_cuenta'...");
      await sequelize.query(`
        ALTER TABLE estados_cuenta 
        ADD COLUMN email_estado ENUM('pendiente', 'enviado', 'omitido', 'fallido') NOT NULL DEFAULT 'pendiente';
      `);
    }
    if (!existingCols.includes("email_fecha_envio")) {
      console.log("➕ Agregando columna 'email_fecha_envio' a la tabla 'estados_cuenta'...");
      await sequelize.query(`
        ALTER TABLE estados_cuenta 
        ADD COLUMN email_fecha_envio DATETIME NULL;
      `);
    }
    if (!existingCols.includes("email_destinatarios")) {
      console.log("➕ Agregando columna 'email_destinatarios' a la tabla 'estados_cuenta'...");
      await sequelize.query(`
        ALTER TABLE estados_cuenta 
        ADD COLUMN email_destinatarios TEXT NULL;
      `);
    }
    if (!existingCols.includes("email_motivo")) {
      console.log("➕ Agregando columna 'email_motivo' a la tabla 'estados_cuenta'...");
      await sequelize.query(`
        ALTER TABLE estados_cuenta 
        ADD COLUMN email_motivo VARCHAR(255) NULL;
      `);
    }
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exit(1);
  }
};
