import { Request, Response } from "express";
import { CentroCosto } from "../models/centro_costo.model";
import { ICentroCostoCreate, ICentroCostoUpdate } from "../interfaces/centroCosto.interface";

// Listar centros de costo por empresa
export const listarCentrosCosto = async (req: Request, res: Response) => {
    try {
        const { empresa_id } = req.params;
        const centros = await CentroCosto.findAll({
            where: { empresa_id },
            order: [["nombre", "ASC"]],
        });
        res.json(centros);
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

// Obtener un centro de costo específico
export const obtenerCentroCosto = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const centro = await CentroCosto.findByPk(id);
        if (!centro) return res.status(404).json({ message: "No encontrado" });
        res.json(centro);
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

// Crear un centro de costo
export const crearCentroCosto = async (
    req: Request<{}, {}, ICentroCostoCreate>,
    res: Response
) => {
    try {
        const { nombre, empresa_id, estado } = req.body;
        const centro = await CentroCosto.create({ nombre, empresa_id, estado });
        res.status(201).json(centro);
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

// Actualizar un centro de costo
export const actualizarCentroCosto = async (
    req: Request<{ id: string }, {}, ICentroCostoUpdate>,
    res: Response
) => {
    try {
        const { id } = req.params;
        const centro = await CentroCosto.findByPk(id);
        if (!centro) return res.status(404).json({ message: "No encontrado" });
        await centro.update(req.body);
        res.json({ message: "Centro de costo actualizado" });
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};

// Eliminar un centro de costo
export const eliminarCentroCosto = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const centro = await CentroCosto.findByPk(id);
        if (!centro) return res.status(404).json({ message: "No encontrado" });
        await centro.destroy();
        res.json({ message: "Centro de costo eliminado" });
    } catch (err) {
        res.status(500).json({ message: "Error en servidor" });
    }
};
