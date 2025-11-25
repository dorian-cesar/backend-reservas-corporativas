// src/routes/ticket.routes.ts

import { Router } from "express";
import {
    getTickets,
    create,
    update,
    remove,
    setStatus,
} from "../controllers/ticket.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Listar tickets
router.get("/", authenticateJWT, authorizeRoles("superuser", "admin"), getTickets);

// Crear ticket
router.post("/", authenticateJWT, authorizeRoles("superuser", "admin"), create);

// Actualizar ticket
router.put("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), update);

// Eliminar ticket
router.delete("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), remove);

// Cambiar estado del ticket
router.patch("/:id/status", authenticateJWT, authorizeRoles("superuser", "admin"), setStatus);

export default router;
