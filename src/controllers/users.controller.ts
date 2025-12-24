// src/controllers/users.controller.ts
import { Request, Response } from "express";
import * as bcrypt from "bcrypt";
import { User } from "../models/user.model";
import { IUserCreate, IUserUpdate } from "../interfaces/user.interface";
import { Empresa } from "../models/empresa.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Op, fn, col } from "sequelize";
import { sanitizeUser } from "../utils/sanitizeUser";

export const getUsers = async (req: Request, res: Response) => {
    try {
        const rol = (req.user as any).rol;
        const empresa_id = (req.user as any).empresa_id;

        const filterEmpresaId = req.query.empresa_id ? parseInt(req.query.empresa_id as string) : null;
        const email = (req.query.email as string) || null;

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        let users, total;

        let baseWhere: any = {};

        if (email) {
            baseWhere.email = email;
        }

        if (filterEmpresaId !== null) {
            baseWhere.empresa_id = filterEmpresaId;
        }

        if (empresa_id === 1) {
            if (rol === "superuser" || rol === "contralor" || rol === "auditoria") {
                const where: any = {
                    rol: { [Op.ne]: "superuser" },
                    ...baseWhere
                };

                const result = await User.findAndCountAll({
                    where,
                    limit,
                    offset,
                    order: [['id', 'ASC']]
                });

                users = result.rows.map(u => sanitizeUser(u));
                total = result.count;

                return res.json({
                    users,
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages: Math.ceil(total / limit),
                        hasNextPage: page < Math.ceil(total / limit),
                        hasPrevPage: page > 1
                    }
                });
            }

            if (rol === "admin") {
                const where: any = {
                    empresa_id: 1,
                    rol: { [Op.ne]: "superuser" },
                    ...baseWhere
                };

                if (filterEmpresaId !== null && filterEmpresaId !== 1) {
                    return res.json({
                        users: [],
                        pagination: {
                            total: 0,
                            page,
                            limit,
                            totalPages: 0,
                            hasNextPage: false,
                            hasPrevPage: page > 1
                        }
                    });
                }

                const result = await User.findAndCountAll({
                    where,
                    limit,
                    offset,
                    order: [['id', 'ASC']]
                });

                users = result.rows.map(u => sanitizeUser(u));
                total = result.count;

                return res.json({
                    users,
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages: Math.ceil(total / limit),
                        hasNextPage: page < Math.ceil(total / limit),
                        hasPrevPage: page > 1
                    }
                });
            }
        }

        if (rol === "admin") {
            const where: any = {
                empresa_id: empresa_id,
                rol: { [Op.ne]: "superuser" },
                ...baseWhere
            };

            if (filterEmpresaId !== null && filterEmpresaId !== empresa_id) {
                return res.json({
                    users: [],
                    pagination: {
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                        hasNextPage: false,
                        hasPrevPage: page > 1
                    }
                });
            }

            const result = await User.findAndCountAll({
                where,
                limit,
                offset,
                order: [['id', 'ASC']]
            });

            users = result.rows.map(u => sanitizeUser(u));
            total = result.count;
            return res.json({
                users,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                }
            });
        }

        if (rol === "superuser" || rol === "contralor" || rol === "auditoria") {
            const where: any = {
                [Op.and]: [
                    { rol: { [Op.ne]: "superuser" } },
                    { empresa_id: { [Op.ne]: 1 } }
                ],
                ...baseWhere
            };

            if (filterEmpresaId === 1) {
                return res.json({
                    users: [],
                    pagination: {
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                        hasNextPage: false,
                        hasPrevPage: page > 1
                    }
                });
            }

            const result = await User.findAndCountAll({
                where,
                limit,
                offset,
                order: [['id', 'ASC']]
            });

            users = result.rows.map(u => sanitizeUser(u));
            total = result.count;
            return res.json({
                users,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1
                }
            });
        }

        return res.status(403).json({ message: "No autorizado" });
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};


/**
 * Obtiene toda la información de un usuario, incluyendo empresa y centro de costo, a partir de su ID.
 *
 * @param req - Objeto Request de Express, con el parámetro 'id' en la URL.
 * @param res - Objeto Response de Express.
 * @returns JSON con la información completa del usuario o error correspondiente.
 */

export const getUserById = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const id = req.params.id;

        const user = await User.findByPk(id, {
            include: [
                {
                    model: Empresa,
                    as: "empresa"
                },
                {
                    model: CentroCosto,
                    as: "centroCosto"
                }
            ]
        });

        if (!user) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        res.json(sanitizeUser(user));
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const create = async (
    req: Request<{}, {}, IUserCreate>,
    res: Response
) => {
    try {
        const { nombre, rut, email, password, rol, empresa_id, centro_costo_id, estado } = req.body;

        // Solo superuser puede crear superusers
        if (rol === "superuser" && (req.user as any).rol !== "superuser")
            return res.status(403).json({ message: "Solo el superuser puede crear superusers" });

        // Si es admin, fuerza empresa_id al del admin
        let targetEmpresaId = empresa_id;
        if ((req.user as any).rol === "admin") targetEmpresaId = (req.user as any).empresa_id;

        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({
            nombre,
            rut,
            email,
            password: hashed,
            rol,
            empresa_id: targetEmpresaId,
            centro_costo_id,
            estado: estado !== undefined ? estado : true,
            lastChangePassWord: new Date()
        });

        res.status(201).json(sanitizeUser(user));
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const update = async (
    req: Request<{ id: string }, {}, IUserUpdate>,
    res: Response
) => {
    try {
        const id = req.params.id;
        const data = req.body;
        const user = await User.findByPk(id);

        if (!user) return res.status(404).json({ message: "Usuario no existe" });

        if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== user.empresa_id)
            return res.status(403).json({ message: "No autorizado" });

        if (data.password) {
            data.password = await bcrypt.hash(data.password, 10);
            data.lastChangePassWord = new Date();
        } else {
            data.password = user.password;
            data.lastChangePassWord = user.lastChangePassWord;
        }

        if (data.rol === "superuser" && (req.user as any).rol !== "superuser")
            return res.status(403).json({ message: "No puedes asignar rol superuser" });

        if ((req.user as any).rol === "admin") data.empresa_id = user.empresa_id;

        await user.update(data);

        const updated = await User.findByPk(id);
        if (updated) {
            res.json(sanitizeUser(updated));
        } else {
            res.status(404).json({ message: "Usuario no existe" });
        }
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const remove = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const user = await User.findByPk(id);

        if (!user) return res.status(404).json({ message: "Usuario inexistente" });

        if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== user.empresa_id)
            return res.status(403).json({ message: "No autorizado" });

        await user.destroy();
        res.json({ message: "Eliminado" });
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const setEstado = async (req: Request<{ id: string }, {}, { estado: boolean }>, res: Response) => {
    try {
        const id = req.params.id;
        const { estado } = req.body;

        const user = await User.findByPk(id);
        if (!user) return res.status(404).json({ message: "Usuario no existe" });

        if ((req.user as any).rol === "admin" && (req.user as any).empresa_id !== user.empresa_id)
            return res.status(403).json({ message: "No autorizado" });

        user.estado = estado;
        await user.save();

        res.json(sanitizeUser(user));
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const setNewLogin = async (
    req: Request<{ id: string }, {}, { newLogin: boolean }>,
    res: Response
) => {
    try {
        const id = req.params.id;
        const { newLogin } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        // Verificar permisos
        const userRol = (req.user as any).rol;
        const userEmpresaId = (req.user as any).empresa_id;

        if (userRol !== "superuser") {
            return res.status(403).json({ message: "No autorizado para modificar usuarios" });
        }

        if (user.rol === "superuser" && userRol !== "superuser") {
            return res.status(403).json({ message: "No puedes modificar usuarios superuser" });
        }

        await user.update({ newLogin });

        const updatedUser = await User.findByPk(id);
        res.json({
            success: true,
            message: `newLogin ${newLogin ? 'activado' : 'desactivado'} correctamente`,
            user: sanitizeUser(updatedUser!)
        });
    } catch (err) {
        console.error("Error en setNewLogin:", err);
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const setNewLoginForEmpresa = async (
    req: Request<{ empresaId: string }, {}, { newLogin: boolean }>,
    res: Response
) => {
    try {
        const empresaId = parseInt(req.params.empresaId);
        const { newLogin } = req.body;

        if (isNaN(empresaId)) {
            return res.status(400).json({
                success: false,
                message: "ID de empresa inválido"
            });
        }

        const userRol = (req.user as any).rol;
        if (userRol !== "superuser") {
            return res.status(403).json({
                success: false,
                message: "No autorizado. Solo el superuser puede modificar usuarios de toda una empresa."
            });
        }

        // Verificar que la empresa exista
        const empresa = await Empresa.findByPk(empresaId);
        if (!empresa) {
            return res.status(404).json({
                success: false,
                message: "Empresa no encontrada"
            });
        }

        const whereCondition: any = {
            empresa_id: empresaId,
            rol: { [Op.ne]: "superuser" }
        };

        const [affectedCount] = await User.update(
            { newLogin },
            { where: whereCondition }
        );


        res.json({
            success: true,
            message: `newLogin ${newLogin ? 'activado' : 'desactivado'} para ${affectedCount} usuarios de la empresa "${empresa.nombre}"`,
            empresa: {
                id: empresa.id,
                nombre: empresa.nombre
            },
            statistics: {
                totalAffected: affectedCount,
                newLoginStatus: newLogin,
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