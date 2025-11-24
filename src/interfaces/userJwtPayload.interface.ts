// src/interfaces/userJwtPayload.interface.ts
export interface IUserJwtPayload {
    id: number;
    email: string;
    rol: string;
    empresa_id?: number;
    centro_costo_id?: number;
}
