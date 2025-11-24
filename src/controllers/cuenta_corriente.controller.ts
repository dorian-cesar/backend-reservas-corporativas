import { Request, Response } from "express";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { ICuentaCorrienteCreate } from "../interfaces/cuentaCorriente.interface";

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
