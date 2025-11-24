import { TipoMovimiento } from "../models/cuenta_corriente.model";

export interface ICuentaCorrienteCreate {
    empresa_id: number;
    tipo_movimiento: TipoMovimiento;
    monto: number;
    descripcion?: string;
    referencia?: string;
}
