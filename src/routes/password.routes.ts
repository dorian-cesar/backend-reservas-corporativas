import { Router } from "express";
import {
    changePassword,
    forcePasswordChange,
    checkPasswordStatus
} from "../controllers/password.controller";

const router = Router();

router.post("/change-password", changePassword);
router.post("/force-change-password", forcePasswordChange);
router.get("/status/:userId", checkPasswordStatus);

export default router;