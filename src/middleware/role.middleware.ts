import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.middleware";

export const onlySuperUser = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.user?.rol !== "superuser") {
        return res.status(403).json({ message: "Acceso denegado: Solo SUPERUSER" });
    }
    next();
};
