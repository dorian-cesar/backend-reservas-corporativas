import multer from "multer";
import path from "path";
import fs from "fs";

const uploadPath = path.join(process.cwd(), "uploads/empresas");

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadPath);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = file.originalname
            .replace(ext, "")
            .replace(/\s+/g, "_")
            .toLowerCase();

        cb(null, `${name}-${Date.now()}${ext}`);
    },
});

export const uploadEmpresaCSV = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        if (!file.originalname.endsWith(".csv")) {
            return cb(new Error("Solo se permiten archivos CSV"));
        }
        cb(null, true);
    },
    // limits: {
    //     fileSize: 5 * 1024 * 1024, // 5MB límite
    // },
});