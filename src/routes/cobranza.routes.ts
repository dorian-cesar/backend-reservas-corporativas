import { Router } from "express";
import {
  getGestiones,
  getCobranzaStats,
  getGestionById,
  getGestionesByEmpresa,
  createGestion,
  updateGestion,
  deleteGestion,
} from "../controllers/cobranza.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Todas las rutas de cobranza requieren estar autenticado y ser superuser o admin
router.use(authenticateJWT);
router.use(authorizeRoles("superuser", "admin"));

router.get("/", getGestiones);
router.get("/stats", getCobranzaStats);
router.get("/empresa/:empresaId", getGestionesByEmpresa);
router.get("/:id", getGestionById);
router.post("/", createGestion);
router.put("/:id", updateGestion);
router.delete("/:id", deleteGestion);

export default router;
