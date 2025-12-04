// src/interfaces/empresa.interface.ts

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
}