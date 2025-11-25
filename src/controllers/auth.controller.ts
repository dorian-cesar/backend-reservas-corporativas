import { Request, Response } from "express";
import * as bcrypt from "bcrypt";
import { User } from "../models/user.model";
import { signJwt } from "../utils/jwt";

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

        // Busca el usuario y obtén los datos planos directamente
        const user = await User.findOne({ where: { email }, raw: true });
        if (!user || !user.password) {
            return res.status(401).json({ message: "Credenciales inválidas" });
        }

        // Verifica el password usando bcrypt
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

        // Elimina la propiedad password del objeto retornado
        const { password: _, ...userData } = user;

        res.json({ token, user: userData });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};
