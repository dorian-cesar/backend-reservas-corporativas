import { Request, Response } from "express";
import * as bcrypt from "bcrypt";
import { User } from "../models/user.model";
import { signJwt } from "../utils/jwt";
import { CentroCosto } from "../models/centro_costo.model";

/**
 * Controlador para el inicio de sesión de usuarios.
 * @param req Solicitud HTTP entrante.
 * @param res Respuesta HTTP saliente.
 */
export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email y contraseña son requeridos" });
        }

        const user = await User.findOne({ where: { email } });
        if (!user)
            return res.status(401).json({ message: "Credenciales inválidas" });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ message: "Credenciales inválidas" });

        const payload = {
            id: user.id,
            email: user.email,
            rol: user.rol,
            empresa_id: user.empresa_id,
            centro_costo_id: user.centro_costo_id,
        };

        const token = signJwt(payload);

        // Busca centro de costo si corresponde, y devuelve null si no tiene
        let centroCostoData = null;
        if (user.centro_costo_id) {
            const centroCosto = await CentroCosto.findByPk(user.centro_costo_id);
            centroCostoData = centroCosto ? centroCosto.toJSON() : null;
        }

        // Prepara el usuario para respuesta, eliminando password
        const { password: _, ...userData } = user.toJSON();

        // Incluye los datos de centroCosto dentro del usuario (null si no tiene)
        res.json({
            token,
            user: {
                ...userData,
                centroCosto: centroCostoData
            }
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};
