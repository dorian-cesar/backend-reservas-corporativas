// src/routes/users.routes.ts
import { Router } from "express";
import {
    getUsers,
    create,
    update,
    remove,
    setEstado, getUserById,
} from "../controllers/users.controller";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";
import { onlySuperUser } from "../middleware/role.middleware";

const router = Router();

// Listar usuarios
router.get("/", authenticateJWT, authorizeRoles("superuser", "admin"), getUsers);


// Obtener información completa de un usuario por ID
router.get("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), getUserById);

// Crear usuario
router.post("/", authenticateJWT, authorizeRoles("superuser", "admin"), create);

// Actualizar usuario
router.put("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), update);

// Eliminar usuario
router.delete("/:id", authenticateJWT, authorizeRoles("superuser", "admin"), remove);

// Activar/desactivar usuario
router.patch("/:id/estado", authenticateJWT, authorizeRoles("superuser", "admin"), setEstado);

// Ejemplo de ruta solo para superuser
router.post("/superuser-only", authenticateJWT, onlySuperUser, (req, res) => {
    res.json({ message: "Solo superuser puede ver esto" });
});

export default router;
