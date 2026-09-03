import { Router } from "express";
import {
  obtenerEstadoCuentaGlobalPeriodo,
  exportarEstadoCuentaGlobalPeriodoExcel,
  exportarEstadoCuentaGlobalPeriodoPDF,
  obtenerEstadoCuentaEmpresaDetalle,
  exportarEstadoCuentaEmpresaDetalleExcel,
  exportarEstadoCuentaEmpresaDetallePDF,
} from "../controllers/reports.controller";
import { authenticateJWT, checkPermission } from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/estado-cuenta-periodo",
  authenticateJWT,
  checkPermission("reportes_seleccionar_tipo_de_reportes"),
  obtenerEstadoCuentaGlobalPeriodo,
);

router.get(
  "/estado-cuenta-periodo/export-excel",
  authenticateJWT,
  checkPermission("reportes_exportar_en_excel"),
  exportarEstadoCuentaGlobalPeriodoExcel,
);

router.get(
  "/estado-cuenta-periodo/export-pdf",
  authenticateJWT,
  checkPermission("reportes_exportar_en_pdf"),
  exportarEstadoCuentaGlobalPeriodoPDF,
);

router.get(
  "/estado-cuenta-empresa",
  authenticateJWT,
  checkPermission("reportes_seleccionar_tipo_de_reportes"),
  obtenerEstadoCuentaEmpresaDetalle,
);

router.get(
  "/estado-cuenta-empresa/export-excel",
  authenticateJWT,
  checkPermission("reportes_exportar_en_excel"),
  exportarEstadoCuentaEmpresaDetalleExcel,
);

router.get(
  "/estado-cuenta-empresa/export-pdf",
  authenticateJWT,
  checkPermission("reportes_exportar_en_pdf"),
  exportarEstadoCuentaEmpresaDetallePDF,
);

export default router;
