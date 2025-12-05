import { Request, Response } from "express";
import { Pasajero } from "../models/pasajero.model";
import { Empresa } from "../models/empresa.model";
import { Op } from "sequelize";

/**
 * Listar pasajeros con filtros opcionales.
 */
export const getPasajeros = async (
    req: Request<{}, {}, {}, {
        nombre?: string;
        rut?: string;
        correo?: string;
        id_empresa?: string;
    }>,
    res: Response
) => {
    try {
        const { nombre, rut, correo, id_empresa } = req.query;

        const whereClause: any = {};

        if (nombre) {
            whereClause.nombre = { [Op.like]: `%${nombre}%` };
        }

        if (rut) {
            whereClause.rut = { [Op.like]: `%${rut}%` };
        }

        if (correo) {
            whereClause.correo = { [Op.like]: `%${correo}%` };
        }

        if (id_empresa) {
            whereClause.id_empresa = parseInt(id_empresa, 10);
        }

        const pasajeros = await Pasajero.findAll({
            where: whereClause,
            include: [
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut', 'cuenta_corriente', 'estado']
                }
            ],
            order: [['nombre', 'ASC']]
        });

        const pasajerosJSON = pasajeros.map(pasajero => pasajero.toJSON());

        res.json(pasajerosJSON);
    } catch (err) {
        console.error('Error obteniendo pasajeros:', err);
        res.status(500).json({ message: "Error en servidor", error: (err as Error).message });
    }
};

/**
 * Obtener pasajero por ID.
 */
export const getPasajeroById = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    try {
        const id = parseInt(req.params.id, 10);

        const pasajero = await Pasajero.findByPk(id, {
            include: [
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut', 'cuenta_corriente', 'estado']
                }
            ]
        });

        if (!pasajero) {
            return res.status(404).json({ message: "Pasajero no encontrado" });
        }

        const pasajeroJSON = pasajero.toJSON();

        res.json(pasajeroJSON);
    } catch (err) {
        console.error('Error obteniendo pasajero:', err);
        res.status(500).json({ message: "Error en servidor", error: (err as Error).message });
    }
};

/**
 * Crear nuevo pasajero.
 */
export const createPasajero = async (
    req: Request<{}, {}, {
        nombre: string;
        rut: string;
        correo: string;
        id_empresa: number;
    }>,
    res: Response
) => {
    try {
        const { nombre, rut, correo, id_empresa } = req.body;

        if (!nombre || !rut || !correo || !id_empresa) {
            return res.status(400).json({ message: "faltan campos obligatorios" });
        }

        const empresa = await Empresa.findByPk(id_empresa);
        if (!empresa) {
            return res.status(404).json({ message: "Empresa no encontrada" });
        }

        const empresaJSON = empresa.toJSON();

        const pasajeroExistente = await Pasajero.findOne({
            where: {
                rut: rut
            }
        });

        if (pasajeroExistente) {
            const pasajeroExistenteJSON = pasajeroExistente.toJSON();
            return res.status(400).json({
                message: "Ya existe un pasajero con este RUT",
                detalles: {
                    pasajeroId: pasajeroExistenteJSON.id,
                    pasajeroNombre: pasajeroExistenteJSON.nombre
                }
            });
        }

        const pasajero = await Pasajero.create({
            nombre,
            rut,
            correo,
            id_empresa
        });

        const pasajeroJSON = pasajero.toJSON();

        res.status(201).json({
            ...pasajeroJSON,
            empresa: empresaJSON, // Incluir datos de la empresa
            message: "Pasajero creado exitosamente"
        });
    } catch (err) {
        console.error('Error creando pasajero:', err);
        res.status(500).json({ message: "Error en servidor", error: (err as Error).message });
    }
};

/**
 * Actualizar pasajero.
 */
export const updatePasajero = async (
    req: Request<{ id: string }, {}, {
        nombre?: string;
        rut?: string;
        correo?: string;
        id_empresa?: number;
    }>,
    res: Response
) => {
    try {
        const id = parseInt(req.params.id, 10);
        const data = req.body;

        const pasajero = await Pasajero.findByPk(id);
        if (!pasajero) {
            return res.status(404).json({ message: "Pasajero no encontrado" });
        }

        const pasajeroActualJSON = pasajero.toJSON();

        if (data.rut && data.rut !== pasajeroActualJSON.rut) {
            const empresaId = data.id_empresa || pasajeroActualJSON.id_empresa;

            const pasajeroConMismoRut = await Pasajero.findOne({
                where: {
                    rut: data.rut,
                    id_empresa: empresaId,
                    id: { [Op.ne]: id }
                }
            });

            if (pasajeroConMismoRut) {
                const pasajeroConMismoRutJSON = pasajeroConMismoRut.toJSON();
                return res.status(400).json({
                    message: "Ya existe otro pasajero con este RUT en la empresa",
                    detalles: {
                        pasajeroId: pasajeroConMismoRutJSON.id,
                        pasajeroNombre: pasajeroConMismoRutJSON.nombre
                    }
                });
            }
        }

        if (data.id_empresa && data.id_empresa !== pasajeroActualJSON.id_empresa) {
            const nuevaEmpresa = await Empresa.findByPk(data.id_empresa);
            if (!nuevaEmpresa) {
                return res.status(404).json({ message: "La empresa indicada no existe" });
            }
        }

        await pasajero.update(data);
        const pasajeroActualizado = await Pasajero.findByPk(id, {
            include: [
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut']
                }
            ]
        });

        if (!pasajeroActualizado) {
            return res.status(500).json({ message: "Error al obtener pasajero actualizado" });
        }

        const pasajeroActualizadoJSON = pasajeroActualizado.toJSON();

        res.json({
            ...pasajeroActualizadoJSON,
            message: "Pasajero actualizado exitosamente"
        });
    } catch (err) {
        console.error('Error actualizando pasajero:', err);
        res.status(500).json({ message: "Error en servidor", error: (err as Error).message });
    }
};

/**
 * Eliminar pasajero.
 */
export const deletePasajero = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    try {
        const id = parseInt(req.params.id, 10);

        const pasajero = await Pasajero.findByPk(id);
        if (!pasajero) {
            return res.status(404).json({ message: "Pasajero no encontrado" });
        }

        const pasajeroJSON = pasajero.toJSON();

        await pasajero.destroy();

        res.json({
            message: "Pasajero eliminado exitosamente",
            pasajeroEliminado: {
                id: pasajeroJSON.id,
                nombre: pasajeroJSON.nombre,
                rut: pasajeroJSON.rut,
                correo: pasajeroJSON.correo
            }
        });
    } catch (err) {
        console.error('Error eliminando pasajero:', err);
        res.status(500).json({ message: "Error en servidor", error: (err as Error).message });
    }
};

/**
 * Verificar si un pasajero existe por RUT y empresa.
 */
export const verificarPasajeroExistente = async (
    req: Request<{}, {}, {}, { rut: string; id_empresa: string }>,
    res: Response
) => {
    try {
        const { rut, id_empresa } = req.query;

        if (!rut || !id_empresa) {
            return res.status(400).json({
                message: "Se requieren los parámetros 'rut' e 'id_empresa'"
            });
        }

        const empresaId = parseInt(id_empresa, 10);

        const pasajero = await Pasajero.findOne({
            where: {
                rut: rut,
                id_empresa: empresaId
            },
            include: [
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut']
                }
            ]
        });

        if (pasajero) {
            const pasajeroJSON = pasajero.toJSON();
            return res.json({
                existe: true,
                pasajero: pasajeroJSON
            });
        } else {
            return res.json({
                existe: false,
                message: "No se encontró pasajero con ese RUT en la empresa"
            });
        }
    } catch (err) {
        console.error('Error verificando pasajero:', err);
        res.status(500).json({ message: "Error en servidor", error: (err as Error).message });
    }
};