import { Rol } from "../models/user.model";

export interface IUserCreate {
    nombre: string;
    rut?: string;
    email: string;
    password: string;
    rol?: Rol;
    empresa_id?: number;
    centro_costo_id?: number;
}

export interface IUserUpdate {
    nombre?: string;
    rut?: string;
    email?: string;
    password?: string;
    rol?: Rol;
    empresa_id?: number;
    centro_costo_id?: number;
}
