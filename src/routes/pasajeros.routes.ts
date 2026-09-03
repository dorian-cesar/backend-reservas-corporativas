import { Router } from "express";
import {
    getPasajeros,
    getPasajeroById,
    createPasajero,
    updatePasajero,
    deletePasajero,
    verificarPasajeroExistente
} from "../controllers/pasajero.controller";
import { authenticateJWT, checkPermission } from "../middleware/auth.middleware";

const router = Router();

router.get("/", getPasajeros);
router.get("/verificar", authenticateJWT, checkPermission("pasajeros_ver_informacion_de_pasajeros"), verificarPasajeroExistente);
router.get("/:id", authenticateJWT, checkPermission("pasajeros_ver_informacion_de_pasajeros"), getPasajeroById);
router.post("/", authenticateJWT, checkPermission("pasajeros_crear_nuevo_pasajero"), createPasajero);
router.put("/:id", authenticateJWT, checkPermission("pasajeros_modificar_datos_de_pasajero"), updatePasajero);
router.delete("/:id", authenticateJWT, checkPermission("pasajeros_modificar_estado_de_pasajero"), deletePasajero);

export default router;