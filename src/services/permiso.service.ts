import { RolPermiso } from "../models/rol_permiso.model";
import { seedRolesPermisos } from "../script/seedRolesPermisos";

// Roles válidos que corresponden a columnas en la tabla
export const ROLES_VALIDOS = [
  "subusuario",
  "empresa",
  "admin",
  "auditoria",
  "contralor",
  "admincc",
  "superuser",
  "soporte",
] as const;

export type RolValido = (typeof ROLES_VALIDOS)[number];

// Cache en memoria para verificación ultrarrápida (0 ms)
let cachePermisosPorRol = new Map<string, Record<string, boolean>>();
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto de TTL automático

export class PermisoService {
  /**
   * Invalida la caché en memoria para forzar recarga fresca desde la BD
   */
  public static invalidarCache(): void {
    cachePermisosPorRol.clear();
    cacheTimestamp = 0;
  }

  /**
   * Obtiene la matriz completa de roles y permisos ordenada para el Mantenedor
   */
  public static async obtenerMatrizCompleta(): Promise<RolPermiso[]> {
    return await RolPermiso.findAll({
      order: [
        ["id", "ASC"],
      ],
    });
  }

  /**
   * Obtiene un mapa clave -> booleano con todos los permisos asignados a un rol
   */
  public static async obtenerPermisosRol(rol: string): Promise<Record<string, boolean>> {
    const ahora = Date.now();

    // Retornar de caché si está vigente
    if (cachePermisosPorRol.has(rol) && ahora - cacheTimestamp < CACHE_TTL_MS) {
      return cachePermisosPorRol.get(rol)!;
    }

    const todos = await RolPermiso.findAll();
    const mapaPermisos: Record<string, boolean> = {};

    todos.forEach((item) => {
      // Superuser siempre tiene true en todo
      if (rol === "superuser") {
        mapaPermisos[item.clave] = true;
      } else if (ROLES_VALIDOS.includes(rol as RolValido)) {
        const valor = (item as any)[rol];
        mapaPermisos[item.clave] = Boolean(valor);
      } else {
        mapaPermisos[item.clave] = false;
      }
    });

    cachePermisosPorRol.set(rol, mapaPermisos);
    cacheTimestamp = ahora;

    return mapaPermisos;
  }

  /**
   * Verifica si un rol específico tiene habilitada una acción por su clave
   */
  public static async tienePermiso(rol: string, clave: string): Promise<boolean> {
    if (!rol) return false;
    if (rol === "superuser") return true;

    const mapa = await this.obtenerPermisosRol(rol);
    return Boolean(mapa[clave]);
  }

  /**
   * Actualiza el permiso de un rol para una acción específica
   */
  public static async actualizarPermiso(
    id: number,
    rol: string,
    valor: boolean
  ): Promise<RolPermiso> {
    if (!ROLES_VALIDOS.includes(rol as RolValido)) {
      throw new Error(`Rol '${rol}' no es válido para asignación de permisos`);
    }

    const permiso = await RolPermiso.findByPk(id);
    if (!permiso) {
      throw new Error(`Permiso con ID ${id} no encontrado`);
    }

    (permiso as any)[rol] = Boolean(valor);
    await permiso.save();

    // Invalidar caché tras actualización
    this.invalidarCache();

    return permiso;
  }

  /**
   * Restablece la matriz completa a los valores originales de roles_permisos.xlsx
   */
  public static async restablecerExcel(): Promise<void> {
    await seedRolesPermisos();
    this.invalidarCache();
  }
}
