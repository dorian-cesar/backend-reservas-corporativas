import { Router } from "express";
import {
    assignEmpresaToUser,
    getEmpresasByUserId,
    getEmpresaIdsByUserId,
    removeEmpresaFromUser,
    assignMultipleEmpresasToUser,
    getUsersByEmpresaId
} from "../controllers/user_empresa.controller";

const router = Router();

router.post("/", assignEmpresaToUser);

router.get("/user/:user_id", getEmpresasByUserId);

router.get("/user/:user_id/ids", getEmpresaIdsByUserId);

router.delete("/", removeEmpresaFromUser);

router.post("/bulk", assignMultipleEmpresasToUser);

router.get("/empresa/:empresa_id", getUsersByEmpresaId);

export default router;