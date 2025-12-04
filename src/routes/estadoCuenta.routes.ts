// src/routes/estadoCuenta.routes.ts

import { Router } from "express";
import { pagarEstadoCuenta, listarEstadosCuenta, listarTicketsDeEstadoCuenta } from "../controllers/estadoCuenta.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), listarEstadosCuenta);
router.get("/:id/tickets", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), listarTicketsDeEstadoCuenta)
router.post("/pagar", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), pagarEstadoCuenta);

export default router;
