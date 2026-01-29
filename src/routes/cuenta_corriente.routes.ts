import { Router } from "express";
import {
    listarMovimientos,
    obtenerMovimiento,
    crearMovimiento,
    eliminarMovimiento,
    pagarMovimiento
} from "../controllers/cuenta_corriente.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Listar movimientos de cuenta corriente por empresa
router.get("/empresa/:empresa_id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "auditoria", "admincc"), listarMovimientos);

// Obtener un movimiento específico
router.get("/:id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "admincc"), obtenerMovimiento);

// Crear un movimiento
router.post("/", authenticateJWT, authorizeRoles("admin", "superuser", "contralor"), crearMovimiento);
router.post("/pagar-cargo", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "auditoria"), pagarMovimiento);

// Eliminar un movimiento
router.delete("/:id", authenticateJWT, authorizeRoles("superuser"), eliminarMovimiento);

export default router;
