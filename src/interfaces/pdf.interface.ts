export interface TicketPDFData {
    origen: {
        origen: string;
        fecha_viaje: Date | string;
        hora_salida: string;
    };
    destino: {
        destino: string;
    };
    boleto: {
        numero_asiento: string;
        numero_ticket: string;
        pnr_number?: string;
        estado_confirmacion: string;
    };
    pasajero: {
        nombre: string;
        documento: string;
        correo?: string;
        precio_original: number;
        precio_boleto: number;
        precio_devolucion: number;
    };
    empresa?: {
        nombre: string;
        rut?: string;
        cuenta_corriente?: string;
    };
    cliente?: {
        nombre: string;
        rut?: string;
    };
}