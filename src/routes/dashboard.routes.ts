// src/routes/dashboard.routes.ts
import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboard.controller';
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";


const router = Router();

router.get('/stats', authenticateJWT, authorizeRoles("admin", "superuser", "auditoria", "contralor"), getDashboardStats);

export default router;