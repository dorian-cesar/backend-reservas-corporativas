import { Request, Response } from "express";
import { Reclamo } from "../models/reclamo.model";
import { Ticket } from "../models/ticket.model";
import { Empresa } from "../models/empresa.model";
import { User } from "../models/user.model";
import { Pasajero } from "../models/pasajero.model";
import { Op } from "sequelize";
import {
  sendReclamoIngresadoEmail,
  sendReclamoAceptadoEmail,
  sendReclamoRechazadoEmail,
  determinarEdpInfo,
} from "../services/mail.service";

export const crearReclamo = async (req: Request, res: Response) => {
  try {
    const { ticket_id, motivo, descripcion } = req.body;

    if (!ticket_id || !motivo || !descripcion) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (ticket.ticketStatus !== "Confirmed") {
      return res.status(400).json({
        message: "Solo se pueden ingresar reclamos de tickets confirmados",
      });
    }

    const reclamoExistente = await Reclamo.findOne({
      where: {
        ticket_id,
        estado: {
          [Op.in]: ["Pendiente", "Aceptado"],
        },
      },
    });

    if (reclamoExistente) {
      return res.status(400).json({
        message: "Ya existe un reclamo en proceso o aceptado para este ticket",
      });
    }

    const userId = (req as any).user?.id || null;

    const nuevoReclamo = await Reclamo.create({
      ticket_id,
      user_id: userId,
      motivo,
      descripcion,
      estado: "Pendiente",
      fecha_creacion: new Date(),
    });

    // ── Enviar email de notificación (no bloquea la respuesta) ──────────────
    try {
      const ticketConDatos = await Ticket.findByPk(ticket_id, {
        include: [
          { model: User, attributes: ["id", "nombre", "email"] },
          { model: Empresa, attributes: ["ejecutivo_com_nombre", "ejecutivo_com_email"] },
        ],
      });

      if (ticketConDatos) {
        const userReclamador = ticketConDatos.user;
        const empresa = ticketConDatos.empresa;

        await sendReclamoIngresadoEmail({
          reclamoId: nuevoReclamo.id,
          ticketNumber: ticketConDatos.ticketNumber,
          origin: ticketConDatos.origin,
          destination: ticketConDatos.destination,
          travelDate: ticketConDatos.travelDate,
          motivo,
          descripcion,
          userName: userReclamador?.nombre || "Usuario",
          userEmail: userReclamador?.email || "",
          ejecutivoNombre: empresa?.ejecutivo_com_nombre || undefined,
          ejecutivoEmail: empresa?.ejecutivo_com_email || undefined,
        });
      }
    } catch (mailErr) {
      console.error("[Reclamo] Error enviando email de ingreso:", mailErr);
    }
    // ───────────────────────────────────────────────────────────────────────

    return res
      .status(201)
      .json({ message: "Reclamo creado exitosamente", reclamo: nuevoReclamo });
  } catch (error) {
    console.error("Error al crear reclamo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const listarReclamos = async (req: Request, res: Response) => {
  try {
    const { estado } = req.query;
    let whereClause = {};

    if (estado) {
      whereClause = { estado: String(estado) };
    }

    const reclamos = await Reclamo.findAll({
      where: whereClause,
      include: [
        { model: User, attributes: ["id", "nombre", "email"] },
        {
          model: Ticket,
          include: [
            { model: User, attributes: ["id", "nombre", "email"] },
            {
              model: Empresa,
              attributes: ["id", "nombre", "rut", "porcentaje_devolucion"],
            },
            { model: Pasajero, attributes: ["id", "nombre", "rut"] },
          ],
        },
      ],
      order: [["fecha_creacion", "DESC"]],
    });

    return res.status(200).json(reclamos);
  } catch (error) {
    console.error("Error al listar reclamos:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const resolverReclamo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { accion, motivo_rechazo } = req.body; // accion: 'aceptar' | 'rechazar'

    if (!accion || (accion !== "aceptar" && accion !== "rechazar")) {
      return res.status(400).json({ message: "Acción inválida" });
    }

    const reclamo = await Reclamo.findByPk(id, {
      include: [
        {
          model: Ticket,
          include: [{ model: Empresa }, { model: User }],
        },
      ],
    });

    if (!reclamo) {
      return res.status(404).json({ message: "Reclamo no encontrado" });
    }

    if (reclamo.estado !== "Pendiente") {
      return res.status(400).json({ message: "El reclamo ya fue resuelto" });
    }

    if (accion === "rechazar") {
      if (!motivo_rechazo) {
        return res
          .status(400)
          .json({ message: "Debe proporcionar un motivo de rechazo" });
      }

      await reclamo.update({
        estado: "Rechazado",
        motivo_rechazo,
        fecha_resolucion: new Date(),
      });

      // ── Email rechazo ──────────────────────────────────────────────────────
      try {
        const ticketDatos = reclamo.ticket;
        const userReclamador = ticketDatos?.user;
        const empresa = ticketDatos?.empresa;

        if (userReclamador?.email) {
          await sendReclamoRechazadoEmail({
            reclamoId: reclamo.id,
            ticketNumber: ticketDatos?.ticketNumber || "",
            origin: ticketDatos?.origin || "",
            destination: ticketDatos?.destination || "",
            travelDate: ticketDatos?.travelDate || "",
            motivo: reclamo.motivo,
            descripcion: reclamo.descripcion,
            userName: userReclamador.nombre || "Usuario",
            userEmail: userReclamador.email,
            motivoRechazo: motivo_rechazo,
            ejecutivoNombre: empresa?.ejecutivo_com_nombre || undefined,
            ejecutivoEmail: empresa?.ejecutivo_com_email || undefined,
          });
        }
      } catch (mailErr) {
        console.error("[Reclamo] Error enviando email de rechazo:", mailErr);
      }
      // ───────────────────────────────────────────────────────────────────────

      return res
        .status(200)
        .json({ message: "Reclamo rechazado exitosamente", reclamo });
    }

    if (accion === "aceptar") {
      const ticket = reclamo.ticket;
      let empresa: Empresa | null | undefined = ticket?.empresa;

      if (ticket && !empresa) {
        const empresaId = ticket.id_empresa || ticket.user?.empresa_id;
        if (empresaId) {
          empresa = await Empresa.findByPk(empresaId);
        }
      }

      if (!ticket || !empresa) {
        return res
          .status(500)
          .json({ message: "No se encontró el ticket o la empresa asociada" });
      }

      const porcentajeDevolucion = Number(empresa.porcentaje_devolucion) || 0;
      const montoReembolso = Math.round(
        Number(ticket.monto_boleto) * porcentajeDevolucion,
      );

      const nuevoDescuentoPendiente =
        (Number(empresa.descuento_pendiente_edp) || 0) + montoReembolso;

      await empresa.update({
        descuento_pendiente_edp: nuevoDescuentoPendiente,
      });

      await reclamo.update({
        estado: "Aceptado",
        fecha_resolucion: new Date(),
      });

      // ── Email aceptación ───────────────────────────────────────────────────
      try {
        const ticketDatos = reclamo.ticket;
        const userReclamador = ticketDatos?.user;

        if (userReclamador?.email) {
          await sendReclamoAceptadoEmail({
            reclamoId: reclamo.id,
            ticketNumber: ticketDatos?.ticketNumber || "",
            origin: ticketDatos?.origin || "",
            destination: ticketDatos?.destination || "",
            travelDate: ticketDatos?.travelDate || "",
            motivo: reclamo.motivo,
            descripcion: reclamo.descripcion,
            userName: userReclamador.nombre || "Usuario",
            userEmail: userReclamador.email,
            montoReembolso: montoReembolso || undefined,
            edpInfo: determinarEdpInfo(empresa?.dia_facturacion ?? null),
            ejecutivoNombre: empresa?.ejecutivo_com_nombre || undefined,
            ejecutivoEmail: empresa?.ejecutivo_com_email || undefined,
          });
        }
      } catch (mailErr) {
        console.error("[Reclamo] Error enviando email de aceptación:", mailErr);
      }
      // ───────────────────────────────────────────────────────────────────────

      return res
        .status(200)
        .json({ message: "Reclamo aceptado exitosamente", reclamo });
    }
  } catch (error) {
    console.error("Error al resolver reclamo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
