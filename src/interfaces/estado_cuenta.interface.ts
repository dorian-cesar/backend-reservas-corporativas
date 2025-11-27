/**
 * Interfaz para el modelo EstadoCuenta.
 */
export interface IEstadoCuenta {
    id?: number;
    empresa_id: number;
    periodo: string;
    fecha_generacion: Date;
    fecha_vencimiento?: Date;
    fecha_facturacion?: Date;
    total_tickets: number;
    total_tickets_anulados: number;
    monto_facturado: number;
    detalle_por_cc: string; // JSON con detalle por centro de costo
    pagado: boolean;
    fecha_pago?: Date;
}
