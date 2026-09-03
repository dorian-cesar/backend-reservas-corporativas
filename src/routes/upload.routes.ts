import { Router } from "express";
import { CSVController } from "../controllers/upload.controller";
import { uploadUsersCSV } from "../middleware/upload-user.middleware";
import { uploadPassengersCSV } from "../middleware/upload-passenger.middleware";
import { uploadCentrosCostoCSV } from "../middleware/upload-centro-costo.middleware";
import { uploadEmpresaCSV } from "../middleware/upload-empresa.middleware";
import { authenticateJWT, checkPermission, authorizeRoles } from "../middleware/auth.middleware";

const router = Router();

router.post(
    "/users/csv",
    authenticateJWT,
    checkPermission("usuarios_carga_masiva"),
    uploadUsersCSV.single("file"),
    CSVController.uploadUser
);

router.post(
    "/passengers/csv",
    authenticateJWT,
    checkPermission("pasajeros_carga_masiva"),
    uploadPassengersCSV.single("file"),
    CSVController.uploadPassenger
);

router.post(
    "/centros-costo/csv",
    authenticateJWT,
    checkPermission("centro_de_costo_carga_masiva"),
    uploadCentrosCostoCSV.single("file"),
    CSVController.uploadCentroCosto
);

router.post(
    "/empresas/csv",
    authenticateJWT,
    checkPermission("empresa_carga_masiva"),
    uploadEmpresaCSV.single("file"),
    CSVController.uploadEmpresa
);

router.post(
    "/csv",
    authenticateJWT,
    authorizeRoles("superuser", "admincc", "admin"),
    uploadUsersCSV.single("file"),
    CSVController.uploadGeneric
);

export default router;
