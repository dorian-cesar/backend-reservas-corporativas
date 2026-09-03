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
import { authenticateJWT, authorizeRoles, checkPermission } from "../middleware/auth.middleware";

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB máximo por archivo
    },
});

// Listar movimientos de cuenta corriente por empresa
router.get("/empresa/:empresa_id", authenticateJWT, checkPermission("cuentas_corrientes_ver_informacion_de_cuentas_corrientes", "cuantas_corrientes_ver_informacion_de_cuentas_corrientes"), listarMovimientos);

// Rutas de adjuntos de cuenta corriente
router.get("/:id/adjuntos", authenticateJWT, checkPermission("cuentas_corrientes_ver_informacion_de_cuentas_corrientes", "cuantas_corrientes_ver_informacion_de_cuentas_corrientes"), listarAdjuntos);
router.post("/:id/adjuntos", authenticateJWT, checkPermission("cuentas_corrientes_crear_nuevo_movimiento", "cuantas_corrientes_crear_nuevo_movimiento"), upload.single("file"), subirAdjunto);
router.delete("/adjuntos/:adjuntoId", authenticateJWT, checkPermission("cuentas_corrientes_crear_nuevo_movimiento", "cuantas_corrientes_crear_nuevo_movimiento"), eliminarAdjunto);

// Obtener un movimiento específico
router.get("/:id", authenticateJWT, checkPermission("cuentas_corrientes_ver_informacion_de_cuentas_corrientes", "cuantas_corrientes_ver_informacion_de_cuentas_corrientes"), obtenerMovimiento);

// Crear un movimiento
router.post("/", authenticateJWT, checkPermission("cuentas_corrientes_crear_nuevo_movimiento", "cuantas_corrientes_crear_nuevo_movimiento"), crearMovimiento);
router.post("/pagar-cargo", authenticateJWT, checkPermission("cuentas_corrientes_pagar_linea_generada", "cuantas_corrientes_pagar_linea_generada"), pagarMovimiento);

// Eliminar un movimiento (solo superuser)
router.delete("/:id", authenticateJWT, authorizeRoles("superuser"), eliminarMovimiento);

export default router;
