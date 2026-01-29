// src/routes/estadoCuenta.routes.ts

import { Router } from "express";
import { listarEstadosCuenta, listarTicketsDeEstadoCuenta, aplicarDescuentoEstadoCuenta, revertirDescuentoEstadoCuenta, obtenerDescuentoEstadoCuenta } from "../controllers/estadoCuenta.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor", "admincc"), listarEstadosCuenta);
router.get("/:id/tickets", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), listarTicketsDeEstadoCuenta)
// router.post("/pagar", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), pagarEstadoCuenta);
router.post("/:id/aplicar-descuento", authenticateJWT, authorizeRoles("superuser", "auditoria"), aplicarDescuentoEstadoCuenta);
router.post("/:id/revertir-descuento", authenticateJWT, authorizeRoles("superuser", "auditoria"), revertirDescuentoEstadoCuenta);
router.get("/:id/descuento", authenticateJWT, authorizeRoles("superuser", "auditoria"), obtenerDescuentoEstadoCuenta);

export default router;
