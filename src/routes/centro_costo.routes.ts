import { Router } from "express";
import {
    listarCentrosCosto,
    obtenerCentroCosto,
    crearCentroCosto,
    actualizarCentroCosto,
    eliminarCentroCosto,
} from "../controllers/centro_costo.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Listar todos los centros de costo de una empresa
router.get("/empresa/:empresa_id", authenticateJWT, authorizeRoles("admin", "superuser", "auditoria", "contralor"), listarCentrosCosto);

// Obtener un centro de costo por id
router.get("/:id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor"), obtenerCentroCosto);

// Crear un centro de costo
router.post("/", authenticateJWT, authorizeRoles("admin", "superuser", "contralor"), crearCentroCosto);

// Actualizar un centro de costo
router.put("/:id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor"), actualizarCentroCosto);

// Eliminar un centro de costo
router.delete("/:id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor"), eliminarCentroCosto);

export default router;
