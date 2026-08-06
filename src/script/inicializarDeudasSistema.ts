// src/script/inicializarDeudasSistema.ts

// Configuración de base de datos para Producción (debe ir ANTES de las importaciones)
process.env.DB_HOST = "reserva-corporativa.c6xou04wqeof.us-east-1.rds.amazonaws.com";
process.env.DB_PORT = "3306";
process.env.DB_USER = "admin";
process.env.DB_PASSWORD = "BIWEHB?NtOi6GPo.WaKD-Uvy[I9F";
process.env.DB_NAME = "multiempresa_db";

import { connectDB, sequelize } from "../database";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Empresa } from "../models/empresa.model";
import { obtenerResumenSaldoEmpresa } from "../services/empresaSaldo.service";
import moment from "moment-timezone";

export const inicializarDeudasSistema = async () => {
  await connectDB();

  console.log("=== INICIO DE REINICIALIZACIÓN DE DEUDAS EN CUENTA CORRIENTE (PRODUCCIÓN) ===");

  const fechaHoyStr = moment().tz("America/Santiago").format("YYYY-MM-DD HH:mm");

  // 1. Contar y sumar el monto total de cargos impagos históricos
  const sumResult: any = await CuentaCorriente.findOne({
    where: {
      tipo_movimiento: "cargo",
      pagado: false,
    },
    attributes: [
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      [sequelize.fn("SUM", sequelize.col("monto")), "totalMonto"],
    ],
    raw: true,
  });

  const count = Number(sumResult?.count || 0);
  const totalMonto = Number(sumResult?.totalMonto || 0);

  console.log(`📌 Se encontraron ${count} cargos impagos históricos sumando $${totalMonto.toLocaleString("es-CL")}.`);

  if (count > 0) {
    // 2. Marcar todos los cargos impagos históricos como pagado = true en un solo BATCH UPDATE SQL
    await CuentaCorriente.update(
      {
        pagado: true,
        referencia: sequelize.fn(
          "CONCAT",
          sequelize.fn("COALESCE", sequelize.col("referencia"), ""),
          ` | [REINICIO DEUDAS SISTEMA ${fechaHoyStr}]`
        ),
        descripcion: sequelize.fn(
          "CONCAT",
          sequelize.fn("COALESCE", sequelize.col("descripcion"), ""),
          " (Pagado por reinicio inicial de deudas del sistema)"
        ),
      },
      {
        where: {
          tipo_movimiento: "cargo",
          pagado: false,
        },
      }
    );

    console.log(`✅ ${count} cargos impagos históricos marcados como PAGADOS exitosamente en la BD.`);
  }

  // 3. Re-sincronizar los saldos disponibles de todas las empresas
  console.log("\n🔄 Sincronizando saldos de empresas post-reinicio...");
  const empresas = await Empresa.findAll();
  for (const emp of empresas) {
    const resumen = await obtenerResumenSaldoEmpresa(emp.id);
    if (resumen.deuda_cc_impaga > 0 || resumen.monto_acumulado > 0) {
      console.log(`- [ID ${emp.id}] ${emp.nombre} -> Deuda CC: $${resumen.deuda_cc_impaga.toLocaleString("es-CL")} | Monto Acumulado Activo: $${resumen.monto_acumulado.toLocaleString("es-CL")} | Saldo Libre: $${resumen.saldo_disponible_libre?.toLocaleString("es-CL") || "Sin límite"}`);
    }
  }

  console.log("\n🎉 Reinicialización completada exitosamente.");
};

if (require.main === module) {
  inicializarDeudasSistema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
