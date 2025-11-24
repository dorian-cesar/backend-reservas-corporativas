import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/user.model";
import { signJwt } from "../utils/jwt";

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

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

        const { password: _, ...userData } = user.toJSON();

        res.json({ token, user: userData });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error en servidor" });
    }
};
