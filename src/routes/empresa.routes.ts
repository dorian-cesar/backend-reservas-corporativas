import { Router } from "express";
import {
    listarEmpresas,
    obtenerEmpresa,
    crearEmpresa,
    actualizarEmpresa,
    eliminarEmpresa,
} from "../controllers/empresa.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

// Listar todas las empresas
router.get("/", authenticateJWT, authorizeRoles("superuser"), listarEmpresas);

// Obtener una empresa por id
router.get("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), obtenerEmpresa);

// Crear una empresa
router.post("/", authenticateJWT, authorizeRoles("superuser"), crearEmpresa);

// Actualizar una empresa
router.put("/:id", authenticateJWT, authorizeRoles("superuser"), actualizarEmpresa);

// Eliminar una empresa
router.delete("/:id", authenticateJWT, authorizeRoles("superuser"), eliminarEmpresa);

export default router;
