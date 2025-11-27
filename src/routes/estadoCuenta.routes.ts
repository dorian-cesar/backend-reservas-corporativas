// src/routes/estadoCuenta.routes.ts

import { Router } from "express";
import { pagarEstadoCuenta } from "../controllers/estadoCuenta.controller";

const router = Router();

router.post("/pagar", pagarEstadoCuenta);

export default router;
