import { IEmpresaCreate } from "../../interfaces/empresa.interface";

export const EMPRESA_FIELD_MAP: Record<string, keyof IEmpresaCreate> = {
    // Nombre
    nombre_empresa: "nombre",
    nombre: "nombre",
    name: "nombre",
    empresa: "nombre",
    razon_social: "nombre",

    // RUT
    rut: "rut",
    rut_empresa: "rut",
    identificacion: "rut",
    documento: "rut",

    // Cuenta corriente
    cuenta_corriente: "cuenta_corriente",
    cuenta: "cuenta_corriente",
    nro_cuenta: "cuenta_corriente",
    cuenta_bancaria: "cuenta_corriente",

    // Estado
    estado: "estado",
    activo: "estado",
    status: "estado",
    activa: "estado",

    // Recargo
    recargo: "recargo",
    porcentaje_recargo: "recargo",
    cargo_extra: "recargo",

    // Porcentaje devolución
    porcentaje_devolucion: "porcentaje_devolucion",
    devolucion: "porcentaje_devolucion",
    retorno: "porcentaje_devolucion",
    porcentaje_retorno: "porcentaje_devolucion",

    // Día facturación
    dia_facturacion: "dia_facturacion",
    dia_factura: "dia_facturacion",
    facturacion: "dia_facturacion",

    // Día vencimiento
    dia_vencimiento: "dia_vencimiento",
    vencimiento: "dia_vencimiento",
    plazo_vencimiento: "dia_vencimiento",

    // Monto máximo
    monto_maximo: "monto_maximo",
    maximo: "monto_maximo",
    limite_maximo: "monto_maximo",
    cupo_maximo: "monto_maximo",

    // Monto acumulado
    monto_acumulado: "monto_acumulado",
    acumulado: "monto_acumulado",
    saldo_acumulado: "monto_acumulado",
    consumo_acumulado: "monto_acumulado",

    // Facturación Manual / Automática
    fact_manual: "fact_manual",
    facturacion_manual: "fact_manual",
    facturacion_automatica: "fact_manual",

    // Morosidad
    morosidad: "morosidad",
    estado_morosidad: "morosidad",
    moroso: "morosidad",
};

export function normalizeHeader(header: string): string {
    return header
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
}

export function mapCSVRow(row: Record<string, string>): Partial<IEmpresaCreate> {
    const mapped: Partial<IEmpresaCreate> = {};

    for (const key of Object.keys(row)) {
        const normalized = normalizeHeader(key);
        const modelField = EMPRESA_FIELD_MAP[normalized];

        if (modelField) {
            let value: any = row[key]?.trim();

            // Procesamiento especial por tipo de campo
            if (modelField === "estado") {
                const isActive = !["false", "0", "no", "inactivo", "inactive", "cerrado", "cerrada"].includes(
                    value.toLowerCase()
                );
                value = isActive;
            }

            if (modelField === "fact_manual") {
                if (normalized === "facturacion_automatica") {
                    const isAuto = ["true", "1", "si", "sí", "active", "activo"].includes(value.toLowerCase());
                    value = !isAuto;
                } else {
                    const isManual = ["true", "1", "si", "sí", "manual"].includes(value.toLowerCase());
                    value = isManual;
                }
            }

            if (modelField === "morosidad") {
                const isMoroso = ["true", "1", "si", "sí", "moroso", "morosidad"].includes(value.toLowerCase());
                value = isMoroso;
            }

            // Campos numéricos
            if (["recargo", "dia_facturacion", "dia_vencimiento", "monto_maximo", "monto_acumulado"].includes(modelField)) {
                value = value ? parseFloat(value) : undefined;
            }

            // Campo decimal
            if (modelField === "porcentaje_devolucion") {
                value = value ? parseFloat(value) : 0.0;
            }

            mapped[modelField] = value;
        }
    }

    return mapped;
}