import { Request, Response } from "express";
import { UserEmpresa } from "../models/user_empresa.model";
import { User } from "../models/user.model";
import { Empresa } from "../models/empresa.model";
import { Op } from "sequelize";

export const assignEmpresaToUser = async (req: Request, res: Response) => {
    try {
        const { user_id, empresa_id } = req.body;

        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        const empresa = await Empresa.findByPk(empresa_id);
        if (!empresa) {
            return res.status(404).json({ message: "Empresa no existe" });
        }

        const existing = await UserEmpresa.findOne({
            where: {
                user_id,
                empresa_id
            }
        });

        if (existing) {
            return res.status(400).json({ message: "La empresa ya está asignada a este usuario" });
        }

        const userEmpresa = await UserEmpresa.create({
            user_id,
            empresa_id
        });

        res.status(201).json({
            message: "Empresa asignada al usuario correctamente",
            data: userEmpresa
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};


export const getEmpresasByUserId = async (req: Request, res: Response) => {
    try {
        const { user_id } = req.params;

        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        const userEmpresas = await UserEmpresa.findAll({
            where: { user_id },
            include: [
                {
                    model: Empresa,
                    as: "empresa",
                    attributes: ['id', 'nombre', 'rut', 'estado']
                }
            ]
        });

        const empresas = userEmpresas.map(ue => ue.empresa);

        res.json({
            user_id: parseInt(user_id),
            empresas,
            total: empresas.length
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const getEmpresaIdsByUserId = async (req: Request, res: Response) => {
    try {
        const { user_id } = req.params;

        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        const userEmpresas = await UserEmpresa.findAll({
            where: { user_id },
            attributes: ['empresa_id']
        });

        const empresaIds = userEmpresas.map(ue => ue.empresa_id);

        res.json({
            user_id: parseInt(user_id),
            empresa_ids: empresaIds,
            total: empresaIds.length
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const removeEmpresaFromUser = async (req: Request, res: Response) => {
    try {
        const { user_id, empresa_id } = req.body;

        const userEmpresa = await UserEmpresa.findOne({
            where: {
                user_id,
                empresa_id
            }
        });

        if (!userEmpresa) {
            return res.status(404).json({ message: "Relación no encontrada" });
        }

        await userEmpresa.destroy();

        res.json({
            message: "Empresa desasignada del usuario correctamente"
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};

export const assignMultipleEmpresasToUser = async (req: Request, res: Response) => {
    try {
        const { user_id, empresa_ids } = req.body;

        // Validar que el usuario existe
        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ message: "Usuario no existe" });
        }

        // Validar que todas las empresas existen
        const empresas = await Empresa.findAll({
            where: {
                id: {
                    [Op.in]: empresa_ids
                }
            }
        });

        if (empresas.length !== empresa_ids.length) {
            return res.status(404).json({ message: "Una o más empresas no existen" });
        }

        // Verificar relaciones existentes
        const existingRelations = await UserEmpresa.findAll({
            where: {
                user_id,
                empresa_id: {
                    [Op.in]: empresa_ids
                }
            }
        });

        const existingIds = existingRelations.map(er => er.empresa_id);
        const newIds = empresa_ids.filter((id: number) => {
            return !existingIds.includes(id);
        });

        if (newIds.length === 0) {
            return res.status(400).json({
                message: "Todas las empresas ya están asignadas a este usuario"
            });
        }

        // Crear las nuevas relaciones
        const relationsToCreate = newIds.map((empresa_id: number) => ({
            user_id,
            empresa_id
        }));

        await UserEmpresa.bulkCreate(relationsToCreate);

        res.status(201).json({
            message: `${newIds.length} empresas asignadas al usuario correctamente`,
            assigned: newIds,
            already_assigned: existingIds
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};


export const getUsersByEmpresaId = async (req: Request, res: Response) => {
    try {
        const { empresa_id } = req.params;

        const empresa = await Empresa.findByPk(empresa_id);
        if (!empresa) {
            return res.status(404).json({ message: "Empresa no existe" });
        }

        const userEmpresas = await UserEmpresa.findAll({
            where: { empresa_id },
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ['id', 'nombre', 'email', 'rol', 'estado']
                }
            ]
        });

        const users = userEmpresas.map(ue => ue.user);

        res.json({
            empresa_id: parseInt(empresa_id),
            users,
            total: users.length
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};