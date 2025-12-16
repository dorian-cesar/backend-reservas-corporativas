import fs from "fs";
import csv from "csv-parser";
import bcrypt from "bcrypt";
import { Pasajero } from "../../models/pasajero.model";
import { mapCSVRow } from "./csv-pasajero.mapper";
import { IPasajeroCreate, IPasajeroUpdate } from "../../interfaces/pasajero.interface";

export class CSVPassengerService {
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

                if (!mapped.nombre || !mapped.rut || !mapped.correo) {
                    throw new Error("nombre, rut y correo son obligatorios");
                }

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(mapped.correo)) {
                    throw new Error("email no válido");
                }

                const createPayload: IPasajeroCreate = {
                    nombre: mapped.nombre,
                    rut: mapped.rut,
                    correo: mapped.correo.toLowerCase().trim(),
                    telefono: mapped.telefono,
                    id_empresa: Number(mapped.id_empresa),
                    id_centro_costo: Number(mapped.id_centro_costo),
                };

                const existing = await Pasajero.findOne({
                    where: { correo: createPayload.correo },
                });

                if (existing) {
                    console.log(`Usuario existente: ${createPayload.correo}`);
                    continue;
                } else {
                    await Pasajero.create(createPayload);
                }

                success++;
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