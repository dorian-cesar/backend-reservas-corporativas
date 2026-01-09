import { Request, Response, NextFunction } from "express";
import { User } from "../models/user.model";
import { isPasswordExpired } from "../services/password.service";

export const checkPasswordRequirements = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { email } = req.body;

        if (!email) {
            return next();
        }

        const user = await User.findOne({ where: { email } });

        if (!user) {
            return next();
        }

        if (user.newLogin) {
            req.requiresPasswordChange = true;
            req.passwordChangeReason = "new_login_policy";
            return next();
        }

        if (user.updated_at && isPasswordExpired(user.updated_at)) {
            req.requiresPasswordChange = true;
            req.passwordChangeReason = "password_expired";
            return next();
        }

        next();
    } catch (error) {
        console.error("Error en middleware de verificación de contraseña:", error);
        next();
    }
};

declare global {
    namespace Express {
        interface Request {
            requiresPasswordChange?: boolean;
            passwordChangeReason?: "new_login_policy" | "password_expired";
        }
    }
}