import { Request, Response } from "express";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { ICuentaCorrienteCreate } from "../interfaces/cuentaCorriente.interface";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Op } from "sequelize";
import { Empresa } from "../models/empresa.model";

export const listarMovimientos = async (req: Request, res: Response) => {
    try {
        const { empresa_id } = req.params;
        const { tipo, pagado, desde, hasta, page = "1", limit = "10" } = req.query;

        const pageNum = parseInt(page as string, 10) || 1;
        const limitNum = parseInt(limit as string, 10) || 10;
        const offset = (pageNum - 1) * limitNum;

        const where: any = { empresa_id };

        if (tipo && (tipo === "abono" || tipo === "cargo")) {
            where.tipo_movimiento = tipo;
        }

        if (pagado !== undefined) {
            where.pagado = pagado === "true" || pagado === "1";
        }

        // Filtro por fecha
        if (desde || hasta) {
            where.fecha_movimiento = {};

            if (desde) {
                const desdeDate = new Date(desde as string);
                desdeDate.setHours(0, 0, 0, 0);
                where.fecha_movimiento[Op.gte] = desdeDate;
            }

            if (hasta) {
                const hastaDate = new Date(hasta as string);
                hastaDate.setHours(23, 59, 59, 999);
                where.fecha_movimiento[Op.lte] = hastaDate;
            }
        }

        // Obtener total de registros
        const total = await CuentaCorriente.count({ where });

        // Obtener movimientos con paginación
        const movimientos = await CuentaCorriente.findAll({
            where,
            order: [["fecha_movimiento", "DESC"]],
            limit: limitNum,
            offset: offset,
            include: [
                {
                    model: Empresa,
                    as: 'empresa',
                    attributes: ['id', 'nombre']
                }
            ]
        });

        const totalPages = Math.ceil(total / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;

        res.json({
            movimientos,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages,
                hasNextPage,
                hasPrevPage
            }
        });
    } catch (error) {
        console.error("Error al listar movimientos:", error);
        res.status(500).json({
            message: "Error en servidor",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
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

export const pagarMovimiento = async (req: Request, res: Response) => {
    try {
        const { movimientoId, monto } = req.body;

        // Validaciones básicas
        if (!movimientoId || !monto) {
            return res.status(400).json({
                message: "Faltan parámetros: movimientoId y monto"
            });
        }

        // 1. Buscar el cargo
        const movimiento = await CuentaCorriente.findByPk(movimientoId);
        if (!movimiento) {
            return res.status(404).json({ message: "Movimiento no encontrado" });
        }

        // 2. Verificar que sea un cargo (no se pagan abonos)
        if (movimiento.tipo_movimiento !== "cargo") {
            return res.status(400).json({
                message: "Solo se pueden pagar movimientos de tipo 'cargo'"
            });
        }

        // 3. Verificar que no esté ya pagado (opcional, pero buena práctica)
        if (movimiento.pagado) {
            return res.status(400).json({
                message: "Este movimiento ya está marcado como pagado"
            });
        }

        // 4. Obtener último saldo para calcular
        const ultimo = await CuentaCorriente.findOne({
            where: { empresa_id: movimiento.empresa_id },
            order: [["fecha_movimiento", "DESC"]],
        });

        let nuevoSaldo = ultimo ? Number(ultimo.saldo) : 0;
        nuevoSaldo = nuevoSaldo + Number(monto); // Abono SUMA al saldo

        // 5. Crear el abono (registro del pago)
        const abono = await CuentaCorriente.create({
            empresa_id: movimiento.empresa_id,
            tipo_movimiento: "abono",
            monto: Number(monto),
            descripcion: `Pago de ${movimiento.descripcion || `cargo #${movimiento.id}`}`,
            saldo: nuevoSaldo,
            referencia: `ABONO-PAGO-${movimiento.id}`,
            fecha_movimiento: new Date()
        });

        // 6. Marcar el cargo original como PAGADO
        movimiento.pagado = true;
        await movimiento.save();

        res.json({
            message: "Pago registrado exitosamente",
            pago: abono.toJSON(),
            cargoPagado: {
                id: movimiento.id,
                monto: movimiento.monto,
                ahoraPagado: true
            }
        });

    } catch (error) {
        console.error("Error al pagar movimiento:", error);
        res.status(500).json({
            message: "Error interno del servidor",
            error: error instanceof Error ? error.message : "Error desconocido"
        });
    }
};
