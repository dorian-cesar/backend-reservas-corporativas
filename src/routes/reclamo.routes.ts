import { Router } from "express";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";
import {
  crearReclamo,
  listarReclamos,
  resolverReclamo,
} from "../controllers/reclamo.controller";

const router = Router();

// Crear reclamo - roles que pueden ser usuarios/empresas
router.post(
  "/",
  authenticateJWT,
  authorizeRoles("superuser", "admin", "empresa", "subusuario"),
  crearReclamo,
);

// Listar reclamos - panel SAC
router.get(
  "/",
  authenticateJWT,
  authorizeRoles("superuser", "soporte"),
  listarReclamos,
);

// Resolver reclamo - panel SAC
router.put(
  "/:id/resolver",
  authenticateJWT,
  authorizeRoles("superuser", "soporte"),
  resolverReclamo,
);

export default router;
