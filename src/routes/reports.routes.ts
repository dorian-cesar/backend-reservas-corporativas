import { Router } from "express";
import {
  obtenerEstadoCuentaGlobalPeriodo,
  exportarEstadoCuentaGlobalPeriodoExcel,
  obtenerEstadoCuentaEmpresaDetalle,
  exportarEstadoCuentaEmpresaDetalleExcel,
} from "../controllers/reports.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Todos los reportes globales son confidenciales y están restringidos a 'superuser'
router.get(
  "/estado-cuenta-periodo",
  authenticateJWT,
  authorizeRoles("superuser", "admin", "superadmin", "contralor", "auditoria"),
  obtenerEstadoCuentaGlobalPeriodo,
);

router.get(
  "/estado-cuenta-periodo/export-excel",
  authenticateJWT,
  authorizeRoles("superuser", "admin", "superadmin", "contralor", "auditoria"),
  exportarEstadoCuentaGlobalPeriodoExcel,
);

router.get(
  "/estado-cuenta-empresa",
  authenticateJWT,
  authorizeRoles("superuser", "admin", "superadmin", "contralor", "auditoria"),
  obtenerEstadoCuentaEmpresaDetalle,
);

router.get(
  "/estado-cuenta-empresa/export-excel",
  authenticateJWT,
  authorizeRoles("superuser", "admin", "superadmin", "contralor", "auditoria"),
  exportarEstadoCuentaEmpresaDetalleExcel,
);

export default router;
