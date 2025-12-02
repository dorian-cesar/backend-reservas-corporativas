// src/controllers/empresa.controller.ts

import { Request, Response } from "express";
import { Empresa } from "../models/empresa.model";
import { IEmpresaCreate, IEmpresaUpdate } from "../interfaces/empresa.interface";

/**
 * Listar todas las empresas.
 */
export const listarEmpresas = async (req: Request, res: Response) => {
    const empresas = await Empresa.findAll();
    res.json(empresas);
};

/**
 * Obtener una empresa por ID.
 */
export const obtenerEmpresa = async (req: Request, res: Response) => {
    const empresa = await Empresa.findByPk(req.params.id);
    if (!empresa) return res.status(404).json({ message: "No encontrada" });
    res.json(empresa);
};

/**
 * Crear una empresa.
 */
export const crearEmpresa = async (
    req: Request<{}, {}, IEmpresaCreate>,
    res: Response
) => {
    const {
        nombre,
        estado,
        recargo,
        porcentaje_devolucion,
        dia_facturacion,
        dia_vencimiento,
        monto_maximo
    } = req.body;

    const empresa = await Empresa.create({
        nombre,
        estado,
        recargo,
        porcentaje_devolucion,
        dia_facturacion,
        dia_vencimiento,
        monto_maximo
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
