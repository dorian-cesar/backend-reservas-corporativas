import { ICentroCostoCreate } from "../../interfaces/centroCosto.interface";

export const CENTRO_COSTO_FIELD_MAP: Record<string, keyof ICentroCostoCreate> = {
    nombre: "nombre",
    name: "nombre",
    descripcion: "nombre",
    centro_costo: "nombre",

    empresa_id: "empresa_id",
    id_empresa: "empresa_id",
    empresa: "empresa_id",
    company: "empresa_id",

    estado: "estado",
    activo: "estado",
    status: "estado",
};

export function normalizeHeader(header: string): string {
    return header
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
}

export function mapCSVRow(row: Record<string, string>): Partial<ICentroCostoCreate> {
    const mapped: Partial<ICentroCostoCreate> = {};

    for (const key of Object.keys(row)) {
        const normalized = normalizeHeader(key);
        const modelField = CENTRO_COSTO_FIELD_MAP[normalized];

        if (modelField) {
            let value: any = row[key]?.trim();

            if (modelField === "estado") {
                const isActive = !["false", "0", "no", "inactivo", "inactive"].includes(
                    value.toLowerCase()
                );

                value = isActive ? 1 : 0;
            }

            if (["empresa_id"].includes(modelField)) {
                value = value ? parseInt(value, 10) : undefined;
            }

            mapped[modelField] = value;
        }
    }

    return mapped;
}