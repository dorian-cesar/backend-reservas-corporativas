import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { findByEmail } from "../models/user.model.js";

dotenv.config();

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await findByEmail(email);
    if (!user)
      return res.status(401).json({ message: "Credenciales inválidas" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Credenciales inválidas" });

    const payload = {
      id: user.id,
      email: user.email,
      rol: user.rol,
      empresa: user.empresa,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    delete user.password;

    res.json({ token, user });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error en servidor" });
  }
};
