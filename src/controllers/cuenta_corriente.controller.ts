import { Request, Response } from "express";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { ICuentaCorrienteCreate } from "../interfaces/cuentaCorriente.interface";
import {col, fn, literal, Op} from "sequelize";

// Listar movimientos de cuenta corriente por empresa
export const listarMovimientos = async (req: Request, res: Response) => {
    try {
        const { empresa_id } = req.params;
        const movimientos = await CuentaCorriente.findAll({
            where: { empresa_id },
            order: [["fecha_movimiento", "DESC"]],
        });
        res.json(movimientos);
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

// Obtener un movimiento específico
export const obtenerMovimiento = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const movimiento = await CuentaCorriente.findByPk(id);
        if (!movimiento) return res.status(404).json({ message: "No encontrado" });
        res.json(movimiento);
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

// Crear un movimiento (abono o cargo)
export const crearMovimiento = async (
    req: Request<{}, {}, ICuentaCorrienteCreate>,
    res: Response
) => {
    try {
        const { empresa_id, tipo_movimiento, monto, descripcion, referencia } = req.body;

        // Obtener último saldo
        const ultimo = await CuentaCorriente.findOne({
            where: { empresa_id },
            order: [["fecha_movimiento", "DESC"]],
        });
        let saldo = ultimo ? Number(ultimo.saldo) : 0;
        saldo = tipo_movimiento === "abono" ? saldo + Number(monto) : saldo - Number(monto);

        const movimiento = await CuentaCorriente.create({
            empresa_id,
            tipo_movimiento,
            monto,
            descripcion,
            saldo,
            referencia,
        });

        res.status(201).json(movimiento);
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

// Eliminar un movimiento (opcional, según política)
export const eliminarMovimiento = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const movimiento = await CuentaCorriente.findByPk(id);
        if (!movimiento) return res.status(404).json({ message: "No encontrado" });
        await movimiento.destroy();
        res.json({ message: "Movimiento eliminado" });
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

/**
 * Agrupa los movimientos de cuenta corriente por tipo_movimiento y por patrón de descripción,
 * mostrando un resumen como "3 Abonos por tickets anulados" en el campo descripcion,
 * sumando los montos y cantidades, y mostrando los demás campos agrupados.
 *
 * @param req Express Request
 * @param res Express Response
 * @returns JSON con agrupación por tipo_movimiento y patrón de descripción (con cantidad)
 */
export const agruparResumenPorTipoMovimiento = async (req: Request, res: Response) => {
    try {
        const { empresa_id } = req.params;

        // Trae todos los movimientos de la empresa
        const movimientos = await CuentaCorriente.findAll({
            attributes: [
                "id",
                "empresa_id",
                "fecha_movimiento",
                "tipo_movimiento",
                "monto",
                "descripcion",
                "saldo",
                "referencia"
            ],
            where: {
                empresa_id: Number(empresa_id)
            },
            order: [
                ["tipo_movimiento", "ASC"],
                ["descripcion", "ASC"]
            ],
            raw: true
        });

        // Agrupa por tipo_movimiento y patrón de descripción (sin el número de ticket)
        const agrupados: {
            [key: string]: {
                ids: number[],
                empresa_id: number,
                tipo_movimiento: string,
                descripcion: string,
                fecha_movimiento: string,
                monto: number,
                saldo: number,
                referencia: string,
                cantidad: number
            }
        } = {};

        movimientos.forEach(mov => {
            // Extrae el patrón base de la descripción (sin el número de ticket)
            // Ejemplo: "Abono por ticket anulado #TS251125133854508XBN10" => "Abono por ticket anulado"
            const descripcionOriginal = mov.descripcion ?? "";
            const match = descripcionOriginal.match(/^(.*?)(\s+#.*)?$/);
            const descripcion_base = match ? match[1].trim() : (mov.descripcion ?? "").trim();
            const key = `${mov.tipo_movimiento}|${descripcion_base}`;

            if (!agrupados[key]) {
                agrupados[key] = {
                    ids: [mov.id],
                    empresa_id: mov.empresa_id,
                    tipo_movimiento: mov.tipo_movimiento,
                    descripcion: descripcion_base,
                    fecha_movimiento: mov.fecha_movimiento instanceof Date
                        ? mov.fecha_movimiento.toISOString()
                        : String(mov.fecha_movimiento),
                    monto: Number(mov.monto),
                    saldo: Number(mov.saldo),
                    referencia: mov.referencia || "",
                    cantidad: 1
                };
            } else {
                agrupados[key].ids.push(mov.id);
                agrupados[key].monto += Number(mov.monto);
                agrupados[key].cantidad += 1;
            }
        });

        // Construye el resumen con la cantidad en la descripción
        const resumen = Object.values(agrupados).map(grupo => ({
            id: grupo.ids[0],
            empresa_id: grupo.empresa_id,
            fecha_movimiento: grupo.fecha_movimiento,
            tipo_movimiento: grupo.tipo_movimiento,
            monto: grupo.monto.toFixed(2),
            descripcion: `${grupo.cantidad} ${grupo.descripcion}${grupo.descripcion.endsWith('s') ? '' : 's'}`,
            saldo: grupo.saldo.toFixed(2),
            referencia: grupo.referencia,
            cantidad: grupo.cantidad
        }));

        res.json(resumen);
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Error en servidor" });
    }
};
