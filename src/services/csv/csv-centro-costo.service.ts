import fs from "fs";
import csv from "csv-parser";
import { CentroCosto } from "../../models/centro_costo.model";
import { mapCSVRow } from "./csv-centro-costo.mapper";
import { ICentroCostoCreate } from "../../interfaces/centroCosto.interface";

export class CSVCentroCostoService {
    async processFile(
        filePath: string
    ): Promise<{ success: number; errors: string[] }> {
        const errors: string[] = [];
        let success = 0;
        const rows: any[] = [];
        let rowNumber = 0;

        await new Promise<void>((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({ separator: "," }))
                .on("data", (row) => {
                    rowNumber++;
                    rows.push({ row, rowNumber });
                })
                .on("end", () => resolve())
                .on("error", reject);
        });

        for (const { row, rowNumber } of rows) {
            try {
                const mapped = mapCSVRow(row);

                if (!mapped.nombre) {
                    throw new Error("nombre es obligatorio");
                }

                if (!mapped.empresa_id) {
                    throw new Error("empresa_id es obligatorio");
                }

                const createPayload: ICentroCostoCreate = {
                    nombre: mapped.nombre.trim(),
                    empresa_id: Number(mapped.empresa_id),
                    estado: mapped.estado ?? Boolean(1),
                };

                // Verificar si ya existe en la misma empresa
                const existing = await CentroCosto.findOne({
                    where: { 
                        nombre: createPayload.nombre,
                        empresa_id: createPayload.empresa_id
                    },
                });

                if (existing) {
                    console.log(`Centro de costo existente: ${createPayload.nombre} para empresa ${createPayload.empresa_id}`);
                    continue;
                } else {
                    await CentroCosto.create(createPayload as any);
                    success++;
                }

            } catch (err: any) {
                console.error(`Error en fila ${rowNumber}:`, err.message);
                errors.push(`Fila ${rowNumber}: ${err.message} - Datos: ${JSON.stringify(row)}`);
            }
        }

        console.log(`Procesamiento completado: ${success} éxitos, ${errors.length} errores`);
        return { success, errors };
    }

    async debugCSV(filePath: string): Promise<any[]> {
        const rows: any[] = [];

        await new Promise<void>((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({ separator: "," }))
                .on("data", (row) => {
                    rows.push(row);
                })
                .on("end", () => resolve())
                .on("error", reject);
        });

        return rows;
    }
}