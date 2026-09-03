// src/routes/ticket.routes.ts

import { Router } from "express";
import {
    getTickets,
    create,
    update,
    remove,
    setStatus,
    getTicketsByTicketNumber, getTicketsByEmpresa, getTicketsByUser,
    checkDisponibilidad,
} from "../controllers/ticket.controller";
import { authenticateJWT, authorizeRoles, checkPermission } from "../middleware/auth.middleware";

const router = Router();

// Listar tickets (panel administrativo de Boletos de la empresa)
router.get("/", authenticateJWT, checkPermission("tickets_ver_informacion_de_tickets"), getTickets);

// Crear ticket
router.post("/", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "contralor"), create);

// Buscar tickets por ticketNumber
router.get("/search", authenticateJWT, checkPermission("tickets_ver_informacion_de_tickets"), getTicketsByTicketNumber);

// Buscar tickets por empresa (panel administrativo de Boletos)
router.get("/empresa/:id_empresa", authenticateJWT, checkPermission("tickets_ver_informacion_de_tickets"), getTicketsByEmpresa);

// Buscar tickets por id_User (panel Mis Reservas del subusuario/usuario)
router.get("/usuario/:id_User", authenticateJWT, checkPermission("reservas_ver_informacion_de_reservas"), getTicketsByUser);

// Ver disponibilidad (búsqueda de servicios)
router.post("/disponibilidad", authenticateJWT, checkPermission("buscar_generar_buequeda_de_servicios", "tickets_ver_informacion_de_tickets"), checkDisponibilidad);

// Actualizar ticket
router.put("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "contralor"), update);

// Eliminar / Anular ticket
router.delete("/:id", authenticateJWT, checkPermission("tickets_anular_pasaje", "reservas_anular_pasaje"), remove);

// Cambiar estado del ticket
router.patch("/:id/status", authenticateJWT, checkPermission("tickets_anular_pasaje", "reservas_anular_pasaje"), setStatus);

export default router;
