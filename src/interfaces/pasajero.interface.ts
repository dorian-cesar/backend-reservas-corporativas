export interface IPasajeroCreate {
    nombre: string;
    rut: string;
    correo: string;
    id_empresa: number;
    id_centro_costo?: number;
}

export interface IPasajeroUpdate {
    nombre?: string;
    rut?: string;
    correo?: string;
    id_empresa?: number;
    id_centro_costo?: number;
}

export interface IPasajeroFilter {
    nombre?: string;
    rut?: string;
    correo?: string;
    id_empresa?: number;
}