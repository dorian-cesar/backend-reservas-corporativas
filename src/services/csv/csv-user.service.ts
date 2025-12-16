import fs from "fs";
import csv from "csv-parser";
import bcrypt from "bcrypt";
import { User } from "../../models/user.model";
import { mapCSVRow } from "./csv-user.mapper";
import { IUserCreate, IUserUpdate } from "../../interfaces/user.interface";

export class CSVUserService {
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

                if (!mapped.nombre || !mapped.email) {
                    throw new Error("nombre y email son obligatorios");
                }

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(mapped.email)) {
                    throw new Error("email no válido");
                }

                const passwordBase = mapped.rut?.replace(/\D/g, "") ||
                    mapped.email.split("@")[0] ||
                    "password123";

                const hashedPassword = await bcrypt.hash(passwordBase, 10);

                const createPayload: IUserCreate = {
                    nombre: mapped.nombre,
                    email: mapped.email.toLowerCase().trim(),
                    rut: mapped.rut,
                    rol: mapped.rol || "subusuario",
                    empresa_id: mapped.empresa_id,
                    centro_costo_id: mapped.centro_costo_id,
                    estado: mapped.estado ?? true,
                    password: hashedPassword,
                };

                const existing = await User.findOne({
                    where: { email: createPayload.email },
                });

                if (existing) {
                    console.log(`Usuario existente: ${createPayload.email}`);
                    continue;
                } else {
                    await User.create(createPayload);
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