import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface TicketPDFData {
    origen: {
        origen: string;
        fecha_viaje: string;
        hora_salida: string;
    };
    destino: {
        destino: string;
    };
    boleto: {
        numero_asiento: string;
        numero_ticket: string;
        estado_confirmacion: string;
    };
    pasajero: {
        nombre: string;
        documento: string;
        precio_original: number;
        precio_boleto: number;
        precio_devolucion: number;
    };
}

export const generateTicketPDF = async (ticketData: TicketPDFData): Promise<Uint8Array> => {
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
    page.drawText(`Nº DE RESERVA: ${ticketData.boleto.numero_ticket}`, {
        x: leftSectionX + 15,
        y: yPosition - 30,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    // page.drawText('EMPRESA: PULLMAN BUS', {
    //     x: leftSectionX + 180,
    //     y: yPosition - 30,
    //     size: 10,
    //     font: fontBold,
    //     color: rgb(0, 0, 0),
    // });

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

    page.drawText(ticketData.origen.origen, {
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

    page.drawText(`Fecha de viaje: ${formatDate(ticketData.origen.fecha_viaje)}`, {
        x: leftSectionX + 15,
        y: originY - 15,
        size: 10,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Hora de salida: ${ticketData.origen.hora_salida}`, {
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

    page.drawText(ticketData.destino.destino, {
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

    page.drawText(`Nº ASIENTO: ${ticketData.boleto.numero_asiento}`, {
        x: leftSectionX + 15,
        y: yPosition - 180,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    // Sección derecha - Primera fila
    const rightFirstY = yPosition;

    // Caja de pasajero
    page.drawRectangle({
        x: rightSectionX,
        y: rightFirstY - 90,
        width: rightSectionWidth,
        height: 90,
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
        x: rightSectionX + 80,
        y: rightFirstY - 25,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText(`RUT / Pasaporte: ${ticketData.pasajero.documento}`, {
        x: rightSectionX + 10,
        y: rightFirstY - 45,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`Precio Pasaje: CLP$ ${formatNumber(ticketData.pasajero.precio_boleto)}`, {
        x: rightSectionX + 10,
        y: rightFirstY - 65,
        size: 9,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
    });

    // Sección de precios
    const priceY = rightFirstY - 90;
    page.drawRectangle({
        x: rightSectionX,
        y: priceY - 100,
        width: rightSectionWidth,
        height: 80,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
    });

    page.drawText('PRECIO NORMAL:', {
        x: rightSectionX + 10,
        y: priceY - 50,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(`$ ${formatNumber(ticketData.pasajero.precio_original)}`, {
        x: rightSectionX + rightSectionWidth - 50,
        y: priceY - 50,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    // Caja total
    page.drawRectangle({
        x: rightSectionX,
        y: priceY - 110,
        width: rightSectionWidth,
        height: 40,
        color: rgb(0, 0.28, 0.67), // Azul #0047ab
    });

    page.drawText('MONTO TOTAL', {
        x: rightSectionX + 10,
        y: priceY - 95,
        size: 10,
        font: fontBold,
        color: rgb(1, 1, 1),
    });

    page.drawText(`$ ${formatNumber(ticketData.pasajero.precio_boleto)}`, {
        x: rightSectionX + rightSectionWidth - 50,
        y: priceY - 95,
        size: 10,
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
        y: contactY - 100,
        width: rightSectionWidth,
        height: 100,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
    });

    page.drawText('¿Cómo contactarnos?', {
        x: rightSectionX + 10,
        y: contactY - 30,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    page.drawText('+56 2 3304 8632', {
        x: rightSectionX + 10,
        y: contactY - 60,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText('clientes@pullmanbus.cl', {
        x: rightSectionX + 10,
        y: contactY - 80,
        size: 9,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
    });

    // Guardar el PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
};

// Función auxiliar para formatear fechas
function formatDate(dateString: string): string {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-CL');
    } catch {
        return dateString;
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