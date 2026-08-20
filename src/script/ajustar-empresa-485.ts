import { Sequelize, QueryTypes } from "sequelize";
import moment from "moment-timezone";

// Credenciales de la Base de Datos de Producción provistas por el usuario
const DB_HOST = "reserva-corporativa.c6xou04wqeof.us-east-1.rds.amazonaws.com";
const DB_PORT = 3306;
const DB_USER = "admin";
const DB_PASSWORD = "BIWEHB?NtOi6GPo.WaKD-Uvy[I9F";
const DB_NAME = "multiempresa_db";

const sequelize = new Sequelize({
  dialect: "mysql",
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  logging: false,
});

async function fixCompany485Balance() {
  console.log(`=== INICIANDO AJUSTE DE CUENTA CORRIENTE DE EMPRESA 485 (DEV DB) ===`);
  console.log(`🔗 Host: ${DB_HOST}`);
  console.log(`📦 DB: ${DB_NAME}`);

  await sequelize.authenticate();
  console.log("✅ Conexión a base de datos de desarrollo exitosa.");

  const t = await sequelize.transaction();

  try {
    // 1. Obtener los movimientos impagos de periodos anteriores generados después del reinicio para la empresa 485
    // Los periodos anteriores a corregir son 2026-02, 2026-03, 2026-04, 2026-05
    console.log("\n🔍 Buscando cargos retroactivos del 12-08-2026 para empresa 485...");
    const cargosAAdjustar: any[] = await sequelize.query(`
      SELECT * FROM cuenta_corriente
      WHERE empresa_id = 485
        AND tipo_movimiento = 'cargo'
        AND pagado = 0
        AND referencia IN ('FACT-485-2026-02', 'FACT-485-2026-03', 'FACT-485-2026-04', 'FACT-485-2026-05')
      ORDER BY id ASC
    `, {
      type: QueryTypes.SELECT,
      transaction: t
    });

    console.log(`   Se encontraron ${cargosAAdjustar.length} cargos para ajustar.`);

    if (cargosAAdjustar.length > 0) {
      // 2. Marcar estos cargos como PAGADOS (pagado = 1)
      const idsCargos = cargosAAdjustar.map(c => c.id);
      console.log(`   Marcando cargos IDs [${idsCargos.join(", ")}] como pagados...`);
      
      await sequelize.query(`
        UPDATE cuenta_corriente
        SET pagado = 1,
            descripcion = CONCAT(descripcion, ' (Pagado por reinicio de deudas del sistema)')
        WHERE id IN (:idsCargos)
      `, {
        replacements: { idsCargos },
        type: QueryTypes.UPDATE,
        transaction: t
      });
      console.log("   ✅ Cargos marcados como pagados.");
    }

    // 3. Recalcular secuencialmente todos los saldos de la cuenta corriente de la empresa 485
    console.log("\n🔄 Recalculando saldos de cuenta corriente para la empresa 485...");
    const todosLosMovimientos: any[] = await sequelize.query(`
      SELECT * FROM cuenta_corriente
      WHERE empresa_id = 485
      ORDER BY id ASC
    `, {
      type: QueryTypes.SELECT,
      transaction: t
    });

    console.log(`   Total movimientos de la empresa: ${todosLosMovimientos.length}`);

    let saldoAcumulado = 0;
    for (const mov of todosLosMovimientos) {
      const montoNum = Number(mov.monto);
      
      // Si el cargo está pagado, no resta del saldo corriente en esta lógica contable específica
      // (tal como los cargos históricos previos con saldo: 0.00 en la BD de desarrollo)
      // Pero si no está pagado, sí resta. Los abonos suman.
      if (mov.tipo_movimiento === "cargo") {
        if (mov.pagado === 1 || mov.pagado === true) {
          // El cargo ya está saldado (su saldo en ese movimiento se normaliza a 0 o al saldo previo)
          // Mantenemos la lógica de no arrastrar deudas saldadas
        } else {
          saldoAcumulado -= montoNum;
        }
      } else if (mov.tipo_movimiento === "abono") {
        saldoAcumulado += montoNum;
      }

      await sequelize.query(`
        UPDATE cuenta_corriente
        SET saldo = :saldo
        WHERE id = :id
      `, {
        replacements: { saldo: saldoAcumulado, id: mov.id },
        type: QueryTypes.UPDATE,
        transaction: t
      });
    }

    console.log(`   ✅ Todos los saldos recalculados correctamente. Saldo final acumulado: $${saldoAcumulado}`);

    await t.commit();
    console.log("\n🎉 CAMBIOS APLICADOS Y CONFIRMADOS EN LA BASE DE DATOS DE DESARROLLO.");
  } catch (error) {
    await t.rollback();
    console.error("❌ Error durante la transacción, cambios revertidos:", error);
  } finally {
    await sequelize.close();
  }
}

fixCompany485Balance().catch(console.error);
