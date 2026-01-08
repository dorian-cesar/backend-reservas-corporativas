import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendEmailFormController } from "../controllers/cotizacion.controller";

const router = Router();

export const emailFormRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 solicitudes por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        message: "Demasiadas solicitudes. Intenta nuevamente más tarde."
    }
});


router.post("/send-form", emailFormRateLimit, sendEmailFormController);

export default router;
