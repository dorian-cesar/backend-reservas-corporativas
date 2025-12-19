import { Request, Response } from "express";
import { CSVUserService } from "../services/csv/csv-user.service";
import { CSVPassengerService } from "../services/csv/csv-pasajero.service";
import { CSVCentroCostoService } from "../services/csv/csv-centro-costo.service";

const userService = new CSVUserService();
const passengerService = new CSVPassengerService();
const centroCostoService = new CSVCentroCostoService();

export class CSVController {
    static async uploadUser(req: Request, res: Response) {
        if (!req.file) {
            return res.status(400).json({ message: "Archivo CSV requerido" });
        }

        try {
            const debugRows = await userService.debugCSV(req.file.path);
            console.log(`Total de filas en CSV: ${debugRows.length}`);

            const result = await userService.processFile(req.file.path);

            return res.json({
                message: "CSV procesado correctamente",
                file: req.file.filename,
                result: {
                    ...result,
                    totalRows: debugRows.length
                },
                debug: process.env.NODE_ENV === 'development' ? {
                    sampleRows: debugRows.slice(0, 3),
                    headers: Object.keys(debugRows[0] || {})
                } : undefined
            });
        } catch (error: any) {
            console.error("Error en UserCSVController.uploadUser:", error);
            return res.status(500).json({
                message: "Error procesando CSV",
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    static async uploadPassenger(req: Request, res: Response) {
        if (!req.file) {
            return res.status(400).json({ message: "Archivo CSV requerido" });
        }

        try {
            const debugRows = await passengerService.debugCSV(req.file.path);
            console.log(`Total de filas en CSV: ${debugRows.length}`);

            const result = await passengerService.processFile(req.file.path);

            return res.json({
                message: "CSV procesado correctamente",
                file: req.file.filename,
                result: {
                    ...result,
                    totalRows: debugRows.length
                },
                debug: process.env.NODE_ENV === 'development' ? {
                    sampleRows: debugRows.slice(0, 3),
                    headers: Object.keys(debugRows[0] || {})
                } : undefined
            });
        } catch (error: any) {
            console.error("Error en CSVController.uploadUser:", error);
            return res.status(500).json({
                message: "Error procesando CSV",
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    static async uploadCentroCosto(req: Request, res: Response) {
        if (!req.file) {
            return res.status(400).json({ message: "Archivo CSV requerido" });
        }

        try {
            const debugRows = await centroCostoService.debugCSV(req.file.path);
            console.log(`Total de filas en CSV: ${debugRows.length}`);

            const result = await centroCostoService.processFile(req.file.path);

            return res.json({
                message: "CSV de Centros de Costo procesado correctamente",
                file: req.file.filename,
                result: {
                    ...result,
                    totalRows: debugRows.length
                },
                debug: process.env.NODE_ENV === 'development' ? {
                    sampleRows: debugRows.slice(0, 3),
                    headers: Object.keys(debugRows[0] || {})
                } : undefined
            });
        } catch (error: any) {
            console.error("Error en CSVController.uploadCentroCosto:", error);
            return res.status(500).json({
                message: "Error procesando CSV de Centros de Costo",
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
}