// src/interfaces/empresa.interface.ts

export interface IEmpresaCreate {
    nombre: string;
    estado?: boolean;
    recargo?: number;
    porcentaje_devolucion?: number;
    dia_facturacion?: number;
    dia_vencimiento?: number;
    monto_maximo?: number;
}

export interface IEmpresaUpdate {
    nombre?: string;
    estado?: boolean;
    recargo?: number;
    porcentaje_devolucion?: number;
    dia_facturacion?: number;
    dia_vencimiento?: number;
    monto_maximo?: number;
}
