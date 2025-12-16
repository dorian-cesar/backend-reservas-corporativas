import { IUser } from "../../models/user.model";

export const USER_FIELD_MAP: Record<string, keyof IUser> = {
    nombre: "nombre",
    nombres: "nombre",
    name: "nombre",

    rut: "rut",
    dni: "rut",

    email: "email",
    correo: "email",
    mail: "email",

    rol: "rol",
    perfil: "rol",

    empresa_id: "empresa_id",
    id_empresa: "empresa_id",

    centro_costo_id: "centro_costo_id",
    id_centro_costo: "centro_costo_id",
    centro_costo: "centro_costo_id",

    estado: "estado",
    activo: "estado",
};

export function normalizeHeader(header: string): string {
    return header
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
}

export function mapCSVRow(row: Record<string, string>): Partial<IUser> {
    const mapped: Partial<IUser> = {};

    for (const key of Object.keys(row)) {
        const normalized = normalizeHeader(key);
        const modelField = USER_FIELD_MAP[normalized];

        if (modelField) {
            let value: any = row[key]?.trim();

            if (modelField === "estado") {
                value = !["false", "0", "no"].includes(value.toLowerCase());
            }

            if (["empresa_id", "centro_costo_id"].includes(modelField)) {
                value = value ? parseInt(value, 10) : undefined;
            }

            mapped[modelField] = value;
        }
    }

    return mapped;
}
