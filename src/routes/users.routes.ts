import { Router } from "express";
import {
  create,
  remove,
  getUsers,
  update,
  getUserById,
  exportUsers,
  setEstado,
  setNewLogin,
  setNewLoginForEmpresa,
  cambiarEmpresaActual,
} from "../controllers/users.controller";
import {
  authenticateJWT,
  authorizeRoles,
  checkPermission,
  onlySuperUser,
} from "../middleware/auth.middleware";

const router = Router();

// Listar usuarios
router.get(
  "/",
  authenticateJWT,
  checkPermission("usuarios_ver_informacion_de_usuario"),
  getUsers,
);

// Exportar usuarios (debe estar antes del endpoint /:id)
router.get(
  "/export",
  authenticateJWT,
  checkPermission("usuarios_exportar_datos"),
  exportUsers,
);

// Obtener información completa de un usuario por ID (usado por el store de sesión de todos los roles)
router.get(
  "/:id",
  authenticateJWT,
  authorizeRoles(
    "superuser",
    "admin",
    "empresa",
    "subusuario",
    "contralor",
    "auditoria",
    "admincc",
    "soporte",
  ),
  getUserById,
);

// Crear usuario
router.post(
  "/",
  authenticateJWT,
  checkPermission("usuarios_crear_nuevo_usuario"),
  create,
);

// Actualizar usuario
router.put(
  "/:id",
  authenticateJWT,
  checkPermission("usuarios_modificar_datos_de_usuarios"),
  update,
);

// Eliminar usuario
router.delete(
  "/:id",
  authenticateJWT,
  checkPermission("usuarios_modificar_estado_de_usuarios"),
  remove,
);

// Activar/desactivar usuario
router.patch(
  "/:id/estado",
  authenticateJWT,
  checkPermission("usuarios_modificar_estado_de_usuarios"),
  setEstado,
);

router.patch(
  "/:id/new-login",
  authenticateJWT,
  authorizeRoles("superuser"),
  setNewLogin,
);

router.patch(
  "/:empresaId/empresa-new-login",
  authenticateJWT,
  authorizeRoles("superuser"),
  setNewLoginForEmpresa,
);

router.patch(
  "/cambiar-empresa",
  authenticateJWT,
  authorizeRoles("superuser", "admin", "admincc"),
  cambiarEmpresaActual,
);

// Ejemplo de ruta solo para superuser
router.post("/superuser-only", authenticateJWT, onlySuperUser, (req, res) => {
  res.json({ message: "Acceso concedido a superuser" });
});

export default router;
