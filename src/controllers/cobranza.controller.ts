import { Response } from "express";
import { Op } from "sequelize";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { CobranzaGestion } from "../models/cobranza_gestion.model";
import { Empresa } from "../models/empresa.model";
import { User } from "../models/user.model";

/**
 * Obtener listado de gestiones de cobranza con filtros, búsqueda y paginación
 */
export const getGestiones = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const offset = (page - 1) * limit;

    const {
      empresa_id,
      tipo_gestion,
      estado_gestion,
      search,
      fecha_desde,
      fecha_hasta,
    } = req.query;

    const where: any = {};

    if (empresa_id) {
      where.empresa_id = Number(empresa_id);
    }

    if (tipo_gestion && tipo_gestion !== "all") {
      where.tipo_gestion = tipo_gestion;
    }

    if (estado_gestion && estado_gestion !== "all") {
      where.estado_gestion = estado_gestion;
    }

    if (fecha_desde && fecha_hasta) {
      where.fecha_gestion = {
        [Op.between]: [
          new Date(`${fecha_desde}T00:00:00.000Z`),
          new Date(`${fecha_hasta}T23:59:59.999Z`),
        ],
      };
    } else if (fecha_desde) {
      where.fecha_gestion = {
        [Op.gte]: new Date(`${fecha_desde}T00:00:00.000Z`),
      };
    } else if (fecha_hasta) {
      where.fecha_gestion = {
        [Op.lte]: new Date(`${fecha_hasta}T23:59:59.999Z`),
      };
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      const searchVal = `%${search.trim()}%`;
      where[Op.or] = [
        { contacto_nombre: { [Op.like]: searchVal } },
        { contacto_email: { [Op.like]: searchVal } },
        { observaciones: { [Op.like]: searchVal } },
        { proxima_accion: { [Op.like]: searchVal } },
        { "$empresa.nombre$": { [Op.like]: searchVal } },
        { "$empresa.rut$": { [Op.like]: searchVal } },
      ];
    }

    const { count, rows } = await CobranzaGestion.findAndCountAll({
      where,
      include: [
        {
          model: Empresa,
          as: "empresa",
          attributes: [
            "id",
            "nombre",
            "rut",
            "cuenta_corriente",
            "contacto_fact_nombre",
            "contacto_fact_email",
            "contacto_fact_telefono",
          ],
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "email", "rol"],
        },
      ],
      order: [
        ["fecha_gestion", "DESC"],
        ["created_at", "DESC"],
      ],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      gestiones: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      limit,
    });
  } catch (error: any) {
    console.error("Error al obtener gestiones de cobranza:", error);
    return res.status(500).json({
      message: "Error al obtener las gestiones de cobranza",
      error: error.message,
    });
  }
};

/**
 * Obtener estadísticas globales del módulo de cobranza
 */
export const getCobranzaStats = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const totalGestiones = await CobranzaGestion.count();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    const gestionesMes = await CobranzaGestion.count({
      where: {
        fecha_gestion: {
          [Op.between]: [startOfMonth, endOfMonth],
        },
      },
    });

    const compromisosPago = await CobranzaGestion.count({
      where: {
        estado_gestion: "Compromiso de Pago",
      },
    });

    const enSeguimiento = await CobranzaGestion.count({
      where: {
        estado_gestion: "En Seguimiento",
      },
    });

    const totalCompromisosMonto =
      (await CobranzaGestion.sum("monto_compromiso", {
        where: {
          monto_compromiso: { [Op.ne]: null },
        },
      })) || 0;

    return res.json({
      totalGestiones,
      gestionesMes,
      compromisosPago,
      enSeguimiento,
      totalCompromisosMonto,
    });
  } catch (error: any) {
    console.error("Error al obtener estadísticas de cobranza:", error);
    return res.status(500).json({
      message: "Error al obtener estadísticas",
      error: error.message,
    });
  }
};

/**
 * Obtener una gestión por ID
 */
export const getGestionById = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const gestion = await CobranzaGestion.findByPk(id, {
      include: [
        {
          model: Empresa,
          as: "empresa",
          attributes: [
            "id",
            "nombre",
            "rut",
            "cuenta_corriente",
            "contacto_fact_nombre",
            "contacto_fact_email",
            "contacto_fact_telefono",
          ],
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "email", "rol"],
        },
      ],
    });

    if (!gestion) {
      return res
        .status(404)
        .json({ message: "Gestión de cobranza no encontrada" });
    }

    return res.json(gestion);
  } catch (error: any) {
    console.error("Error al obtener detalle de gestión:", error);
    return res.status(500).json({
      message: "Error al obtener detalle de la gestión",
      error: error.message,
    });
  }
};

/**
 * Obtener todas las gestiones de una empresa específica
 */
export const getGestionesByEmpresa = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { empresaId } = req.params;
    const gestiones = await CobranzaGestion.findAll({
      where: { empresa_id: Number(empresaId) },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "email", "rol"],
        },
      ],
      order: [["fecha_gestion", "DESC"]],
    });

    return res.json(gestiones);
  } catch (error: any) {
    console.error("Error al obtener gestiones de la empresa:", error);
    return res.status(500).json({
      message: "Error al obtener gestiones de la empresa",
      error: error.message,
    });
  }
};

/**
 * Crear un nuevo registro de gestión de cobranza
 */
export const createGestion = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const {
      empresa_id,
      tipo_gestion,
      estado_gestion,
      contacto_nombre,
      contacto_telefono,
      contacto_email,
      monto_compromiso,
      fecha_compromiso,
      observaciones,
      proxima_accion,
      fecha_proxima_accion,
      fecha_gestion,
    } = req.body;

    if (!empresa_id) {
      return res.status(400).json({ message: "La empresa es requerida" });
    }

    if (!tipo_gestion) {
      return res
        .status(400)
        .json({ message: "El tipo de gestión es requerido" });
    }

    const empresaExists = await Empresa.findByPk(empresa_id);
    if (!empresaExists) {
      return res
        .status(404)
        .json({ message: "La empresa seleccionada no existe" });
    }

    const nuevaGestion = await CobranzaGestion.create({
      empresa_id: Number(empresa_id),
      user_id: Number(userId),
      tipo_gestion: tipo_gestion || "Llamada Telefónica",
      estado_gestion: estado_gestion || "Contactado",
      contacto_nombre: contacto_nombre || null,
      contacto_telefono: contacto_telefono || null,
      contacto_email: contacto_email || null,
      monto_compromiso: monto_compromiso ? Number(monto_compromiso) : null,
      fecha_compromiso: fecha_compromiso || null,
      observaciones: observaciones || null,
      proxima_accion: proxima_accion || null,
      fecha_proxima_accion: fecha_proxima_accion || null,
      fecha_gestion: fecha_gestion ? new Date(fecha_gestion) : new Date(),
    });

    const gestionCompleta = await CobranzaGestion.findByPk(nuevaGestion.id, {
      include: [
        {
          model: Empresa,
          as: "empresa",
          attributes: ["id", "nombre", "rut"],
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "email"],
        },
      ],
    });

    return res.status(201).json({
      message: "Gestión de cobranza registrada exitosamente",
      gestion: gestionCompleta,
    });
  } catch (error: any) {
    console.error("Error al registrar gestión de cobranza:", error);
    return res.status(500).json({
      message: "Error al registrar la gestión de cobranza",
      error: error.message,
    });
  }
};

/**
 * Actualizar una gestión de cobranza existente
 */
export const updateGestion = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const gestion = await CobranzaGestion.findByPk(id);

    if (!gestion) {
      return res.status(404).json({ message: "Gestión no encontrada" });
    }

    const {
      tipo_gestion,
      estado_gestion,
      contacto_nombre,
      contacto_telefono,
      contacto_email,
      monto_compromiso,
      fecha_compromiso,
      observaciones,
      proxima_accion,
      fecha_proxima_accion,
      fecha_gestion,
    } = req.body;

    if (tipo_gestion) gestion.tipo_gestion = tipo_gestion;
    if (estado_gestion) gestion.estado_gestion = estado_gestion;
    if (contacto_nombre !== undefined)
      gestion.contacto_nombre = contacto_nombre;
    if (contacto_telefono !== undefined)
      gestion.contacto_telefono = contacto_telefono;
    if (contacto_email !== undefined) gestion.contacto_email = contacto_email;
    if (monto_compromiso !== undefined) {
      gestion.monto_compromiso = monto_compromiso
        ? Number(monto_compromiso)
        : null;
    }
    if (fecha_compromiso !== undefined)
      gestion.fecha_compromiso = fecha_compromiso || null;
    if (observaciones !== undefined) gestion.observaciones = observaciones;
    if (proxima_accion !== undefined) gestion.proxima_accion = proxima_accion;
    if (fecha_proxima_accion !== undefined) {
      gestion.fecha_proxima_accion = fecha_proxima_accion || null;
    }
    if (fecha_gestion) gestion.fecha_gestion = new Date(fecha_gestion);

    await gestion.save();

    const gestionActualizada = await CobranzaGestion.findByPk(id, {
      include: [
        {
          model: Empresa,
          as: "empresa",
          attributes: ["id", "nombre", "rut"],
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "email"],
        },
      ],
    });

    return res.json({
      message: "Gestión actualizada exitosamente",
      gestion: gestionActualizada,
    });
  } catch (error: any) {
    console.error("Error al actualizar gestión de cobranza:", error);
    return res.status(500).json({
      message: "Error al actualizar la gestión",
      error: error.message,
    });
  }
};

/**
 * Eliminar un registro de gestión de cobranza
 */
export const deleteGestion = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const gestion = await CobranzaGestion.findByPk(id);

    if (!gestion) {
      return res.status(404).json({ message: "Gestión no encontrada" });
    }

    await gestion.destroy();

    return res.json({ message: "Gestión eliminada exitosamente" });
  } catch (error: any) {
    console.error("Error al eliminar gestión de cobranza:", error);
    return res.status(500).json({
      message: "Error al eliminar la gestión",
      error: error.message,
    });
  }
};
