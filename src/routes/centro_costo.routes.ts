import { Router } from "express";
import {
    listarCentrosCosto,
    obtenerCentroCosto,
    crearCentroCosto,
    actualizarCentroCosto,
    eliminarCentroCosto,
} from "../controllers/centro_costo.controller";
import { authenticateJWT, checkPermission } from "../middleware/auth.middleware";

const router = Router();

// Listar todos los centros de costo de una empresa
router.get(
    "/empresa/:empresa_id",
    authenticateJWT,
    checkPermission("centro_de_costo_ver_informacion_de_centros_de_costos"),
    listarCentrosCosto
);

// Obtener un centro de costo por id
router.get(
    "/:id",
    authenticateJWT,
    checkPermission("centro_de_costo_ver_informacion_de_centros_de_costos"),
    obtenerCentroCosto
);

// Crear un centro de costo
router.post(
    "/",
    authenticateJWT,
    checkPermission("centro_de_costo_crear_nuevo_centro_de_costo"),
    crearCentroCosto
);

// Actualizar un centro de costo
router.put(
    "/:id",
    authenticateJWT,
    checkPermission("centro_de_costo_modificar_estado_de_centro_de_costo"),
    actualizarCentroCosto
);

// Eliminar un centro de costo
router.delete(
    "/:id",
    authenticateJWT,
    checkPermission("centro_de_costo_modificar_estado_de_centro_de_costo"),
    eliminarCentroCosto
);

export default router;
