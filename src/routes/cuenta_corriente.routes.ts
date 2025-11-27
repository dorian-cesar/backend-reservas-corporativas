import { Router } from "express";
import {
    listarMovimientos,
    obtenerMovimiento,
    crearMovimiento,
    eliminarMovimiento,
} from "../controllers/cuenta_corriente.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Listar movimientos de cuenta corriente por empresa
router.get("/empresa/:empresa_id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor"), listarMovimientos);

// Obtener un movimiento específico
router.get("/:id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor"), obtenerMovimiento);

// Crear un movimiento
router.post("/", authenticateJWT, authorizeRoles("admin", "superuser", "contralor"), crearMovimiento);

// Eliminar un movimiento
router.delete("/:id", authenticateJWT, authorizeRoles("superuser"), eliminarMovimiento);

export default router;
