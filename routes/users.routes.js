import express from "express";
import {
  getUsers,
  create,
  update,
  remove,
} from "../controllers/users.controller.js";

import {
  authenticateJWT,
  authorizeRoles,
} from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/",
  authenticateJWT,
  authorizeRoles("admin", "superuser"),
  getUsers
);
router.post("/", authenticateJWT, authorizeRoles("admin", "superuser"), create);
router.put(
  "/:id",
  authenticateJWT,
  authorizeRoles("admin", "superuser"),
  update
);
router.delete(
  "/:id",
  authenticateJWT,
  authorizeRoles("admin", "superuser"),
  remove
);

export default router;
