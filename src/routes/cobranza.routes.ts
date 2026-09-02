import { Router } from "express";
import rateLimit from "express-rate-limit";
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

// Rate limiter para operaciones de escritura (crear, editar, eliminar):
// Máximo 30 operaciones por minuto por IP/cliente
const cobranzaWriteRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Demasiadas solicitudes de registro/modificación de cobranza. Por favor, espera un momento.",
  },
});

// Rate limiter para consultas de lectura (listados, estadísticas, detalle):
// Máximo 120 peticiones por minuto por IP/cliente
const cobranzaReadRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Has excedido el límite de consultas de cobranza. Por favor, reintenta en unos segundos.",
  },
});

// Todas las rutas de cobranza requieren estar autenticado
router.use(authenticateJWT);

// Lectura de cobranza: superuser, contralor, admincc, auditoria
const authorizeCobranzaRead = authorizeRoles("superuser", "contralor", "admincc", "auditoria");
// Creación y edición de cobranza: superuser, contralor, admincc
const authorizeCobranzaWrite = authorizeRoles("superuser", "contralor", "admincc");
// Eliminación de cobranza: solo superuser
const authorizeCobranzaDelete = authorizeRoles("superuser");

router.get("/", authorizeCobranzaRead, cobranzaReadRateLimit, getGestiones);
router.get("/stats", authorizeCobranzaRead, cobranzaReadRateLimit, getCobranzaStats);
router.get("/empresa/:empresaId", authorizeCobranzaRead, cobranzaReadRateLimit, getGestionesByEmpresa);
router.get("/:id", authorizeCobranzaRead, cobranzaReadRateLimit, getGestionById);
router.post("/", authorizeCobranzaWrite, cobranzaWriteRateLimit, createGestion);
router.put("/:id", authorizeCobranzaWrite, cobranzaWriteRateLimit, updateGestion);
router.delete("/:id", authorizeCobranzaDelete, cobranzaWriteRateLimit, deleteGestion);

export default router;
