import { IPasajero } from "../../models/pasajero.model";

export const PASAJERO_FIELD_MAP: Record<string, keyof IPasajero> = {
    nombre: "nombre",
    nombres: "nombre",
    pasajero: "nombre",

    rut: "rut",
    dni: "rut",
    documento: "rut",

    correo: "correo",
    email: "correo",
    mail: "correo",

    id_empresa: "id_empresa",
    empresa: "id_empresa",

    id_centro_costo: "id_centro_costo",
    centro_costo: "id_centro_costo",
    ccosto: "id_centro_costo",

    telefono: "telefono",
    phone: "telefono",
    celular: "telefono",
};

function normalizeHeader(header: string): string {
    return header
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
}

export function mapCSVRow(
    row: Record<string, string>
): Partial<IPasajero> {
    const mapped: Partial<IPasajero> = {};

    for (const key of Object.keys(row)) {
        const normalized = normalizeHeader(key);
        const field = PASAJERO_FIELD_MAP[normalized];

        if (field) {
            let value: any = row[key]?.trim();

            if (["id_empresa", "id_centro_costo"].includes(field)) {
                value = value ? parseInt(value, 10) : undefined;
            }

            mapped[field] = value;
        }
    }

    return mapped;
}
