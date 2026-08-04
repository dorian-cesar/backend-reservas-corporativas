import * as dotenv from "dotenv";
dotenv.config();

// Configuración predeterminada para la Base de Datos de Producción
process.env.DB_HOST = "reserva-corporativa.c6xou04wqeof.us-east-1.rds.amazonaws.com";
process.env.DB_PORT = "3306";
process.env.DB_USER = "admin";
process.env.DB_PASSWORD = "BIWEHB?NtOi6GPo.WaKD-Uvy[I9F";
process.env.DB_NAME = "multiempresa_db";

import { connectDB, sequelize } from "../database";
import { Empresa } from "../models/empresa.model";
import { QueryTypes } from "sequelize";

export const verificarReinicializacion = async () => {
  await connectDB();

  console.log(`\n🔍 Verificando saldo y monto acumulado de empresas en BD...`);

  // Consulta optimizada para encontrar cualquier empresa cuyo último saldo NO sea 0
  const saldosDistintosDeCero: any[] = await sequelize.query(
    `
    SELECT c.empresa_id, c.saldo, e.nombre
    FROM cuenta_corriente c
    INNER JOIN (
      SELECT empresa_id, MAX(id) as max_id
      FROM cuenta_corriente
      GROUP BY empresa_id
    ) latest ON c.empresa_id = latest.empresa_id AND c.id = latest.max_id
    LEFT JOIN empresas e ON e.id = c.empresa_id
    WHERE ABS(c.saldo) > 0.01;
    `,
    { type: QueryTypes.SELECT }
  );

  // Consulta para verificar si existen empresas con monto_acumulado != 0
  const empresasConMontoAcumuladoDistintoDeCero: any[] = await sequelize.query(
    `
    SELECT id, nombre, monto_acumulado
    FROM empresas
    WHERE ABS(COALESCE(monto_acumulado, 0)) > 0.01;
    `,
    { type: QueryTypes.SELECT }
  );

  const totalEmpresasConCuenta: any[] = await sequelize.query(
    `SELECT COUNT(DISTINCT empresa_id) as total FROM cuenta_corriente;`,
    { type: QueryTypes.SELECT }
  );

  const totalEmpresas = await Empresa.count();

  console.log(`\n==================================================`);
  console.log(`RESULTADO DE LA VERIFICACIÓN DE SALDOS Y MONTO ACUMULADO:`);
  console.log(`- Total empresas en BD: ${totalEmpresas}`);
  console.log(`- Empresas con movimientos registrados: ${totalEmpresasConCuenta[0]?.total || 0}`);
  console.log(`- Empresas con saldo pendiente en CC distinto de $0: ${saldosDistintosDeCero.length}`);
  console.log(`- Empresas con monto_acumulado distinto de $0: ${empresasConMontoAcumuladoDistintoDeCero.length}`);
  console.log(`==================================================\n`);

  if (saldosDistintosDeCero.length === 0 && empresasConMontoAcumuladoDistintoDeCero.length === 0) {
    console.log(`🎉 ¡CONFIRMADO! El 100% de las empresas tienen SALDO CC = $0 y MONTO ACUMULADO = $0.`);
  } else {
    if (saldosDistintosDeCero.length > 0) {
      console.log(`⚠️ Se encontraron las siguientes empresas con saldo CC distinto de $0:`);
      saldosDistintosDeCero.forEach((row) => {
        console.log(`   • Empresa ID ${row.empresa_id} (${row.nombre}): Saldo CC $${row.saldo}`);
      });
    }
    if (empresasConMontoAcumuladoDistintoDeCero.length > 0) {
      console.log(`⚠️ Se encontraron las siguientes empresas con monto_acumulado distinto de $0:`);
      empresasConMontoAcumuladoDistintoDeCero.forEach((row) => {
        console.log(`   • Empresa ID ${row.id} (${row.nombre}): Monto Acumulado $${row.monto_acumulado}`);
      });
    }
  }
};

verificarReinicializacion()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error al verificar:", err);
    process.exit(1);
  });
