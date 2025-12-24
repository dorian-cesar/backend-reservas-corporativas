import { Request, Response } from "express";
import { User } from "../models/user.model";
import {
    validatePasswordForNewLogin,
    hashPassword,
    comparePassword,
    isPasswordExpired
} from "../services/password.service";


export const changePassword = async (req: Request, res: Response) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;

        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Todos los campos son requeridos"
            });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Usuario no encontrado"
            });
        }

        const isCurrentValid = await comparePassword(currentPassword, user.password);
        if (!isCurrentValid) {
            return res.status(401).json({
                success: false,
                message: "Contraseña actual incorrecta"
            });
        }

        // Para usuarios con newLogin, validar la nueva contraseña
        if (user.newLogin) {
            const validation = validatePasswordForNewLogin(newPassword, user.email);

            if (!validation.isValid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message,
                    validationError: true
                });
            }

            // Verificar que no sea igual a la contraseña actual
            const isSameAsCurrent = await comparePassword(newPassword, user.password);
            if (isSameAsCurrent) {
                return res.status(400).json({
                    success: false,
                    message: "La nueva contraseña no puede ser igual a la actual"
                });
            }
        }

        // Hashear y guardar la nueva contraseña
        const hashedPassword = await hashPassword(newPassword);
        await user.update({
            password: hashedPassword,
            updated_at: new Date(),
            lastChangePassWord: new Date(),
        });

        return res.json({
            success: true,
            message: "Contraseña actualizada exitosamente"
        });

    } catch (err) {
        console.error("Error cambiando contraseña:", err);
        return res.status(500).json({
            success: false,
            message: "Error en el servidor"
        });
    }
};

/**
 * Forzar cambio de contraseña para usuarios con newLogin
 */
export const forcePasswordChange = async (req: Request, res: Response) => {
    try {
        const { userId, newPassword } = req.body;

        if (!userId || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Usuario y nueva contraseña son requeridos"
            });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Usuario no encontrado"
            });
        }

        // Validar la nueva contraseña
        const validation = validatePasswordForNewLogin(newPassword, user.email);

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message,
                validationError: true
            });
        }

        // Hashear y guardar la nueva contraseña
        const hashedPassword = await hashPassword(newPassword);
        await user.update({
            password: hashedPassword,
            updated_at: new Date(),
            lastChangePassWord: new Date(),
        });

        return res.json({
            success: true,
            message: "Contraseña actualizada exitosamente",
            requiresVerification: false
        });

    } catch (err) {
        console.error("Error forzando cambio de contraseña:", err);
        return res.status(500).json({
            success: false,
            message: "Error en el servidor"
        });
    }
};

export const checkPasswordStatus = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Usuario no encontrado"
            });
        }

        const passwordExpired = isPasswordExpired(user.lastChangePassWord);
        const daysUntilExpiration = getDaysUntilExpiration(user.lastChangePassWord);

        return res.json({
            success: true,
            data: {
                lastChangePassWord: user.lastChangePassWord,
                isExpired: passwordExpired,
                daysUntilExpiration: daysUntilExpiration,
                newLogin: user.newLogin,
                requiresChange: passwordExpired || user.newLogin
            }
        });

    } catch (err) {
        console.error("Error verificando estado de contraseña:", err);
        return res.status(500).json({
            success: false,
            message: "Error en el servidor"
        });
    }
};

// Función auxiliar para calcular días hasta expiración
const getDaysUntilExpiration = (lastChangePassWord?: Date): number => {
    if (!lastChangePassWord) return -90;

    const now = new Date();
    const passwordDate = new Date(lastChangePassWord);
    const daysSinceChange = Math.floor(
        (now.getTime() - passwordDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return 90 - daysSinceChange;
};