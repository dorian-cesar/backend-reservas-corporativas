import express from "express";
import {
  listarEmpresas,
  obtenerEmpresa,
  crearEmpresa,
  actualizarEmpresa,
  eliminarEmpresa,
} from "../controllers/empresa.controller.js";
import {
  authenticateJWT,
  authorizeRoles,
} from "../middleware/auth.middleware.js";
import { onlySuperUser } from "../middleware/role.middleware.js";

const router = express.Router();

// Todas las rutas requieren: JWT + SUPERUSER
//router.use(verifyToken, onlySuperUser);

router.get("/", authenticateJWT, listarEmpresas);
router.get(
  "/:id",
  authenticateJWT,
  authorizeRoles("superuser"),
  obtenerEmpresa
);
router.post("/", authenticateJWT, authorizeRoles("superuser"), crearEmpresa);
router.put(
  "/:id",
  authenticateJWT,
  authorizeRoles("superuser"),
  actualizarEmpresa
);
router.delete(
  "/:id",
  authenticateJWT,
  authorizeRoles("superuser"),
  eliminarEmpresa
);

export default router;
