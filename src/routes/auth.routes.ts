import { Router } from "express";
import { login, resendVerificationCode, verifyTwoFactorCode } from "../controllers/auth.controller";

const router = Router();

router.post("/login", login);
router.post("/verify-code", verifyTwoFactorCode);
router.post("/resend-code", resendVerificationCode);

export default router;
