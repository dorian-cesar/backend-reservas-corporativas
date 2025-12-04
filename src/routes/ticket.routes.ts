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
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Listar tickets
router.get("/", authenticateJWT, authorizeRoles("superuser", "admin", "auditoria", "contralor"), getTickets);

// Crear ticket
router.post("/", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "contralor"), create);

// Buscar tickets por ticketNumber (solo rol 'user')
router.get("/search", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), getTicketsByTicketNumber);

// Buscar tickets por empresa
router.get("/empresa/:id_empresa", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), getTicketsByEmpresa);
// Buscar tickets por id_User
router.get("/usuario/:id_User", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), getTicketsByUser);

// ver disponibilidad 
router.post("/disponibilidad", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "contralor"), checkDisponibilidad)

// Actualizar ticket
router.put("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "contralor"), update);

// Eliminar ticket
router.delete("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), remove);

// Cambiar estado del ticket
router.patch("/:id/status", authenticateJWT, authorizeRoles("superuser", "admin", "contralor"), setStatus);

export default router;
