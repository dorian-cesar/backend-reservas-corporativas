import { Request, Response } from "express";
import * as bcrypt from "bcrypt";
import { User } from "../models/user.model";
import { signJwt } from "../utils/jwt";
import { CentroCosto } from "../models/centro_costo.model";
import { Empresa } from "../models/empresa.model";
import { sendEmail } from "../services/mail.service";
import { validatePasswordForNewLogin, isPasswordExpired } from "../services/password.service";


const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email y contraseña son requeridos" });
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !user.password) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Credenciales inválidas" });


    if (user.newLogin) {
      const passwordValidation = validatePasswordForNewLogin(password, user.email);

      if (!passwordValidation.isValid) {
        return res.status(403).json({
          message: "Se requiere actualización de contraseña",
          requiresPasswordUpdate: true,
          reason: "new_login_policy",
          validationError: passwordValidation.message,
          userId: user.id
        });
      }

      if (isPasswordExpired(user.lastChangePassWord)) {
        return res.status(403).json({
          message: "Tu contraseña ha expirado. Debes cambiarla para continuar.",
          requiresPasswordUpdate: true,
          reason: "password_expired",
          userId: user.id,
          daysExpired: getDaysExpired(user.lastChangePassWord)
        });
      }
    }

    if (user.rol === "superuser") {
      const payload = {
        id: user.id,
        email: user.email,
        rol: user.rol,
        empresa_id: user.empresa_id,
        centro_costo_id: user.centro_costo_id,
      };

      const token = signJwt(payload);

      let centroCostoData = null;
      if (user?.centro_costo_id) {
        const centroCosto = await CentroCosto.findByPk(user.centro_costo_id);
        centroCostoData = centroCosto ? centroCosto.toJSON() : null;
      }

      let empresaData = null;
      if (user?.empresa_id) {
        const empresa = await Empresa.findByPk(user.empresa_id);
        empresaData = empresa ? empresa.toJSON() : null;
      }

      const {
        password: _,
        twoFactorSecret: __,
        ...userData
      } = user.toJSON();

      return res.json({
        token,
        user: userData,
        centroCosto: centroCostoData,
        empresa: empresaData,
        requiresVerification: false,
        message: "Login exitoso"
      });
    }

    const verificationCode = generateCode();

    const expirationTime = Date.now() + (10 * 60 * 1000);
    const hashedCode = await bcrypt.hash(verificationCode, 10);
    const tokenData = `${hashedCode}|${expirationTime}`;

    await user.update({ twoFactorSecret: tokenData });

    try {
      await sendEmail(user.nombre, user.email, verificationCode);
    } catch (emailError) {
      console.error("Error enviando código por email:", emailError);
    }

    let centroCostoData = null;
    if (user?.centro_costo_id) {
      const centroCosto = await CentroCosto.findByPk(user.centro_costo_id);
      centroCostoData = centroCosto ? centroCosto.toJSON() : null;
    }

    let empresaData = null;
    if (user?.empresa_id) {
      const empresa = await Empresa.findByPk(user.empresa_id);
      empresaData = empresa ? empresa.toJSON() : null;
    }

    const {
      password: _,
      twoFactorSecret: __,
      ...userData
    } = user.toJSON();

    res.json({
      message: "Código de verificación enviado al correo",
      requiresVerification: true,
      userId: user.id,
      user: userData,
      centroCosto: centroCostoData,
      empresa: empresaData,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error en servidor" });
  }
};

export const verifyTwoFactorCode = async (req: Request, res: Response) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ message: "Usuario y código son requeridos" });
    }

    // Buscar el usuario
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!user.twoFactorSecret) {
      return res.status(400).json({ message: "No hay código pendiente de verificación" });
    }

    const [storedCode, expirationTimeStr] = user.twoFactorSecret.split('|');
    const expirationTime = parseInt(expirationTimeStr, 10);

    // Verificar si el código ha expirado
    if (Date.now() > expirationTime) {
      return res.status(400).json({ message: "El código ha expirado. Por favor, inicia sesión nuevamente." });
    }

    // Verificar si el código coincide
    const isValid = await bcrypt.compare(code.trim(), storedCode);
    if (!isValid) {
      return res.status(401).json({ message: "Código incorrecto" });
    }

    const payload = {
      id: user.id,
      email: user.email,
      rol: user.rol,
      empresa_id: user.empresa_id,
      centro_costo_id: user.centro_costo_id,
    };

    const token = signJwt(payload);

    let centroCostoData = null;
    if (user.centro_costo_id) {
      const centroCosto = await CentroCosto.findByPk(user.centro_costo_id);
      centroCostoData = centroCosto ? centroCosto.toJSON() : null;
    }

    let empresaData = null;
    if (user.empresa_id) {
      const empresa = await Empresa.findByPk(user.empresa_id);
      empresaData = empresa ? empresa.toJSON() : null;
    }

    const userJSON = user.toJSON();
    const {
      password: _,
      twoFactorSecret: __,
      ...userData
    } = userJSON;

    console.log("Verificación exitosa para usuario:", user.email);

    res.json({
      token,
      user: userData,
      centroCosto: centroCostoData,
      empresa: empresaData,
      message: "Verificación exitosa"
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error en servidor" });
  }
};


export const resendVerificationCode = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "Usuario es requerido" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const verificationCode = generateCode();
    const expirationTime = Date.now() + (10 * 60 * 1000); // 10 minutos
    const hashedCode = await bcrypt.hash(verificationCode, 10);
    const tokenData = `${hashedCode}|${expirationTime}`;

    await user.update({ twoFactorSecret: tokenData });

    try {
      await sendEmail(user.nombre, user.email, verificationCode);
      res.json({ message: "Código reenviado al correo" });
    } catch (emailError) {
      console.error("Error enviando código por email:", emailError);
      res.status(500).json({ message: "Error enviando el código" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error en servidor" });
  }
};

const getDaysExpired = (lastChangePassWord?: Date): number => {
  if (!lastChangePassWord) return 90;

  const now = new Date();
  const passwordDate = new Date(lastChangePassWord);
  const daysSinceChange = Math.floor(
    (now.getTime() - passwordDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceChange - 90;
};