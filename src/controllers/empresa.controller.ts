import { Request, Response } from "express";
import { Empresa } from "../models/empresa.model";
import { IEmpresaCreate, IEmpresaUpdate } from "../interfaces/empresa.interface";
import { Op } from "sequelize";
import { UserEmpresa } from "../models/user_empresa.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";

/**
 * Listar todas las empresas.
 */

export const listarEmpresas = async (req: Request, res: Response) => {
    try {
        const user = req.user as any;
        const rol = user.rol;
        const user_id = user.id;
        const empresa_id = user.empresa_id;

        const page = req.query.page ? Number(req.query.page) : null;
        const limit = req.query.limit ? Number(req.query.limit) : null;
        const search = req.query.search ? String(req.query.search).trim() : null;

        const includeInactives = req.query.includeInactives === 'true';

        let whereCondition: any = {};

        if (!includeInactives) {
            whereCondition.estado = true;
        }

        if (search) {
            whereCondition[Op.or] = [
                { nombre: { [Op.like]: `%${search}%` } },
                { cuenta_corriente: { [Op.like]: `%${search}%` } }
            ];
        }

        if (rol === "admin") {
            const userEmpresas = await UserEmpresa.findAll({
                where: { user_id },
                attributes: ["empresa_id"]
            });

            const empresaIds = userEmpresas.map(ue => ue.empresa_id);

            const finalEmpresaIds =
                empresaIds.length > 0
                    ? empresaIds
                    : empresa_id
                        ? [empresa_id]
                        : [];

            if (finalEmpresaIds.length === 0) {
                return res.json(
                    page && limit
                        ? { data: [], pagination: { total: 0, page, limit, totalPages: 0 } }
                        : []
                );
            }

            whereCondition.id = {
                ...(whereCondition.id || {}),
                [Op.in]: finalEmpresaIds
            };
        }

        if (rol !== "superuser" && empresa_id !== 1) {
            whereCondition.id = {
                ...(whereCondition.id || {}),
                [Op.ne]: 1
            };
        }

        if (!page || !limit) {
            // Obtener empresas con datos básicos
            const empresas = await Empresa.findAll({
                where: whereCondition,
                order: [["id", "ASC"]]
            });

            // Obtener saldos actuales para cada empresa
            const empresasConSaldo = await Promise.all(
                empresas.map(async (empresa) => {
                    const empresaData = empresa.toJSON();

                    // Obtener último saldo de cuenta corriente
                    const ultimoMovimiento = await CuentaCorriente.findOne({
                        where: { empresa_id: empresa.id },
                        order: [["fecha_movimiento", "DESC"], ["id", "DESC"]]
                    });

                    const saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;
                    const saldoRestante = empresa.monto_maximo
                        ? empresa.monto_maximo + saldoActual
                        : null;

                    return {
                        ...empresaData,
                        saldo_actual: saldoActual,
                        saldo_restante: saldoRestante
                    };
                })
            );

            return res.json(empresasConSaldo);
        }

        const offset = (page - 1) * limit;

        const { rows, count } = await Empresa.findAndCountAll({
            where: whereCondition,
            order: [["id", "ASC"]],
            limit,
            offset
        });

        // Obtener saldos para las empresas paginadas
        const empresasConSaldo = await Promise.all(
            rows.map(async (empresa) => {
                const empresaData = empresa.toJSON();

                // Obtener último saldo de cuenta corriente
                const ultimoMovimiento = await CuentaCorriente.findOne({
                    where: { empresa_id: empresa.id },
                    order: [["fecha_movimiento", "DESC"], ["id", "DESC"]]
                });

                const saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;
                const saldoRestante = empresa.monto_maximo
                    ? empresa.monto_maximo + saldoActual
                    : null;

                return {
                    ...empresaData,
                    saldo_actual: saldoActual,
                    saldo_restante: saldoRestante
                };
            })
        );

        return res.json({
            data: empresasConSaldo,
            pagination: {
                total: count,
                page,
                limit,
                totalPages: Math.max(1, Math.ceil(count / limit)),
                hasNextPage: page < Math.ceil(count / limit),
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: "Error en servidor",
            error: (error as Error).message
        });
    }
};


/**
 * Obtener una empresa por ID.
 */
export const obtenerEmpresa = async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id);
        const user = req.user as any;
        const rol = user.rol;
        const empresa_id = user.empresa_id;

        // Si se intenta acceder a empresa 1 y el usuario no tiene permisos
        if (id === 1 && rol !== "superuser" && empresa_id !== 1) {
            return res.status(403).json({
                message: "No autorizado para ver esta empresa"
            });
        }

        const empresa = await Empresa.findByPk(id);
        if (!empresa) return res.status(404).json({ message: "No encontrada" });

        res.json(empresa);
    } catch (error) {
        res.status(500).json({ message: "Error en servidor", error: (error as Error).message });
    }
};


/**
 * Crear una empresa.
 */
export const crearEmpresa = async (
    req: Request<{}, {}, IEmpresaCreate>,
    res: Response
) => {
    const {
        rut,
        nombre,
        cuenta_corriente,
        estado,
        recargo,
        porcentaje_devolucion,
        dia_facturacion,
        dia_vencimiento,
        monto_maximo,
        monto_acumulado
    } = req.body;

    const empresa = await Empresa.create({
        rut,
        nombre,
        cuenta_corriente,
        estado,
        recargo,
        porcentaje_devolucion,
        dia_facturacion,
        dia_vencimiento,
        monto_maximo,
        monto_acumulado
    });

    res.json({ id: empresa.id, message: "Empresa creada" });
};

/**
 * Actualizar una empresa.
 */
export const actualizarEmpresa = async (
    req: Request<{ id: string }, {}, IEmpresaUpdate>,
    res: Response
) => {
    const empresa = await Empresa.findByPk(req.params.id);
    if (!empresa) return res.status(404).json({ message: "No encontrada" });
    await empresa.update(req.body);
    res.json({ message: "Empresa actualizada" });
};

/**
 * Eliminar una empresa.
 */
export const eliminarEmpresa = async (req: Request, res: Response) => {
    const empresa = await Empresa.findByPk(req.params.id);
    if (!empresa) return res.status(404).json({ message: "No encontrada" });
    await empresa.destroy();
    res.json({ message: "Empresa eliminada" });
};


export const resetMontoAcumulado = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    try {
        const id = parseInt(req.params.id, 10);
        const user = req.user as any;

        const empresa = await Empresa.findByPk(id);
        if (!empresa) {
            return res.status(404).json({ message: "Empresa no encontrada" });
        }

        const montoAnterior = empresa.monto_acumulado || 0;

        await empresa.update({
            monto_acumulado: 0,
        });

        console.log(`Monto acumulado reestablecido:`, {
            empresaId: empresa.id,
            empresaNombre: empresa.nombre,
            montoAnterior: montoAnterior,
            montoNuevo: 0,
            usuarioId: user.id,
            usuarioRol: user.rol,
            fecha: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `Monto acumulado reestablecido a 0`,
            detalles: {
                empresa: {
                    id: empresa.id,
                    nombre: empresa.nombre
                },
                monto_anterior: montoAnterior,
                monto_nuevo: 0,
                fecha_reestablecimiento: new Date()
            }
        });

    } catch (err) {
        console.error('Error reestableciendo monto acumulado:', err);
        res.status(500).json({
            message: "Error en servidor",
            error: (err as Error).message
        });
    }
};

export const setNewLoginForEmpresa = async (
    req: Request<{ id: string }, {}, { newLogin: boolean }>,
    res: Response
) => {
    try {
        const empresaId = parseInt(req.params.id);
        const { newLogin } = req.body;

        if (isNaN(empresaId)) {
            return res.status(400).json({
                success: false,
                message: "ID de empresa inválido"
            });
        }

        const empresa = await Empresa.findByPk(empresaId);
        if (!empresa) {
            return res.status(404).json({
                success: false,
                message: "Empresa no encontrada"
            });
        }

        // Guardar el valor en la empresa
        await empresa.update({ newLogin });

        return res.json({
            success: true,
            message: `newLogin ${newLogin ? 'activado' : 'desactivado'} para la empresa "${empresa.nombre}"`,
            empresa: {
                id: empresa.id,
                nombre: empresa.nombre,
                newLogin
            }
        });
    } catch (err) {
        console.error("Error en setNewLoginForEmpresa:", err);
        res.status(500).json({
            success: false,
            message: "Error en servidor",
            error: err instanceof Error ? err.message : "Error desconocido"
        });
    }
};