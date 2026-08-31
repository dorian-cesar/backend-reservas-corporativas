import mysql from "mysql2/promise";

/**
 * SCRIPT DE CLONACIÓN SEGURO: PRODUCCIÓN ➔ DESARROLLO
 * 
 * Ubicación: src/script/syncProdToDev.ts
 * Uso: npx ts-node src/script/syncProdToDev.ts
 * 
 * Garantías de Seguridad:
 * 1. Base de datos de PRODUCCIÓN: SOLO LECTURA (SELECT). Jamás se ejecuta INSERT, UPDATE, DELETE ni DROP en Producción.
 * 2. Base de datos de DESARROLLO: Se deshabilitan llaves foráneas temporalmente, se borra el contenido de las tablas e insertan todos los datos traídos desde Producción.
 */

const PROD_CONFIG = {
  host: "reserva-corporativa.c6xou04wqeof.us-east-1.rds.amazonaws.com",
  port: 3306,
  user: "admin",
  password: "BIWEHB?NtOi6GPo.WaKD-Uvy[I9F",
  database: "multiempresa_db",
};

const DEV_CONFIG = {
  host: "ls-594a29bdbbcac0570afa88fba199455107a1c5a6.cs9gyyc0moxd.us-east-1.rds.amazonaws.com",
  port: 3306,
  user: "dbmasteruser",
  password: "aCY05KW.yh:jA%s{RO733w(AI|;Ui#6c",
  database: "multiempresa_db",
};

async function main() {
  console.log("===============================================================================");
  console.log("🚀 INICIANDO CLONACIÓN SEGURA: PRODUCCIÓN ➔ DESARROLLO");
  console.log("===============================================================================\n");

  let prodConn: mysql.Connection | null = null;
  let devConn: mysql.Connection | null = null;

  try {
    console.log("🔗 Conectando a Producción (SOLO LECTURA)...");
    prodConn = await mysql.createConnection(PROD_CONFIG);
    console.log("✅ Conexión con PRODUCCIÓN establecida.");

    console.log("🔗 Conectando a Desarrollo (DESTINO)...");
    devConn = await mysql.createConnection(DEV_CONFIG);
    console.log("✅ Conexión con DESARROLLO establecida.");

    // Obtener lista de tablas desde Producción
    const [tablesRows] = await prodConn.query<any[]>("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    const tableKey = Object.keys(tablesRows[0])[0];
    const tables: string[] = tablesRows.map((row) => row[tableKey]);

    console.log(`\n📋 Se encontraron ${tables.length} tablas en Producción:`, tables.join(", "));

    // 1. Deshabilitar Foreign Keys en Desarrollo
    console.log("\n🔑 Deshabilitando FOREIGN_KEY_CHECKS en Desarrollo...");
    await devConn.query("SET FOREIGN_KEY_CHECKS = 0;");

    // 2. Limpiar y copiar tabla por tabla
    for (const table of tables) {
      console.log(`\n-------------------------------------------------------------------------------`);
      console.log(`📦 Procesando tabla: '${table}'`);

      // Leer estructura DDL de Producción
      const [createTableResult] = await prodConn.query<any[]>(`SHOW CREATE TABLE \`${table}\``);
      const createTableSql = createTableResult[0]["Create Table"];

      // Recrear tabla en Desarrollo
      console.log(`  🗑️ Limpiando tabla '${table}' en Desarrollo...`);
      await devConn.query(`DROP TABLE IF EXISTS \`${table}\``);
      await devConn.query(createTableSql);

      // Leer todos los registros desde Producción (SOLO LECTURA)
      console.log(`  📥 Leyendo datos de '${table}' desde Producción...`);
      const [rows] = await prodConn.query<any[]>(`SELECT * FROM \`${table}\``);
      console.log(`  📊 ${rows.length} registros encontrados en Producción.`);

      if (rows.length > 0) {
        // Obtener nombres de columnas
        const colNames = Object.keys(rows[0]);
        const columnsSql = colNames.map((col) => `\`${col}\``).join(", ");

        console.log(`  📤 Copiando ${rows.length} registros a Desarrollo en lotes masivos...`);

        // BATCH INSERT (Insertar de a 1,000 filas por consulta SQL para velocidad ultra rápida)
        const BATCH_SIZE = 1000;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const valuesArray: any[] = [];
          const valuePlaceholders: string[] = [];

          for (const row of batch) {
            const rowValues = colNames.map((col) => row[col]);
            valuesArray.push(...rowValues);
            valuePlaceholders.push(`(${colNames.map(() => "?").join(", ")})`);
          }

          const batchInsertSql = `INSERT INTO \`${table}\` (${columnsSql}) VALUES ${valuePlaceholders.join(", ")}`;
          await devConn.query(batchInsertSql, valuesArray);
        }
        console.log(`  ✅ ${rows.length} registros copiados exitosamente a Desarrollo.`);
      } else {
        console.log(`  ℹ️ Tabla '${table}' está vacía en Producción.`);
      }
    }

    // 3. Rehabilitar Foreign Keys en Desarrollo
    console.log("\n🔑 Rehabilitando FOREIGN_KEY_CHECKS en Desarrollo...");
    await devConn.query("SET FOREIGN_KEY_CHECKS = 1;");

    console.log("\n===============================================================================");
    console.log("🎉 CLONACIÓN COMPLETADA CON ÉXITO.");
    console.log(" Base de datos de DESARROLLO ahora es una copia exacta de PRODUCCIÓN.");
    console.log(" PRODUCCIÓN NO sufrió ningún cambio ni edición (100% Intacta).");
    console.log("===============================================================================\n");
  } catch (err: any) {
    console.error("\n❌ ERROR durante el proceso de clonación:", err.message);
    if (devConn) {
      await devConn.query("SET FOREIGN_KEY_CHECKS = 1;").catch(() => {});
    }
  } finally {
    if (prodConn) await prodConn.end();
    if (devConn) await devConn.end();
    process.exit(0);
  }
}

main();
