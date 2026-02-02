import { degrees, drawRectangle, grayscale, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

import bwipjs from "bwip-js";

export interface TicketPDFData {
    ticket: {
        id: number | undefined; // Cambiado a opcional
        ticketNumber: string;
        pnrNumber?: string;
        ticketStatus: string;
        origin: string;
        destination: string;
        terminal_origen: string;
        terminal_destino: string
        travelDate: string;
        departureTime: string;
        seatNumbers: string;
        fare: number;
        monto_boleto: number;
        monto_devolucion: number;
        confirmedAt: string;
        created_at?: string;
        updated_at?: string;
    };
    cliente: {
        id: number | null | undefined; // Cambiado a aceptar undefined
        nombre: string;
        rut: string | null;
        email: string;
        rol: string | null;
    };
    empresa: {
        id: number | null;
        nombre: string;
        rut: string | null;
        cuenta_corriente: string | null;
        estado: boolean | null;
    };
    pasajero: {
        nombre: string;
        rut: string | null;
        correo: string;
    };
}

export interface EDPPDFData {
    edp: {
        numero_edp: string;
        fecha_generacion: string | null;
        periodo_reservas: string | null;
    };
    empresa: {
        id: number;
        nombre: string;
        rut: string;
        cuenta_corriente: string | null;
    };
    resumen: {
        tickets_generados: number;
        tickets_anulados: number;
        suma_devoluciones: number;
        monto_bruto_facturado: number;
        monto_neto?: number;
        porcentaje_descuento?: number;
        monto_descuento?: number;
        monto_final?: number;
    };
    centros_costo: Array<{
        id: number;
        nombre: string;
        cantidad_tickets: number;
        monto_facturado: number;
    }>;
    totales: {
        cantidad_tickets: number;
        monto_facturado: number;
    };
}

export const generateTicketPDFTemplate1 = async (ticketData: TicketPDFData): Promise<Uint8Array> => {
    // Crear un nuevo documento PDF con tamaño A4
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size in points
    const { width, height } = page.getSize();

    // Obtener fuentes
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Configuración
    const margin = 40;
    let yPosition = height - margin;

    const logoPath = path.resolve(__dirname, '../assets/logo-pullman-nuevo.png');
    const logoBytes = fs.readFileSync(logoPath);

    // Incrustar la imagen en el PDF
    const logoImage = await pdfDoc.embedPng(logoBytes);

    const logoDims = logoImage.scale(0.1);

    page.drawImage(logoImage, {
        x: margin,
        y: yPosition - logoDims.height,
        width: logoDims.width,
        height: logoDims.height,
    });

    yPosition -= 80;

    // Información de impresión
    page.drawText('Para subir al bus debe presentar este pasaje impreso o en su celular o no podrá viajar.', {
        x: margin,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0.4, 0.4, 0.4),
    });

    yPosition -= 40;

    // Primera fila - Sección izquierda (Información del viaje)
    const leftSectionX = margin;
    const leftSectionWidth = 350;
    const rightSectionX = leftSectionX + leftSectionWidth + 20;
    const rightSectionWidth = width - rightSectionX - margin;

    // Dibujar borde de la sección izquierda
    page.drawRectangle({
        x: leftSectionX,
        y: yPosition - 200,
        width: leftSectionWidth,
        height: 200,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
    });

    // Encabezado de reserva
    page.drawText(`Nº DE RESERVA: ${ticketData.ticket.ticketNumber}`, {
        x: leftSectionX + 15,
        y: yPosition - 30,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    // Línea divisoria
    page.drawLine({
        start: { x: leftSectionX + 15, y: yPosition - 45 },
        end: { x: leftSectionX + leftSectionWidth - 15, y: yPosition - 45 },
        color: rgb(0.8, 0.8, 0.8),
        thickness: 1,
    });

    // Sección de origen
    const originY = yPosition - 80;
    const destY = yPosition - 80;

    page.drawText('Origen:', {
        x: leftSectionX + 25,
        y: originY,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText(ticketData.ticket.origin, {
        x: leftSectionX + 80,
        y: originY,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    // Marcador naranja para origen (círculo)
    page.drawCircle({
        x: leftSectionX + 15,
        y: originY + 4,
        size: 3,
        borderColor: rgb(1, 0.4, 0),
        borderWidth: 2,
    });

    page.drawText(`Fecha de viaje: ${formatDate(ticketData.ticket.travelDate)}`, {
        x: leftSectionX + 15,
        y: originY - 15,
        size: 10,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Hora de salida: ${ticketData.ticket.departureTime}`, {
        x: leftSectionX + 15,
        y: originY - 30,
        size: 10,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    // Sección de destino
    page.drawText('Destino:', {
        x: leftSectionX + 200,
        y: destY,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText(ticketData.ticket.destination, {
        x: leftSectionX + 255,
        y: destY,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawCircle({
        x: leftSectionX + 190,
        y: originY + 4,
        size: 3,
        borderColor: rgb(1, 0.4, 0),
        borderWidth: 2,
    });

    // Punto dentro del marcador
    page.drawCircle({
        x: leftSectionX + 12,
        y: destY + 6,
        size: 1.5,
        color: rgb(1, 1, 1),
    });

    // Información del asiento
    page.drawLine({
        start: { x: leftSectionX + 15, y: yPosition - 150 },
        end: { x: leftSectionX + leftSectionWidth - 15, y: yPosition - 150 },
        color: rgb(0.8, 0.8, 0.8),
        thickness: 1,
    });

    page.drawText(`Nº ASIENTO: ${ticketData.ticket.seatNumbers}`, {
        x: leftSectionX + 15,
        y: yPosition - 180,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    // PNR Number si existe
    if (ticketData.ticket.pnrNumber) {
        page.drawText(`PNR: ${ticketData.ticket.pnrNumber}`, {
            x: leftSectionX + 130,
            y: yPosition - 180,
            size: 10,
            font: fontBold,
            color: rgb(0, 0, 0),
        });
    }

    // Sección derecha - Primera fila
    const rightFirstY = yPosition;

    // Caja de pasajero
    page.drawRectangle({
        x: rightSectionX,
        y: rightFirstY - 100,
        width: rightSectionWidth,
        height: 100,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
        color: rgb(0.98, 0.98, 0.98),
    });

    page.drawText('PASAJERO:', {
        x: rightSectionX + 10,
        y: rightFirstY - 25,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText(ticketData.pasajero.nombre, {
        x: rightSectionX + 10,
        y: rightFirstY - 40,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText(`RUT / Pasaporte: ${ticketData.pasajero.rut || 'No disponible'}`, {
        x: rightSectionX + 10,
        y: rightFirstY - 55,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Email: ${ticketData.pasajero.correo}`, {
        x: rightSectionX + 10,
        y: rightFirstY - 70,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Precio Pasaje: CLP$ ${formatNumber(ticketData.ticket.monto_boleto)}`, {
        x: rightSectionX + 10,
        y: rightFirstY - 85,
        size: 9,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
    });

    // Sección de cliente y empresa
    const clientY = rightFirstY - 100;

    page.drawRectangle({
        x: rightSectionX,
        y: clientY - 100,
        width: rightSectionWidth,
        height: 100,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
        color: rgb(0.98, 0.98, 0.98),
    });

    page.drawText('CLIENTE:', {
        x: rightSectionX + 10,
        y: clientY - 20,
        size: 9,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText(ticketData.cliente.nombre, {
        x: rightSectionX + 10,
        y: clientY - 35,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    if (ticketData.cliente.rut) {
        page.drawText(`RUT: ${ticketData.cliente.rut}`, {
            x: rightSectionX + 10,
            y: clientY - 50,
            size: 8,
            font: font,
            color: rgb(0.2, 0.2, 0.2),
        });
    }

    page.drawText('EMPRESA:', {
        x: rightSectionX + 10,
        y: clientY - 70,
        size: 9,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText(ticketData.empresa.nombre, {
        x: rightSectionX + 10,
        y: clientY - 85,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    // if (ticketData.empresa.rut) {
    //     page.drawText(`RUT: ${ticketData.empresa.rut}`, {
    //         x: rightSectionX + 10,
    //         y: clientY - 100,
    //         size: 8,
    //         font: font,
    //         color: rgb(0.2, 0.2, 0.2),
    //     });
    // }

    // Caja total
    page.drawRectangle({
        x: rightSectionX,
        y: clientY - 170,
        width: rightSectionWidth,
        height: 50,
        color: rgb(0, 0.28, 0.67), // Azul #0047ab
    });

    page.drawText('MONTO TOTAL', {
        x: rightSectionX + 10,
        y: clientY - 150,
        size: 10,
        font: fontBold,
        color: rgb(1, 1, 1),
    });

    page.drawText(`${formatNumber(ticketData.ticket.monto_boleto)}`, {
        x: rightSectionX + rightSectionWidth - 50,
        y: clientY - 150,
        size: 12,
        font: fontBold,
        color: rgb(1, 1, 1),
    });

    // Segunda fila
    const secondRowY = yPosition - 320;

    // Sección de instrucciones (izquierda)
    page.drawRectangle({
        x: leftSectionX,
        y: secondRowY - 280,
        width: leftSectionWidth,
        height: 310,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
    });

    // Recordatorio
    page.drawRectangle({
        x: leftSectionX,
        y: secondRowY + 50,
        width: leftSectionWidth,
        height: 50,
        color: rgb(0.98, 0.98, 0.98),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
    });

    // Barra naranja lateral
    page.drawRectangle({
        x: leftSectionX,
        y: secondRowY + 50,
        width: 4,
        height: 50,
        color: rgb(1, 0.4, 0),
    });

    page.drawText('Recuerda presentarte al menos una (1) hora antes de la hora señalada.', {
        x: leftSectionX + 25,
        y: secondRowY + 70,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
        maxWidth: leftSectionWidth - 45,
    });

    // Términos y condiciones
    const terms = [
        'Este pasaje es válido para la fecha y hora señalada. La hora de llegada al destino es aproximada.',
        'Los servicios adquiridos en pullmanbus.cl, pueden ser prestados por Pullman Bus o Buses Nilahue.',
        'Todo servicio con origen o destino Punta Arenas, será ejecutado por Pullman Austral.',
        'No se aceptarán boletos rotos, enmendados, ilegibles o con adulteración.',
        'La empresa se reserva el derecho de cambiar el Nº de asiento o el horario por motivos de fuerza mayor.',
        'Los cambios en los boletos están permitidos hasta cuatro (4) horas antes de la hora salida del bus.',
        'Las anulaciones de pasajes pueden realizarse únicamente hasta cuatro (4) horas antes de la hora de salida.',
        'En caso de anulación de pasajes, la empresa de buses se reserva el derecho de retener el 15% del valor.',
        'Las devoluciones de dinero por anulación son procesadas en 7-10 días hábiles.',
        'Los pasajes emitidos con boletos de cuponeras no tendrán opción de cambio ni anulación.',
        'Cada pasajero tendrá derecho a 30kg de equipaje.',
        'En viajes de más de 2 horas, el pasajero debe entregar la información necesaria para evitar un sumario sanitario.',
        'Es responsabilidad del pasajero contar con la documentación necesaria.',
        'Para viajes internacionales los itinerarios están sujetos a cambios sin previo aviso.'
    ];

    let termsY = secondRowY + 5;
    terms.forEach(term => {
        // Dibujar punto de lista
        page.drawText('•', {
            x: leftSectionX + 15,
            y: termsY,
            size: 8,
            font: font,
            color: rgb(0.2, 0.2, 0.2),
        });

        const lines = splitTextIntoLines(term, leftSectionWidth - 40, 7, font);
        lines.forEach(line => {
            page.drawText(line, {
                x: leftSectionX + 25,
                y: termsY,
                size: 7,
                font: font,
                color: rgb(0.2, 0.2, 0.2),
            });
            termsY -= 12;
        });

        termsY -= 5; // Espacio entre términos
    });

    // Sección de contacto (derecha)
    const contactY = secondRowY + 100;
    page.drawRectangle({
        x: rightSectionX,
        y: contactY - 150,
        width: rightSectionWidth,
        height: 80,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
    });

    page.drawText('¿Cómo contactarnos?', {
        x: rightSectionX + 10,
        y: contactY - 95,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText('+56 2 3304 8632', {
        x: rightSectionX + 10,
        y: contactY - 115,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText('clientes@pullmanbus.cl', {
        x: rightSectionX + 10,
        y: contactY - 130,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    // Guardar el PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
};

export const generateTicketPDFTemplate2 = async (ticketData: TicketPDFData): Promise<Uint8Array> => {
    // Crear un nuevo documento PDF con tamaño A4
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size in points
    const { width, height } = page.getSize();

    // Obtener fuentes
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Configuración
    const margin = 40;
    let yPosition = height - margin;

    const logoPath = path.resolve(__dirname, '../assets/logo-pullman-nuevo.png');
    const logoBytes = fs.readFileSync(logoPath);

    const barcodePng = await generateBarcodePng(ticketData.ticket.pnrNumber || ticketData.ticket.ticketNumber);

    const barcodeImg = await pdfDoc.embedPng(barcodePng);
    const scaled = barcodeImg.scale(1); // puedes ajustar a gusto

    const watermarkText = "NO REEMBOLSABLE";


    page.drawText('BOLETO ELECTRÓNICO', {
        x: margin,
        y: yPosition,
        size: 12,
        font: fontBold,
        color: rgb(0.4, 0.4, 0.4),
    });

    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.1);

    page.drawImage(logoImage, {
        x: margin,
        y: yPosition - (logoDims.height + 10),
        width: logoDims.width,
        height: logoDims.height,
    });

    page.drawText('Debe acreditar domicilio particular habitual y/o lugar de trabajo en la I o XV Región del país, en control o aduana\n' +
        'sanitaria, bajo su responsabilidad.', {
        x: margin,
        y: yPosition - 80,
        size: 10,
        font: font,
        color: rgb(0.4, 0.4, 0.4),
        lineHeight: 12
    });

    yPosition -= 120;

    // --- Nuevo cálculo de columnas: 3 columnas reales dentro del ancho util ---
    const usableWidth = width - margin * 2;
    const colWidth = usableWidth / 4;
    const col1X = margin + 30;
    const col2X = margin + colWidth + 30;
    const col3X = margin + colWidth * 2 + 10;
    const col4X = margin + colWidth * 3 + 10;
    // -----------------------------------------------------------------------
    // page.drawText(watermarkText, {
    //     x: width / 2 - 200,
    //     y: height - 200,
    //     size: 48,
    //     font: fontBold,
    //     color: rgb(0.8, 0.8, 0.8),
    //     opacity: 0.7,
    //     rotate: degrees(-45),
    // });


    page.drawText('Datos del Servicio', {
        x: margin,
        y: yPosition,
        size: 12,
        font: fontBold,
        color: rgb(252 / 255, 107 / 255, 3 / 255),
        lineHeight: 12,
    });

    page.drawRectangle({
        x: margin,
        y: yPosition - 330,
        width: width - margin * 2,
        height: 310,
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 1,
    });

    // Información de la empresa
    page.drawText('EMPRESA:', {
        x: col1X,
        y: yPosition - 45,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.empresa.nombre, {
        x: col2X,
        y: yPosition - 45,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('RUT EMPRESA:', {
        x: col1X,
        y: yPosition - 65,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.empresa.rut || 'No disponible', {
        x: col2X,
        y: yPosition - 65,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('CUENTA CORRIENTE:', {
        x: col1X,
        y: yPosition - 85,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.empresa.cuenta_corriente || 'No disponible', {
        x: col2X,
        y: yPosition - 85,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    // Información del cliente
    page.drawText('CLIENTE:', {
        x: col1X,
        y: yPosition - 115,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.cliente.nombre, {
        x: col2X,
        y: yPosition - 115,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.cliente.email || '', {
        x: col2X,
        y: yPosition - 130,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.cliente.rut || 'No disponible', {
        x: col4X,
        y: yPosition - 115,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    // Información del pasajero
    page.drawText('PASAJERO:', {
        x: col1X,
        y: yPosition - 150,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.pasajero.nombre, {
        x: col2X,
        y: yPosition - 150,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.pasajero.rut || 'No disponible', {
        x: col4X,
        y: yPosition - 150,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.pasajero.correo || '', {
        x: col2X,
        y: yPosition - 165,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    // Información del viaje
    page.drawText('ORIGEN:', {
        x: col1X,
        y: yPosition - 195,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(`${ticketData.ticket.origin} - ${ticketData.ticket.terminal_origen}`, {
        x: col2X,
        y: yPosition - 195,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('DESTINO:', {
        x: col1X,
        y: yPosition - 215,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(`${ticketData.ticket.destination} - ${ticketData.ticket.terminal_destino}`, {
        x: col2X,
        y: yPosition - 215,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('FECHA VIAJE:', {
        x: col1X,
        y: yPosition - 245,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(formatDate(ticketData.ticket.travelDate), {
        x: col2X,
        y: yPosition - 245,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('HORA VIAJE:', {
        x: col1X,
        y: yPosition - 265,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.ticket.departureTime, {
        x: col2X,
        y: yPosition - 265,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('ASIENTO:', {
        x: col1X,
        y: yPosition - 295,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.ticket.seatNumbers, {
        x: col2X,
        y: yPosition - 295,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('Nº BOLETO:', {
        x: col1X,
        y: yPosition - 315,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.ticket.pnrNumber || '', {
        x: col2X,
        y: yPosition - 315,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('VALOR PAGADO:', {
        x: col3X,
        y: yPosition - 315,
        size: 13,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText(`${formatNumber(ticketData.ticket.monto_boleto)}`, {
        x: col4X,
        y: yPosition - 315,
        size: 16,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
    });



    yPosition -= 360;

    page.drawText('Este boleto es válido únicamente para la fecha y hora indicadas.', {
        x: margin,
        y: yPosition + 10,
        size: 9,
        font: font,
        color: rgb(0.4, 0.4, 0.4),
    });

    page.drawText('Copia Cliente', {
        x: col4X,
        y: yPosition + 10,
        size: 11,
        font: fontBold,
        color: rgb(252 / 255, 107 / 255, 3 / 255),
    });

    page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: margin + (width - margin * 2), y: yPosition },
        thickness: 1,
        color: rgb(0.4, 0.4, 0.4),
        dashArray: [4, 4],
    });

    page.drawRectangle({
        x: margin,
        y: yPosition - 185,
        width: width - margin * 2,
        height: 165,
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 1,
    });


    page.drawImage(barcodeImg, {
        x: col2X - 10,
        y: yPosition - 50,
        width: 200,   // ← bien largo
        height: 15,   // ← bien bajito
    });


    page.drawText('codigoSeguridad', {
        x: col2X + 40,
        y: yPosition - 70,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.ticket.pnrNumber || '', {
        x: col2X + 60,
        y: yPosition - 90,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('FECHA:', {
        x: col1X,
        y: yPosition - 120,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });


    page.drawText(formatDate(ticketData.ticket.travelDate), {
        x: col2X,
        y: yPosition - 120,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('HORA VIAJE:', {
        x: col1X,
        y: yPosition - 140,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(ticketData.ticket.departureTime, {
        x: col2X,
        y: yPosition - 140,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });


    page.drawText('T. ORIGEN:', {
        x: col3X,
        y: yPosition - 120,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(`${ticketData.ticket.terminal_origen}`, {
        x: col4X - 50,
        y: yPosition - 120,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('T. DESTINO:', {
        x: col3X,
        y: yPosition - 140,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(`${ticketData.ticket.terminal_destino}`, {
        x: col4X - 50,
        y: yPosition - 140,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('A PAGAR  :', {
        x: col2X,
        y: yPosition - 170,
        size: 12,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(`${formatNumber(ticketData.ticket.monto_boleto)}`, {
        x: col3X,
        y: yPosition - 170,
        size: 15,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText('Copia Empresa', {
        x: col4X,
        y: yPosition - 210,
        size: 11,
        font: fontBold,
        color: rgb(252 / 255, 107 / 255, 3 / 255),
    });

    yPosition = yPosition - 210;

    page.drawRectangle({
        x: margin,
        y: yPosition - 60,
        width: width - margin * 2,
        height: 50,
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 1,
    });

    page.drawText('CONVENIO RESERVAS CORPORATIVAS (CUENTAS CORRIENTES) – NO ANULAR O DEVOLVER\nEN BOLETERÍAS.', {
        x: col1X,
        y: yPosition - 35,
        size: 10,
        font: fontBold,
        lineHeight: 12
    });

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
};

export const generateEDPPDF = async (edpData: EDPPDFData): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.create();
    const { width, height } = { width: 595, height: 842 };

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 40;
    const tableMargin = 20;
    const bottomMargin = 80;
    let rowHeight = 20;
    const headerHeight = 60;

    let currentPage = pdfDoc.addPage([595, 842]);
    let yPosition = height - margin;

    const addNewPage = () => {
        currentPage = pdfDoc.addPage([595, 842]);
        yPosition = height - margin;
        return currentPage;
    };

    const getAvailableRows = (currentY: number) => {
        const availableHeight = currentY - bottomMargin;
        return Math.floor(availableHeight / rowHeight);
    };

    const drawPageHeader = async (page: any, isFirstPage: boolean = false) => {
        let localY = height - margin;

        const logoPathPullman = path.resolve(__dirname, '../assets/logo-pullman-nuevo.png');
        const logoBytesPullman = fs.readFileSync(logoPathPullman);
        const logoImagePullman = await pdfDoc.embedPng(logoBytesPullman);
        const logoDimsPullman = logoImagePullman.scale(0.05);

        page.drawImage(logoImagePullman, {
            x: margin,
            y: localY - logoDimsPullman.height,
            width: logoDimsPullman.width,
            height: logoDimsPullman.height,
        });

        const logoPathWit = path.resolve(__dirname, '../assets/logo-wit-dark-full.png');
        const logoBytesWit = fs.readFileSync(logoPathWit);
        const logoImageWit = await pdfDoc.embedPng(logoBytesWit);
        const logoDimsWit = logoImageWit.scale(0.02);

        page.drawImage(logoImageWit, {
            x: width - margin - logoDimsWit.width,
            y: localY - logoDimsWit.height,
            width: logoDimsWit.width,
            height: logoDimsWit.height,
        });

        localY -= 60;

        if (isFirstPage) {
            page.drawText(`ESTADO DE PAGO (EDP) N° [${edpData.edp.numero_edp}]`, {
                x: width / 2 - 130,
                y: localY,
                size: 16,
                font: fontBold,
                color: rgb(0, 0, 0),
            });
        } else {
            page.drawText(`EDP N° ${edpData.edp.numero_edp} - Continuación...`, {
                x: margin,
                y: localY,
                size: 12,
                font: fontBold,
                color: rgb(0.5, 0.5, 0.5),
            });
        }

        return localY - 40;
    };

    yPosition = await drawPageHeader(currentPage, true);

    const col1X = margin;
    const col2X = col1X + 150;

    currentPage.drawRectangle({
        x: col1X,
        y: yPosition - 90,
        width: width - margin * 2,
        height: 110,
        borderWidth: 1,
        borderColor: grayscale(0.7),
        opacity: 0.6,
        borderOpacity: 0.8,
    })

    // Nombre Empresa
    currentPage.drawText('Nombre Empresa', {
        x: col1X,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
    });

    currentPage.drawText(`: ${edpData.empresa.nombre}`, {
        x: col2X,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    yPosition -= 20;

    // Rut Empresa
    currentPage.drawText('Rut Empresa', {
        x: col1X,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
    });

    currentPage.drawText(`: ${edpData.empresa.rut}`, {
        x: col2X,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    yPosition -= 20;

    // Cuenta Corriente
    currentPage.drawText('Cuenta Corriente', {
        x: col1X,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
    });

    currentPage.drawText(`: ${edpData.empresa.cuenta_corriente || 'No disponible'}`, {
        x: col2X,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    yPosition -= 20;

    // Fecha de Generación
    currentPage.drawText('Fecha de Generación', {
        x: col1X,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
    });

    currentPage.drawText(`: ${edpData.edp.fecha_generacion || 'No disponible'}`, {
        x: col2X,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    yPosition -= 20;

    // Período de Reservas
    currentPage.drawText('Período de Reservas', {
        x: col1X,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
    });

    currentPage.drawText(`: ${edpData.edp.periodo_reservas || 'No disponible'}`, {
        x: col2X,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    yPosition -= 40;

    currentPage.drawRectangle({
        x: col1X,
        y: yPosition - 100,
        width: width - margin * 2,
        height: 120,
        borderWidth: 1,
        borderColor: grayscale(0.7),
        opacity: 0.6,
        borderOpacity: 0.8,
    })

    currentPage.drawRectangle({
        x: col1X,
        y: yPosition - 10,
        width: width - margin * 2,
        height: 30,
        color: rgb(0.85, 0.85, 0.85),
        opacity: 1,
    })

    currentPage.drawText('Resumen de Operacional', {
        x: margin,
        y: yPosition,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    yPosition -= 30;

    // Total Tickets Generados
    currentPage.drawText(`Total Tickets Generados: ${edpData.resumen.tickets_generados}`, {
        x: margin,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
    });

    yPosition -= 20;

    // Total Tickets Anulados
    currentPage.drawText(`Total Tickets Anulados: ${edpData.resumen.tickets_anulados}`, {
        x: margin,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
    });

    yPosition -= 20;

    // Suma de Devoluciones
    currentPage.drawText(`Suma de Devoluciones: $${formatNumber(edpData.resumen.suma_devoluciones)}`, {
        x: margin,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
    });

    yPosition -= 20;

    // Monto Bruto Facturado
    currentPage.drawText(`Monto Bruto Facturado: $${formatNumber(edpData.resumen.monto_bruto_facturado)}`, {
        x: margin,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });


    if (edpData.totales.monto_facturado !== undefined) {
        yPosition -= 20;
        currentPage.drawText(`Monto Neto Facturado: $${formatNumber(edpData.totales.monto_facturado)}`, {
            x: margin,
            y: yPosition,
            size: 10,
            font: fontBold,
            color: rgb(0, 0.4, 0), // Verde para indicar monto neto
        });
    }

    yPosition -= 40;

    currentPage.drawRectangle({
        x: col1X,
        y: yPosition - 10,
        width: width - margin * 2,
        height: 30,
        color: rgb(0.85, 0.85, 0.85),
        opacity: 1,
    })

    currentPage.drawText('Desglose por Centros de Costos', {
        x: margin,
        y: yPosition,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    yPosition -= 30;

    const tableWidth = width - margin * 2;
    const colWidth = (tableWidth - tableMargin * 2) / 3;

    const colCentroX = margin;
    const colCantidadX = colCentroX + colWidth;
    const colMontoX = colCantidadX + colWidth;

    const drawTableHeaders = (page: any, posY: number) => {
        page.drawText('Centro de Costos', {
            x: colCentroX,
            y: posY,
            size: 10,
            font: fontBold,
            color: rgb(0, 0, 0),
        });

        page.drawText('Cantidad de Tickets', {
            x: colCantidadX,
            y: posY,
            size: 10,
            font: fontBold,
            color: rgb(0, 0, 0),
        });

        page.drawText('Monto Facturado', {
            x: colMontoX,
            y: posY,
            size: 10,
            font: fontBold,
            color: rgb(0, 0, 0),
        });

        const lineY = posY - 10;
        page.drawLine({
            start: { x: margin, y: lineY },
            end: { x: width - margin, y: lineY },
            thickness: 1,
            color: rgb(0.8, 0.8, 0.8),
        });

        return posY - 20;
    };

    yPosition = drawTableHeaders(currentPage, yPosition);

    const totalCentros = edpData.centros_costo.length;
    let centrosProcessed = 0;

    const centrosOrdenados = [...edpData.centros_costo].sort((a, b) => b.monto_facturado - a.monto_facturado);

    rowHeight = rowHeight - 5


    for (const centro of centrosOrdenados) {
        const availableRows = getAvailableRows(yPosition);

        // Si no cabe ni UNA fila → nueva página
        if (availableRows <= 0) {
            addNewPage();
            yPosition = await drawPageHeader(currentPage, false);
            yPosition -= 20;
            yPosition = drawTableHeaders(currentPage, yPosition);
        }

        // Fondo alternado
        const isEven = centrosProcessed % 2 === 0;
        currentPage.drawRectangle({
            x: margin,
            y: yPosition - rowHeight + 10,
            width: tableWidth,
            height: rowHeight,
            color: isEven ? rgb(0.95, 0.95, 0.95) : rgb(1, 1, 1),
        });

        // Contenido
        currentPage.drawText(centro.nombre, {
            x: colCentroX,
            y: yPosition,
            size: 10,
            font,
        });

        currentPage.drawText(centro.cantidad_tickets.toString(), {
            x: colCantidadX,
            y: yPosition,
            size: 10,
            font,
        });

        currentPage.drawText(`$${formatNumber(centro.monto_facturado)}`, {
            x: colMontoX,
            y: yPosition,
            size: 10,
            font,
        });

        yPosition -= rowHeight;
        centrosProcessed++;
    }


    currentPage.drawLine({
        start: { x: margin, y: yPosition + 5 },
        end: { x: width - margin, y: yPosition + 5 },
        thickness: 1,
        color: rgb(0.5, 0.5, 0.5),
    })

    yPosition -= 10;

    currentPage.drawText('TOTALES', {
        x: colCentroX,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    currentPage.drawText(edpData.totales.cantidad_tickets.toString(), {
        x: colCantidadX,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    currentPage.drawText(`$${formatNumber(edpData.totales.monto_facturado)}`, {
        x: colMontoX,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    yPosition -= 60;

    // Firma de conformidad (solo en la última página)
    if (yPosition > 100) { // Verificar que haya espacio
        currentPage.drawText('Firma de conformidad', {
            x: margin,
            y: yPosition,
            size: 12,
            font: fontBold,
            color: rgb(0, 0, 0),
        });

        yPosition -= 40;

        currentPage.drawText('Firma Responsable', {
            x: margin,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0, 0, 0),
        });

        yPosition -= 20;

        // Línea para firma
        currentPage.drawLine({
            start: { x: margin, y: yPosition },
            end: { x: margin + 200, y: yPosition },
            thickness: 1,
            color: rgb(0, 0, 0),
        });
    } else {
        // Si no hay espacio, crear una nueva página para la firma
        addNewPage();
        yPosition = await drawPageHeader(currentPage, false);

        currentPage.drawText('Firma de conformidad', {
            x: margin,
            y: yPosition,
            size: 12,
            font: fontBold,
            color: rgb(0, 0, 0),
        });

        yPosition -= 40;

        currentPage.drawText('Firma Responsable', {
            x: margin,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0, 0, 0),
        });

        yPosition -= 20;

        // Línea para firma
        currentPage.drawLine({
            start: { x: margin, y: yPosition },
            end: { x: margin + 200, y: yPosition },
            thickness: 1,
            color: rgb(0, 0, 0),
        });
    }

    // Agregar número de página en el pie de cada página
    const totalPages = pdfDoc.getPages().length;
    pdfDoc.getPages().forEach((page, index) => {
        const pageNumber = index + 1;
        page.drawText(`Página ${pageNumber} de ${totalPages}`, {
            x: width - margin - 80,
            y: margin - 10,
            size: 8,
            font: font,
            color: rgb(0.5, 0.5, 0.5),
        });

        // Agregar información de la empresa en pie de página
        page.drawText(`Empresa: ${edpData.empresa.nombre}`, {
            x: margin,
            y: margin - 10,
            size: 8,
            font: font,
            color: rgb(0.5, 0.5, 0.5),
        });
    });

    // Guardar el PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
}

export async function generateBarcodePng(text: string): Promise<Buffer> {
    if (!text || text.trim() === "") {
        throw new Error("generateWideBarcode: texto requerido.");
    }

    // Código de barras tipo boarding-pass (largo y bajito)
    return await bwipjs.toBuffer({
        bcid: "code128",     // Tipo de código
        text,
        scaleX: 3,           // ← Más grande horizontalmente
        scaleY: 1,           // ← Más delgado verticalmente
        height: 8,           // ← MUY bajo
        includetext: false,  // No mostrar texto debajo
        paddingwidth: 0,
        paddingheight: 0,
    });
}

// Función auxiliar para formatear fechas
function formatDate(dateString: string): string {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-CL');
    } catch {
        return dateString;
    }
}

// Función auxiliar para formatear fecha y hora
function formatDateTime(dateTimeString?: string): string {
    if (!dateTimeString) return 'No disponible';

    try {
        const date = new Date(dateTimeString);
        return date.toLocaleString('es-CL');
    } catch {
        return dateTimeString;
    }
}

// Función auxiliar para formatear números con separadores de miles
function formatNumber(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Función auxiliar para dividir texto en líneas
function splitTextIntoLines(text: string, maxWidth: number, fontSize: number, font: any): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) {
                lines.push(currentLine);
            }
            currentLine = word;
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines;
}