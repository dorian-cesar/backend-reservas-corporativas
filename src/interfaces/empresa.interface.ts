// src/interfaces/empresa.interface.ts

export interface ITramoInput {
    monto_desde: number;
    monto_hasta?: number | null;
    porcentaje_descuento: number;
}

export interface IEmpresaCreate {
    rut?: string;
    nombre: string;
    cuenta_corriente?: string;
    estado?: boolean;
    recargo?: number;
    porcentaje_devolucion?: number;
    dia_facturacion?: number;
    dia_vencimiento?: number;
    monto_maximo?: number;
    monto_acumulado?: number;
    newLogin?: boolean;
    fact_manual?: boolean;
    tipo_facturacion?: "Masiva" | "Especial";
    contacto_fact_nombre?: string;
    contacto_fact_email?: string;
    contacto_fact_telefono?: string;
    ejecutivo_com_nombre?: string;
    ejecutivo_com_email?: string;
    ejecutivo_com_telefono?: string;
    tramos?: ITramoInput[];
}

export interface IEmpresaUpdate {
    rut?: string;
    nombre?: string;
    cuenta_corriente?: string;
    estado?: boolean;
    recargo?: number;
    porcentaje_devolucion?: number;
    dia_facturacion?: number;
    dia_vencimiento?: number;
    monto_maximo?: number;
    monto_acumulado?: number;
    newLogin?: boolean;
    fact_manual?: boolean;
    tipo_facturacion?: "Masiva" | "Especial";
    contacto_fact_nombre?: string;
    contacto_fact_email?: string;
    contacto_fact_telefono?: string;
    ejecutivo_com_nombre?: string;
    ejecutivo_com_email?: string;
    ejecutivo_com_telefono?: string;
    tramos?: ITramoInput[];
}