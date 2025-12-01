// src/routes/estadoCuenta.routes.ts

import { Router } from "express";
import { pagarEstadoCuenta, listarEstadosCuenta, listarTicketsDeEstadoCuenta } from "../controllers/estadoCuenta.controller";

const router = Router();

router.get("/", listarEstadosCuenta);
router.get("/:id/tickets", listarTicketsDeEstadoCuenta)
router.post("/pagar", pagarEstadoCuenta);

export default router;
