import { Router } from "express";
import { authenticateJWT, checkPermission } from "../middleware/auth.middleware";
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
  checkPermission("tickets_ingresar_reclamo", "reservas_ingresar_reclamo"),
  crearReclamo,
);

// Listar reclamos - panel SAC
router.get(
  "/",
  authenticateJWT,
  checkPermission("reclamos_visualizar_listado_de_reclamos"),
  listarReclamos,
);

// Resolver reclamo - panel SAC
router.put(
  "/:id/resolver",
  authenticateJWT,
  checkPermission("reclamos_aprobar_reclamo", "reclamos_rechazar_reclamo"),
  resolverReclamo,
);

export default router;
