// src/routes/estadoCuenta.routes.ts

import { Router } from "express";
import { listarEstadosCuenta, listarTicketsDeEstadoCuenta, aplicarDescuentoEstadoCuenta, revertirDescuentoEstadoCuenta, obtenerDescuentoEstadoCuenta, ejecutarEDPManual } from "../controllers/estadoCuenta.controller";
import { authenticateJWT, checkPermission } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticateJWT, checkPermission("estados_de_pago_ver_informacion_de_estados_de_pago"), listarEstadosCuenta);
router.get("/:id/tickets", authenticateJWT, checkPermission("estados_de_pago_ver_informacion_de_estados_de_pago"), listarTicketsDeEstadoCuenta)
router.post("/ejecutar-edp-manual", authenticateJWT, checkPermission("estados_de_pago_crear_edp_manual"), ejecutarEDPManual);
router.post("/:id/aplicar-descuento", authenticateJWT, checkPermission("estados_de_pago_aplicar_descuento_en_edp"), aplicarDescuentoEstadoCuenta);
router.post("/:id/revertir-descuento", authenticateJWT, checkPermission("estados_de_pago_aplicar_descuento_en_edp"), revertirDescuentoEstadoCuenta);
router.get("/:id/descuento", authenticateJWT, checkPermission("estados_de_pago_ver_informacion_de_estados_de_pago"), obtenerDescuentoEstadoCuenta);

export default router;
