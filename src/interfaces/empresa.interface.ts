export interface IEmpresaCreate {
    nombre: string;
    estado?: boolean;
    recargo?: number;
    porcentaje_devolucion?: number;
}

export interface IEmpresaUpdate {
    nombre?: string;
    estado?: boolean;
    recargo?: number;
    porcentaje_devolucion?: number;
}
