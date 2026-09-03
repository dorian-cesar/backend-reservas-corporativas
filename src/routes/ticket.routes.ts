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

// Listar tickets
router.get("/", authenticateJWT, checkPermission("tickets_ver_informacion_de_tickets"), getTickets);

// Crear ticket
router.post("/", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "contralor"), create);

// Buscar tickets por ticketNumber
router.get("/search", authenticateJWT, checkPermission("tickets_ver_informacion_de_tickets"), getTicketsByTicketNumber);

// Buscar tickets por empresa
router.get("/empresa/:id_empresa", authenticateJWT, checkPermission("tickets_ver_informacion_de_tickets"), getTicketsByEmpresa);
// Buscar tickets por id_User
router.get("/usuario/:id_User", authenticateJWT, checkPermission("tickets_ver_informacion_de_tickets"), getTicketsByUser);

// ver disponibilidad 
router.post("/disponibilidad", authenticateJWT, checkPermission("buscar_generar_buequeda_de_servicios", "tickets_ver_informacion_de_tickets"), checkDisponibilidad)

// Actualizar ticket
router.put("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "contralor"), update);

// Eliminar ticket
router.delete("/:id", authenticateJWT, checkPermission("tickets_anular_pasaje", "reservas_anular_pasaje"), remove);

// Cambiar estado del ticket
router.patch("/:id/status", authenticateJWT, checkPermission("tickets_anular_pasaje", "reservas_anular_pasaje"), setStatus);

export default router;
