import { Router } from "express";
import { CSVController } from "../controllers/upload.controller";
import { uploadUsersCSV } from "../middleware/upload-user.middleware";
import { uploadPassengersCSV } from "../middleware/upload-passenger.middleware";


const router = Router();

router.post(
    "/users/csv",
    uploadUsersCSV.single("file"),
    CSVController.uploadUser
);

router.post(
    "/passengers/csv",
    uploadPassengersCSV.single("file"),
    CSVController.uploadPassenger
);

export default router;
