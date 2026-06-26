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
    Ticket,
    EstadoCuenta,
    Pasajero,
    UserEmpresa,
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
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exit(1);
  }
};
