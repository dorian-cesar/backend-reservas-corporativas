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
import { authenticateJWT, checkPermission } from "../middleware/auth.middleware";

const router = Router();

// Rate limiter para operaciones de escritura (crear, editar, eliminar):
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

router.get(
  "/",
  checkPermission("historial_de_cobranza_visualizar_modulo"),
  cobranzaReadRateLimit,
  getGestiones
);
router.get(
  "/stats",
  checkPermission("historial_de_cobranza_visualizar_modulo"),
  cobranzaReadRateLimit,
  getCobranzaStats
);
router.get(
  "/empresa/:empresaId",
  checkPermission("historial_de_cobranza_visualizar_modulo"),
  cobranzaReadRateLimit,
  getGestionesByEmpresa
);
router.get(
  "/:id",
  checkPermission("historial_de_cobranza_visualizar_modulo"),
  cobranzaReadRateLimit,
  getGestionById
);
router.post(
  "/",
  checkPermission("historial_de_cobranza_crear"),
  cobranzaWriteRateLimit,
  createGestion
);
router.put(
  "/:id",
  checkPermission("historial_de_cobranza_crear"),
  cobranzaWriteRateLimit,
  updateGestion
);
router.delete(
  "/:id",
  checkPermission("historial_de_cobranza_eliminar"),
  cobranzaWriteRateLimit,
  deleteGestion
);

export default router;
