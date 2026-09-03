import { Router } from "express";
import {
    listarCentrosCosto,
    obtenerCentroCosto,
    crearCentroCosto,
    actualizarCentroCosto,
    eliminarCentroCosto,
} from "../controllers/centro_costo.controller";
import { authenticateJWT, checkPermission, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Listar todos los centros de costo de una empresa (usado tanto por compradores/subusuarios al reservar como por administradores)
router.get(
    "/empresa/:empresa_id",
    authenticateJWT,
    authorizeRoles("admin", "superuser", "auditoria", "contralor", "subusuario", "admincc", "empresa", "soporte"),
    listarCentrosCosto
);

// Obtener un centro de costo por id
router.get(
    "/:id",
    authenticateJWT,
    authorizeRoles("admin", "superuser", "auditoria", "contralor", "subusuario", "admincc", "empresa", "soporte"),
    obtenerCentroCosto
);

// Crear un centro de costo (Acción administrativa del mantenedor)
router.post(
    "/",
    authenticateJWT,
    checkPermission("centro_de_costo_crear_nuevo_centro_de_costo"),
    crearCentroCosto
);

// Actualizar un centro de costo (Acción administrativa del mantenedor)
router.put(
    "/:id",
    authenticateJWT,
    checkPermission("centro_de_costo_modificar_estado_de_centro_de_costo"),
    actualizarCentroCosto
);

// Eliminar un centro de costo (Acción administrativa del mantenedor)
router.delete(
    "/:id",
    authenticateJWT,
    checkPermission("centro_de_costo_modificar_estado_de_centro_de_costo"),
    eliminarCentroCosto
);

export default router;
