import { Router } from "express";
import {
  obtenerEstadoCuentaGlobalPeriodo,
  exportarEstadoCuentaGlobalPeriodoExcel,
  exportarEstadoCuentaGlobalPeriodoPDF,
  obtenerEstadoCuentaEmpresaDetalle,
  exportarEstadoCuentaEmpresaDetalleExcel,
  exportarEstadoCuentaEmpresaDetallePDF,
} from "../controllers/reports.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Todos los reportes globales son confidenciales y están restringidos a 'superuser'
router.get(
  "/estado-cuenta-periodo",
  authenticateJWT,
  authorizeRoles("superuser", "contralor", "admincc"),
  obtenerEstadoCuentaGlobalPeriodo,
);

router.get(
  "/estado-cuenta-periodo/export-excel",
  authenticateJWT,
  authorizeRoles("superuser", "contralor", "admincc"),
  exportarEstadoCuentaGlobalPeriodoExcel,
);

router.get(
  "/estado-cuenta-periodo/export-pdf",
  authenticateJWT,
  authorizeRoles("superuser", "contralor", "admincc"),
  exportarEstadoCuentaGlobalPeriodoPDF,
);

router.get(
  "/estado-cuenta-empresa",
  authenticateJWT,
  authorizeRoles("superuser", "contralor", "admincc"),
  obtenerEstadoCuentaEmpresaDetalle,
);

router.get(
  "/estado-cuenta-empresa/export-excel",
  authenticateJWT,
  authorizeRoles("superuser", "contralor", "admincc"),
  exportarEstadoCuentaEmpresaDetalleExcel,
);

router.get(
  "/estado-cuenta-empresa/export-pdf",
  authenticateJWT,
  authorizeRoles("superuser", "contralor", "admincc"),
  exportarEstadoCuentaEmpresaDetallePDF,
);

export default router;
