import { Router } from "express";
import { CSVController } from "../controllers/upload.controller";
import { uploadUsersCSV } from "../middleware/upload-user.middleware";
import { uploadPassengersCSV } from "../middleware/upload-passenger.middleware";
import { uploadCentrosCostoCSV } from "../middleware/upload-centro-costo.middleware";
import { uploadEmpresaCSV } from "../middleware/upload-empresa.middleware";
import { authenticateJWT, authorizeRoles } from "../middleware/auth.middleware";


const router = Router();

router.post(
    "/users/csv",
    authenticateJWT,
    authorizeRoles("superuser"),
    uploadUsersCSV.single("file"),
    CSVController.uploadUser
);

router.post(
    "/passengers/csv",
    authenticateJWT,
    authorizeRoles("superuser"),
    uploadPassengersCSV.single("file"),
    CSVController.uploadPassenger
);

router.post(
    "/centros-costo/csv",
    authenticateJWT,
    authorizeRoles("superuser"),
    uploadCentrosCostoCSV.single("file"),
    CSVController.uploadCentroCosto
);

router.post(
    "/empresas/csv",
    authenticateJWT,
    authorizeRoles("superuser"),
    uploadEmpresaCSV.single("file"),
    CSVController.uploadEmpresa
)

router.post(
    "/csv",
    authenticateJWT,
    authorizeRoles("superuser"),
    uploadUsersCSV.single("file"),
    CSVController.uploadGeneric
);


export default router;
