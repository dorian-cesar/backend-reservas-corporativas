export interface ICentroCostoCreate {
    nombre: string;
    empresa_id: number;
    estado?: boolean;
}

export interface ICentroCostoUpdate {
    nombre?: string;
    estado?: boolean;
}
