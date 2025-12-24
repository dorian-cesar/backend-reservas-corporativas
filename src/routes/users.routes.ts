// src/routes/users.routes.ts
import { Router } from "express";
import {
    getUsers,
    create,
    update,
    remove,
    setEstado, getUserById, setNewLogin, setNewLoginForEmpresa
} from "../controllers/users.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";
import { onlySuperUser } from "../middleware/role.middleware";

const router = Router();

// Listar usuarios
router.get("/", authenticateJWT, authorizeRoles("superuser", "admin", "contralor", "auditoria"), getUsers);

// Obtener información completa de un usuario por ID
router.get("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "subusuario", "contralor", "auditoria"), getUserById);

// Crear usuario
router.post("/", authenticateJWT, authorizeRoles("superuser", "admin", "contralor", "auditoria"), create);

// Actualizar usuario
router.put("/:id", authenticateJWT, authorizeRoles("superuser", "admin", "contralor", "auditoria"), update);

// Eliminar usuario
router.delete("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), remove);

// Activar/desactivar usuario
router.patch("/:id/estado", authenticateJWT, authorizeRoles("superuser", "admin", "contralor", "auditoria"), setEstado);
router.patch("/:id/new-login", authenticateJWT, authorizeRoles("superuser"), setNewLogin);
router.patch("/:empresaId/empresa-new-login", authenticateJWT, authorizeRoles("superuser"), setNewLoginForEmpresa);

// Ejemplo de ruta solo para superuser
router.post("/superuser-only", authenticateJWT, onlySuperUser, (req, res) => {
    res.json({ message: "Solo superuser puede ver esto" });
});

export default router;
