import { Router } from "express";
import {
    listarEmpresas,
    obtenerEmpresa,
    crearEmpresa,
    actualizarEmpresa,
    eliminarEmpresa,
    resetMontoAcumulado,
    setNewLoginForEmpresa,
    exportEmpresas,
    exportEmpresasExcel
} from "../controllers/empresa.controller";
import { authenticateJWT, authorizeRoles, checkPermission } from "../middleware/auth.middleware";

const router = Router();

// Listar todas las empresas
router.get("/", authenticateJWT, checkPermission("empresa_ver_informacion_de_empresa"), listarEmpresas);

// Exportar todas las empresas (debe estar antes del endpoint /:id)
router.get("/export", authenticateJWT, checkPermission("empresa_exportar_datos"), exportEmpresas);
router.get("/export-excel", authenticateJWT, checkPermission("empresa_exportar_datos"), exportEmpresasExcel);

// Obtener una empresa por id
router.get("/:id", authenticateJWT, checkPermission("empresa_ver_informacion_de_empresa"), obtenerEmpresa);

// Crear una empresa
router.post("/", authenticateJWT, checkPermission("empresa_crear_nueva_empresa"), crearEmpresa);

// Actualizar una empresa
router.put("/reset/:id", authenticateJWT, checkPermission("empresa_modificar_cupo_de_empresa", "empresa_modificar_datos_de_empresa"), resetMontoAcumulado)
router.put("/:id", authenticateJWT, checkPermission("empresa_modificar_datos_de_empresa"), actualizarEmpresa);

// Eliminar / Desactivar una empresa
router.delete("/:id", authenticateJWT, checkPermission("empresa_modificar_estado_empresa"), eliminarEmpresa);

router.patch('/:id/new-login', authenticateJWT, authorizeRoles("superuser"), setNewLoginForEmpresa);

export default router;
