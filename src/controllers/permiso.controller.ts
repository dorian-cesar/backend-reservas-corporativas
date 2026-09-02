import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { PermisoService } from "../services/permiso.service";

/**
 * GET /api/permisos
 * Obtener la matriz completa de roles y permisos (solo superuser)
 */
export const getMatrizPermisos = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const matriz = await PermisoService.obtenerMatrizCompleta();
    return res.json({
      total: matriz.length,
      permisos: matriz,
    });
  } catch (error: any) {
    console.error("Error al obtener matriz de permisos:", error);
    return res.status(500).json({
      message: "Error al obtener la matriz de permisos",
      error: error.message,
    });
  }
};

/**
 * PUT /api/permisos/:id
 * Actualizar el permiso de un rol específico para una acción (solo superuser)
 * Body: { rol: string, valor: boolean }
 */
export const updatePermiso = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rol, valor } = req.body;

    if (!id || !rol || typeof valor !== "boolean") {
      return res.status(400).json({
        message: "Datos incompletos. Se requiere id, rol y valor (boolean)",
      });
    }

    const permisoActualizado = await PermisoService.actualizarPermiso(
      id,
      rol,
      valor
    );

    return res.json({
      message: "Permiso actualizado correctamente",
      permiso: permisoActualizado,
    });
  } catch (error: any) {
    console.error("Error al actualizar permiso:", error);
    return res.status(500).json({
      message: "Error al actualizar el permiso",
      error: error.message,
    });
  }
};

/**
 * POST /api/permisos/restablecer
 * Restablecer la matriz de permisos a los valores originales de roles_permisos.xlsx (solo superuser)
 */
export const restablecerPermisos = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    await PermisoService.restablecerExcel();
    const matriz = await PermisoService.obtenerMatrizCompleta();

    return res.json({
      message: "Matriz de roles y permisos restablecida exitosamente desde roles_permisos.xlsx",
      total: matriz.length,
      permisos: matriz,
    });
  } catch (error: any) {
    console.error("Error al restablecer permisos:", error);
    return res.status(500).json({
      message: "Error al restablecer la matriz de permisos",
      error: error.message,
    });
  }
};

/**
 * GET /api/permisos/mis-permisos
 * Obtener el mapa de permisos del usuario autenticado actual
 */
export const getMisPermisos = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const rol = req.user?.rol || "subusuario";
    const permisos = await PermisoService.obtenerPermisosRol(rol);

    return res.json({
      rol,
      permisos,
    });
  } catch (error: any) {
    console.error("Error al obtener mis permisos:", error);
    return res.status(500).json({
      message: "Error al obtener permisos de usuario",
      error: error.message,
    });
  }
};
