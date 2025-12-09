import { Request, Response } from "express";
import { Pasajero } from "../models/pasajero.model";
import { Empresa } from "../models/empresa.model";
import { CentroCosto } from "../models/centro_costo.model";
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
        id_centro_costo?: string;
    }>,
    res: Response
) => {
    try {
        const { nombre, rut, correo, id_empresa, id_centro_costo } = req.query;

        const whereClause: any = {};

        if (rut) {
            whereClause.rut = String(rut);
        }

        if (correo) {
            whereClause.correo = String(correo);
        }

        if (id_empresa) {
            whereClause.id_empresa = parseInt(id_empresa, 10);
        }

        if (id_centro_costo) {
            whereClause.id_centro_costo = parseInt(id_centro_costo, 10);
        }

        const pasajeros = await Pasajero.findAll({
            where: whereClause,
            include: [
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut', 'cuenta_corriente', 'estado']
                },
                {
                    model: CentroCosto,
                    attributes: ['id', 'nombre', 'estado'],
                    required: false // LEFT JOIN para permitir NULL
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
        telefono?: string;
        id_empresa: number;
        id_centro_costo?: number;
    }>,
    res: Response
) => {
    try {
        const { nombre, rut, correo, telefono, id_empresa, id_centro_costo } = req.body;

        if (!nombre || !rut || !correo || !id_empresa) {
            return res.status(400).json({ message: "faltan campos obligatorios" });
        }

        const empresa = await Empresa.findByPk(id_empresa);
        if (!empresa) {
            return res.status(404).json({ message: "Empresa no encontrada" });
        }

        const empresaJSON = empresa.toJSON();

        if (id_centro_costo) {
            const centroCosto = await CentroCosto.findOne({
                where: {
                    id: id_centro_costo,
                    empresa_id: id_empresa
                }
            });

            if (!centroCosto) {
                return res.status(400).json({
                    message: "El centro de costo no existe o no pertenece a la empresa seleccionada",
                    detalles: {
                        id_centro_costo,
                        id_empresa
                    }
                });
            }
        }

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

        const pasajeroConMismoCorreo = await Pasajero.findOne({
            where: {
                correo: correo
            }
        });

        if (pasajeroConMismoCorreo) {
            const pasajeroConMismoCorreoJSON = pasajeroConMismoCorreo.toJSON();
            return res.status(400).json({
                message: "Ya existe un pasajero con este correo electrónico",
                detalles: {
                    pasajeroId: pasajeroConMismoCorreoJSON.id,
                    pasajeroNombre: pasajeroConMismoCorreoJSON.nombre,
                    empresa: pasajeroConMismoCorreoJSON.id_empresa
                }
            });
        }


        console.log('RUT recibido:', rut);
        console.log('Correo recibido:', correo);
        console.log('Empresa ID:', id_empresa);



        const pasajero = await Pasajero.create({
            nombre,
            rut,
            correo,
            telefono,
            id_empresa,
            id_centro_costo: id_centro_costo || 1
        });

        const pasajeroConRelaciones = await Pasajero.findByPk(pasajero.id, {
            include: [
                {
                    model: Empresa,
                    attributes: ['id', 'nombre', 'rut']
                },
                {
                    model: CentroCosto,
                    attributes: ['id', 'nombre'],
                    required: false
                }
            ]
        });

        if (!pasajeroConRelaciones) {
            return res.status(500).json({ message: "Error al obtener pasajero creado" });
        }

        const pasajeroJSON = pasajeroConRelaciones.toJSON();

        res.status(201).json({
            ...pasajeroJSON,
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
        telefono?: string;
        id_empresa?: number;
        id_centro_costo?: number;
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


        if (data.id_centro_costo !== undefined) {
            const empresaId = data.id_empresa || pasajeroActualJSON.id_empresa;

            if (data.id_centro_costo === null) {
                data.id_centro_costo = 1;
            } else if (data.id_centro_costo) {
                const centroCosto = await CentroCosto.findOne({
                    where: {
                        id: data.id_centro_costo,
                        empresa_id: empresaId
                    }
                });

                if (!centroCosto) {
                    return res.status(400).json({
                        message: "El centro de costo no existe o no pertenece a la empresa",
                        detalles: {
                            id_centro_costo: data.id_centro_costo,
                            id_empresa: empresaId
                        }
                    });
                }
            }
        }


        if (data.rut && data.rut !== pasajeroActualJSON.rut) {

            const pasajeroConMismoRut = await Pasajero.findOne({
                where: {
                    rut: data.rut,
                    id: { [Op.ne]: id }
                }
            });

            if (pasajeroConMismoRut) {
                const pasajeroConMismoRutJSON = pasajeroConMismoRut.toJSON();
                return res.status(400).json({
                    message: "Ya existe otro pasajero con este RUT",
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
                correo: pasajeroJSON.correo,
                telefono: pasajeroJSON.telefono
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