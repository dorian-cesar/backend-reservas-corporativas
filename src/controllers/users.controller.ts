// src/controllers/users.controller.ts
import { Request, Response } from "express";
import * as bcrypt from "bcrypt";
import { User } from "../models/user.model";
import { IUserCreate, IUserUpdate } from "../interfaces/user.interface";
import { Empresa } from "../models/empresa.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Op } from "sequelize";

export const getUsers = async (req: Request, res: Response) => {
    try {
        const rol = (req.user as any).rol;
        const empresa_id = (req.user as any).empresa_id;

        if (rol === "admin") {
            const users = await User.findAll({
                where: {
                    empresa_id,
                    rol: { [Op.ne]: "superuser" }
                }
            });
            return res.json(users);
        }

        if (rol === "superuser") {
            const users = await User.findAll({
                where: {
                    rol: { [Op.ne]: "superuser" }
                }
            });
            return res.json(users);
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

        const userData = user.toJSON();
        delete userData.password;

        res.json(userData);
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
        });

        const userData = user.toJSON();
        delete userData.password;

        res.status(201).json(userData);
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

        if (data.password) data.password = await bcrypt.hash(data.password, 10);
        else data.password = user.password;

        if (data.rol === "superuser" && (req.user as any).rol !== "superuser")
            return res.status(403).json({ message: "No puedes asignar rol superuser" });

        if ((req.user as any).rol === "admin") data.empresa_id = user.empresa_id;

        await user.update(data);

        const updated = await User.findByPk(id);
        if (updated) {
            const updatedData = updated.toJSON();
            delete updatedData.password;
            res.json(updatedData);
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

        const userData = user.toJSON();
        delete userData.password;

        res.json(userData);
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};
