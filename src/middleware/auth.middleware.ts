import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import { User } from "../models/user.model";
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

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "Token requerido" });

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as JwtPayload;

    const user = await User.findByPk(decoded.id, { attributes: ["estado"] });
    if (!user || !user.estado) {
      return res
        .status(403)
        .json({ message: "Tu cuenta ha sido desactivada." });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido" });
  }
};

import { PermisoService } from "../services/permiso.service";

export const authorizeRoles = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.rol))
      return res.status(403).json({ message: "No autorizado" });

    next();
  };
};

export const onlySuperUser = authorizeRoles("superuser");

/**
 * Middleware dinámico que verifica si el rol del usuario tiene el permiso
 * habilitado en la tabla `roles_permisos` (respaldado por caché en memoria).
 * Permite superuser por defecto.
 */
export const checkPermission = (...claves: string[]) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "Token requerido o usuario no autenticado" });
    }

    const rol = req.user.rol;

    // Superuser siempre tiene acceso total
    if (rol === "superuser") {
      return next();
    }

    try {
      for (const clave of claves) {
        const permitido = await PermisoService.tienePermiso(rol, clave);
        if (permitido) {
          return next();
        }
      }

      return res.status(403).json({
        message: `No tienes permisos para realizar esta acción. Requerido: [${claves.join(", ")}]`,
      });
    } catch (error: any) {
      console.error("Error en middleware checkPermission:", error);
      return res
        .status(500)
        .json({ message: "Error verificando permisos", error: error.message });
    }
  };
};
