import * as dotenv from "dotenv";
dotenv.config();

// Configuración para la Base de Datos de Producción
process.env.DB_HOST = "reserva-corporativa.c6xou04wqeof.us-east-1.rds.amazonaws.com";
process.env.DB_PORT = "3306";
process.env.DB_USER = "admin";
process.env.DB_PASSWORD = "BIWEHB?NtOi6GPo.WaKD-Uvy[I9F";
process.env.DB_NAME = "multiempresa_db";

import { connectDB } from "../database";
import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";

async function restoreProductionMontos() {
  await connectDB();

  console.log("🔍 Obteniendo todas las empresas de la base de datos de PRODUCCIÓN...");
  const empresas = await Empresa.findAll();
  console.log(`📋 Se encontraron ${empresas.length} empresas.`);

  let actualizados = 0;

  for (const empresa of empresas) {
    const empresaId = Number(empresa.id);
    const nombreEmpresa = empresa.nombre || `#${empresaId}`;

    // Obtener todos los tickets de esta empresa que están en estado Confirmed
    const confirmedTickets = await Ticket.findAll({
      where: {
        id_empresa: empresaId,
        ticketStatus: "Confirmed"
      }
    });

    // El monto acumulado real es la suma de los montos de boleto de los tickets confirmados
    const calculatedMontoAcumulado = confirmedTickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);

    const montoAnterior = empresa.monto_acumulado || 0;

    // Actualizar solo el campo monto_acumulado en la tabla empresas
    await empresa.update({ monto_acumulado: calculatedMontoAcumulado });

    if (calculatedMontoAcumulado > 0 || montoAnterior > 0) {
      console.log(`✅ [Empresa ID ${empresaId}] ${nombreEmpresa}: monto_acumulado actualizado $${montoAnterior.toLocaleString("es-CL")} → $${calculatedMontoAcumulado.toLocaleString("es-CL")} | Tickets activos: ${confirmedTickets.length}`);
    }
    actualizados++;
  }

  console.log(`\n==================================================`);
  console.log(`🏁 RESTAURACIÓN DE MONTOS EN PRODUCCIÓN COMPLETADA`);
  console.log(`📊 Empresas procesadas: ${actualizados}`);
  console.log(`⚠️ Cuentas corrientes y EDPs NO fueron modificadas.`);
  console.log(`==================================================\n`);
}

restoreProductionMontos().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
