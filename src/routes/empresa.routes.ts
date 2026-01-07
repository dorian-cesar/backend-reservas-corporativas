import { Router } from "express";
import {
    listarEmpresas,
    obtenerEmpresa,
    crearEmpresa,
    actualizarEmpresa,
    eliminarEmpresa,
    resetMontoAcumulado,
} from "../controllers/empresa.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Listar todas las empresas
router.get("/", authenticateJWT, authorizeRoles("superuser", "admin", "auditoria", "contralor"), listarEmpresas);

// Obtener una empresa por id
router.get("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "contralor", "auditoria"), obtenerEmpresa);

// Crear una empresa
router.post("/", authenticateJWT, authorizeRoles("superuser", "admin", "contralor", "auditoria"), crearEmpresa);

// Actualizar una empresa
router.put("/reset/:id", authenticateJWT, authorizeRoles("superuser", "admin", "contralor", "auditoria"), resetMontoAcumulado)
router.put("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "contralor", "auditoria"), actualizarEmpresa);

// Eliminar una empresa
router.delete("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), eliminarEmpresa);

export default router;
