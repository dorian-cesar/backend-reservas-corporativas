import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
dotenv.config();

interface JwtPayload {
    id: number;
    email: string;
    rol: string;
    empresa_id?: number;
    centro_costo_id?: number;
    // Puedes agregar más campos si tu token los incluye
}

export interface AuthenticatedRequest extends Request {
    user?: JwtPayload;
}

export const authenticateJWT = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: "Token requerido" });

    const token = header.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Token inválido" });
    }
};

export const authorizeRoles = (...roles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.rol))
            return res.status(403).json({ message: "No autorizado" });

        next();
    };
};
