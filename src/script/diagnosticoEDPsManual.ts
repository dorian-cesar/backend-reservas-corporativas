/**
 * Diagnóstico y corrección para empresa ID 11
 * Muestra todos sus EDPs y cargos actuales, y los EDPs/cargos creados hoy.
 */
import { Sequelize, QueryTypes } from "sequelize";
import * as dotenv from "dotenv";
dotenv.config();

const sequelize = new Sequelize({
    dialect: "mysql",
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "multiempresa_db",
    logging: false,
});

const EMPRESA_ID = 11;

(async () => {
    await sequelize.authenticate();
    console.log("✅ Conectado a:", process.env.DB_HOST, "\n");

    // 1) Info de la empresa
    const [empresa]: any[] = await sequelize.query(`
        SELECT id, nombre, fact_manual, dia_facturacion, dia_vencimiento
        FROM empresas WHERE id = ${EMPRESA_ID}
    `, { type: QueryTypes.SELECT });
    console.log("🏢 Empresa:");
    console.table([empresa]);

    // 2) Todos sus EDPs (estado_cuenta)
    const edps: any[] = await sequelize.query(`
        SELECT id, periodo, fecha_inicio, fecha_fin, fecha_generacion,
               total_tickets, monto_facturado, pagado
        FROM estados_cuenta
        WHERE empresa_id = ${EMPRESA_ID}
        ORDER BY periodo, fecha_inicio
    `, { type: QueryTypes.SELECT });
    console.log(`\n📋 EDPs de empresa ${EMPRESA_ID}: ${edps.length}`);
    console.table(edps);

    // 3) Cargos FACT en cuenta corriente
    const cargos: any[] = await sequelize.query(`
        SELECT id, referencia, monto, fecha_movimiento
        FROM cuenta_corriente
        WHERE empresa_id = ${EMPRESA_ID}
          AND referencia LIKE 'FACT-%'
        ORDER BY referencia
    `, { type: QueryTypes.SELECT });
    console.log(`\n💳 Cargos FACT de empresa ${EMPRESA_ID}: ${cargos.length}`);
    console.table(cargos);

    await sequelize.close();
    console.log("\n✅ Diagnóstico finalizado. Nada fue modificado.");
})();
