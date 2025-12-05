import { Router } from "express";
import {
    getPasajeros,
    getPasajeroById,
    createPasajero,
    updatePasajero,
    deletePasajero,
    verificarPasajeroExistente
} from "../controllers/pasajero.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

router.get("/", getPasajeros);
router.get("/verificar", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), verificarPasajeroExistente);
router.get("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), getPasajeroById);
router.post("/", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), createPasajero);
router.put("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), updatePasajero);
router.delete("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "auditoria", "contralor"), deletePasajero);

export default router;