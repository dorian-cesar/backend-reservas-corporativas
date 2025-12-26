import fs from "fs";
import csv from "csv-parser";
import { Empresa } from "../../models/empresa.model";
import { mapCSVRow } from "./csv-empresa.mapper";
import { IEmpresaCreate } from "../../interfaces/empresa.interface";

export class CSVEmpresaService {
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

                const createPayload: IEmpresaCreate = {
                    nombre: mapped.nombre.trim(),
                    rut: mapped.rut,
                    cuenta_corriente: mapped.cuenta_corriente,
                    estado: mapped.estado ?? true,
                    recargo: mapped.recargo ?? 0,
                    porcentaje_devolucion: mapped.porcentaje_devolucion ?? 0.0,
                    dia_facturacion: mapped.dia_facturacion,
                    dia_vencimiento: mapped.dia_vencimiento,
                    monto_maximo: mapped.monto_maximo,
                    monto_acumulado: mapped.monto_acumulado ?? 0,
                };

                let existing;
                if (createPayload.rut && createPayload.cuenta_corriente) {
                    existing = await Empresa.findOne({
                        where: {
                            rut: createPayload.rut,
                            cuenta_corriente: createPayload.cuenta_corriente
                        },
                    });
                }

                if (!existing) {
                    existing = await Empresa.findOne({
                        where: { nombre: createPayload.nombre },
                    });
                }

                if (existing) {
                    console.log(`Empresa existente: ${createPayload.nombre}${createPayload.rut ? ` (RUT: ${createPayload.rut})` : ''}`);
                    continue;
                } else {
                    await Empresa.create(createPayload as any);
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