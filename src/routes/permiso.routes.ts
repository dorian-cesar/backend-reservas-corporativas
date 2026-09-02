import { Router } from "express";
import {
  getMatrizPermisos,
  updatePermiso,
  restablecerPermisos,
  getMisPermisos,
} from "../controllers/permiso.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Endpoint para que cualquier usuario autenticado obtenga sus permisos asignados
router.get("/mis-permisos", authenticateJWT, getMisPermisos);

// Endpoints exclusivos para Superuser (Gestión y Mantenedor)
router.get("/", authenticateJWT, authorizeRoles("superuser"), getMatrizPermisos);
router.put("/:id", authenticateJWT, authorizeRoles("superuser"), updatePermiso);
router.post("/restablecer", authenticateJWT, authorizeRoles("superuser"), restablecerPermisos);

export default router;
