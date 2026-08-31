import { Router } from "express";
import multer from "multer";
import {
    listarMovimientos,
    obtenerMovimiento,
    crearMovimiento,
    eliminarMovimiento,
    pagarMovimiento
} from "../controllers/cuenta_corriente.controller";
import {
    listarAdjuntos,
    subirAdjunto,
    eliminarAdjunto,
} from "../controllers/cuenta_corriente_adjunto.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB máximo por archivo
    },
});

// Listar movimientos de cuenta corriente por empresa
router.get("/empresa/:empresa_id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "auditoria", "admincc"), listarMovimientos);

// Rutas de adjuntos de cuenta corriente
router.get("/:id/adjuntos", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "admincc", "auditoria"), listarAdjuntos);
router.post("/:id/adjuntos", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "admincc", "auditoria"), upload.single("file"), subirAdjunto);
router.delete("/adjuntos/:adjuntoId", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "admincc", "auditoria"), eliminarAdjunto);

// Obtener un movimiento específico
router.get("/:id", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "admincc", "auditoria"), obtenerMovimiento);

// Crear un movimiento
router.post("/", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "admincc", "auditoria"), crearMovimiento);
router.post("/pagar-cargo", authenticateJWT, authorizeRoles("admin", "superuser", "contralor", "auditoria", "admincc"), pagarMovimiento);

// Eliminar un movimiento
router.delete("/:id", authenticateJWT, authorizeRoles("superuser"), eliminarMovimiento);

export default router;
