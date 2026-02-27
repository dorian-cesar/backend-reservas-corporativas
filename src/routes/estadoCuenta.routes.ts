// src/routes/estadoCuenta.routes.ts

import { Router } from "express";
import { listarEstadosCuenta, listarTicketsDeEstadoCuenta, aplicarDescuentoEstadoCuenta, revertirDescuentoEstadoCuenta, obtenerDescuentoEstadoCuenta, ejecutarEDPManual } from "../controllers/estadoCuenta.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor", "admincc"), listarEstadosCuenta);
router.get("/:id/tickets", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor", "admincc"), listarTicketsDeEstadoCuenta)
router.post("/ejecutar-edp-manual", authenticateJWT, authorizeRoles("superuser", "auditoria", "admincc"), ejecutarEDPManual);
router.post("/:id/aplicar-descuento", authenticateJWT, authorizeRoles("superuser", "auditoria", "admincc"), aplicarDescuentoEstadoCuenta);
router.post("/:id/revertir-descuento", authenticateJWT, authorizeRoles("superuser", "auditoria", "admincc"), revertirDescuentoEstadoCuenta);
router.get("/:id/descuento", authenticateJWT, authorizeRoles("superuser", "auditoria", "admincc"), obtenerDescuentoEstadoCuenta);

export default router;
