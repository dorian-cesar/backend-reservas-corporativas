import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { CentroCosto } from "../models/centro_costo.model";
import { sequelize } from "../database";

interface CSVRow {
    nombre: string;
    empresa_id: string;
    estado: string;
}

interface ProcessResult {
    updated: number;
    notFound: number;
    errors: string[];
}

async function processCSV(filePath: string): Promise<ProcessResult> {
    const errors: string[] = [];
    let updated = 0;
    let notFound = 0;
    let rowNumber = 0;

    const rows: CSVRow[] = [];

    // 1️⃣ Leer CSV completo
    await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv({ separator: ";" }))
            .on("data", (row) => rows.push(row))
            .on("end", resolve)
            .on("error", reject);
    });

    console.log(`📄 Filas leídas: ${rows.length}`);

    // 2️⃣ Procesar fila por fila
    for (const row of rows) {
        rowNumber++;

        try {
            const nombre = row.nombre?.trim();
            const empresa_id = Number(row.empresa_id);
            const estadoRaw = row.estado?.toString().trim().toLowerCase();

            if (!nombre) {
                throw new Error("nombre vacío");
            }

            if (!empresa_id || isNaN(empresa_id)) {
                throw new Error("empresa_id inválido");
            }

            const estado =
                ["0", "false", "no", "inactivo", "inactive"].includes(estadoRaw)
                    ? 0
                    : 1;

            // 3️⃣ Buscar centro de costo existente
            const centro = await CentroCosto.findOne({
                where: {
                    nombre,
                    empresa_id,
                },
            });

            if (!centro) {
                notFound++;
                errors.push(
                    `Fila ${rowNumber}: Centro de costo no encontrado (${nombre}, empresa ${empresa_id})`
                );
                continue;
            }

            // 4️⃣ Actualizar
            await centro.update({
                estado,
                updated_at: new Date(),
            });

            updated++;

        } catch (err: any) {
            errors.push(
                `Fila ${rowNumber}: ${err.message} - Datos: ${JSON.stringify(row)}`
            );
        }
    }

    return { updated, notFound, errors };
}

//
// 🚀 EJECUCIÓN DESDE CONSOLA
//
(async () => {
    try {
        const filePath = process.argv[2];

        if (!filePath) {
            console.error("❌ Debes indicar la ruta del CSV");
            console.error("Ejemplo: npm run update-centros ./centros.csv");
            process.exit(1);
        }

        const absolutePath = path.resolve(filePath);

        console.log("🔌 Conectando a la base de datos...");
        await sequelize.authenticate();

        console.log("▶️ Iniciando actualización...");
        const result = await processCSV(absolutePath);

        console.log("✅ Proceso terminado");
        console.log("────────────────────────");
        console.log(`✔ Actualizados : ${result.updated}`);
        console.log(`⚠ No encontrados: ${result.notFound}`);
        console.log(`❌ Errores      : ${result.errors.length}`);

        if (result.errors.length > 0) {
            console.log("\n📋 Detalle de errores:");
            result.errors.forEach((e) => console.log(" -", e));
        }

        process.exit(0);
    } catch (err) {
        console.error("🔥 Error fatal:", err);
        process.exit(1);
    }
})();
