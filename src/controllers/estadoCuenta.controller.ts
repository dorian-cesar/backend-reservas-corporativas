// src/controllers/estadoCuenta.controller.ts

import { Request, Response } from "express";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";

/**
 * Marca un estado de cuenta como pagado y genera un abono en la cuenta corriente.
 */
export const pagarEstadoCuenta = async (req: Request, res: Response) => {
    const { estadoCuentaId, monto } = req.body;

    const estadoCuenta = await EstadoCuenta.findByPk(estadoCuentaId);
    if (!estadoCuenta) {
        return res.status(404).json({ message: "Estado de cuenta no encontrado" });
    }
    if (estadoCuenta.pagado) {
        return res.status(400).json({ message: "El estado de cuenta ya está pagado" });
    }

    // Registrar abono en cuenta corriente
    await CuentaCorriente.create({
        empresa_id: estadoCuenta.empresa_id,
        tipo_movimiento: "abono",
        monto: monto,
        descripcion: `Abono por pago de estado de cuenta #${estadoCuenta.id} periodo ${estadoCuenta.periodo}`,
        saldo: 0,
        referencia: `ABONO-EDC-${estadoCuenta.id}`
    });

    // Marcar como pagado
    estadoCuenta.pagado = true;
    estadoCuenta.fecha_pago = new Date();
    await estadoCuenta.save();

    return res.json({ message: "Estado de cuenta pagado correctamente" });
};
