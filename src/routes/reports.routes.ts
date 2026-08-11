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
  authorizeRoles("superuser"),
  obtenerEstadoCuentaGlobalPeriodo,
);

router.get(
  "/estado-cuenta-periodo/export-excel",
  authenticateJWT,
  authorizeRoles("superuser"),
  exportarEstadoCuentaGlobalPeriodoExcel,
);

router.get(
  "/estado-cuenta-empresa",
  authenticateJWT,
  authorizeRoles("superuser"),
  obtenerEstadoCuentaEmpresaDetalle,
);

router.get(
  "/estado-cuenta-empresa/export-excel",
  authenticateJWT,
  authorizeRoles("superuser"),
  exportarEstadoCuentaEmpresaDetalleExcel,
);

export default router;
