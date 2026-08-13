import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
const { PDFParse } = require("pdf-parse");

interface EDPDatos {
    edpId?: string;
    empresaNombre?: string;
    rut?: string;
    cuentaCorriente?: string;
    periodoReservas?: string;
    totalTickets: number;
    ticketsAnulados: number;
    ticketsConfirmados: number;
    devolucionesDentro: number;
    devolucionesFuera: number;
    descuentoReclamos: number;
    montoConfirmados: number;
    descuentoTramos: number;
    montoTotalEDP: number;
    montoEDPFinal: number;
    // Suma individual de filas de boletos en Excel
    sumaFilasMontoOriginal?: number;
    sumaFilasDevolucion?: number;
    sumaFilasMontoNeto?: number;
}

const parseMonto = (valStr?: string | number): number => {
    if (typeof valStr === "number") return valStr;
    if (!valStr) return 0;
    const clean = String(valStr).replace(/[^0-9-]/g, "");
    return Number(clean) || 0;
};

const parseCantidad = (valStr?: string | number): number => {
    if (typeof valStr === "number") return valStr;
    if (!valStr) return 0;
    const match = String(valStr).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
};

async function parsePDF(pdfPath: string): Promise<EDPDatos> {
    const buffer = fs.readFileSync(pdfPath);
    const parser = new PDFParse({ data: buffer });
    await parser.load();
    const pdfText = (await parser.getText()).text;

    const getRegexValue = (regex: RegExp): string => {
        const m = pdfText.match(regex);
        return m ? m[1].trim() : "";
    };

    const edpId = getRegexValue(/ESTADO DE PAGO \(EDP\) N° \[?(\d+)\]?/i);
    const empresaNombre = getRegexValue(/Nombre Empresa\s*:\s*(.*)/i);
    const rut = getRegexValue(/Rut Empresa\s*:\s*(.*)/i);
    const cuentaCorriente = getRegexValue(/Cuenta Corriente\s*:\s*(.*)/i);
    const periodoReservas = getRegexValue(/Período de Reservas\s*:\s*(.*)/i);

    const totalTickets = parseCantidad(getRegexValue(/A\.\s*Total Tickets Generados\s*:\s*(\d+)/i));
    const ticketsAnulados = parseCantidad(getRegexValue(/B\.\s*Total Tickets Anulados\s*:\s*(\d+)/i));
    const ticketsConfirmados = parseCantidad(getRegexValue(/C\.\s*Tickets Confirmados.*:\s*(\d+)/i));

    const devolucionesDentro = parseMonto(getRegexValue(/D\.\s*Devoluciones por anulación dentro del periodo\s*:\s*\$?([\d\.\,-]+)/i));
    const devolucionesFuera = parseMonto(getRegexValue(/E\.\s*Devoluciones por anulación de periodo anterior\s*:\s*\$?([\d\.\,-]+)/i));
    const descuentoReclamos = parseMonto(getRegexValue(/F\.\s*Descuentos por Reclamos\s*:\s*\$?([\d\.\,-]+)/i));
    const montoConfirmados = parseMonto(getRegexValue(/G\.\s*Monto Tickets Confirmados\s*:\s*\$?([\d\.\,-]+)/i));
    const descuentoTramos = parseMonto(getRegexValue(/H\.\s*Monto Descuento por tramos.*:\s*\$?([\d\.\,-]+)/i));
    const montoTotalEDP = parseMonto(getRegexValue(/I\.\s*Monto Total EDP.*:\s*\$?([\d\.\,-]+)/i));
    const montoEDPFinal = parseMonto(getRegexValue(/J\.\s*Monto EDP Final.*:\s*\$?([\d\.\,-]+)/i));

    return {
        edpId,
        empresaNombre,
        rut,
        cuentaCorriente,
        periodoReservas,
        totalTickets,
        ticketsAnulados,
        ticketsConfirmados,
        devolucionesDentro,
        devolucionesFuera,
        descuentoReclamos,
        montoConfirmados,
        descuentoTramos,
        montoTotalEDP,
        montoEDPFinal,
    };
}

async function parseExcel(excelPath: string): Promise<EDPDatos> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
    const sheet = workbook.getWorksheet("Tickets") || workbook.getWorksheet(1);
    if (!sheet) throw new Error("No se encontró la hoja 'Tickets' en el archivo Excel.");

    let totalTickets = 0;
    let ticketsAnulados = 0;
    let ticketsConfirmados = 0;
    let devolucionesDentro = 0;
    let devolucionesFuera = 0;
    let descuentoReclamos = 0;
    let montoConfirmados = 0;
    let descuentoTramos = 0;
    let montoTotalEDP = 0;
    let montoEDPFinal = 0;

    let sumaFilasMontoOriginal = 0;
    let sumaFilasDevolucion = 0;
    let sumaFilasMontoNeto = 0;

    sheet.eachRow((row, rowNumber) => {
        const vals = (row.values as any[]).map(v => v ? String(v).trim() : "");
        const firstCol = vals[1] || "";

        // Sumar filas de datos individuales de tickets (filas desde la 5 hasta antes de TOTALES/RESUMEN)
        if (rowNumber >= 5 && !firstCol.startsWith("TOTALES") && !firstCol.startsWith("RESUMEN") && !firstCol.startsWith("A.") && !firstCol.startsWith("B.") && !firstCol.startsWith("C.") && !firstCol.startsWith("D.") && !firstCol.startsWith("E.") && !firstCol.startsWith("F.") && !firstCol.startsWith("G.") && !firstCol.startsWith("H.") && !firstCol.startsWith("I.") && !firstCol.startsWith("J.") && firstCol !== "") {
            const mOriginal = parseMonto(vals[9]);
            const mDevolucion = parseMonto(vals[10]);
            const mNeto = parseMonto(vals[11]);

            sumaFilasMontoOriginal += mOriginal;
            sumaFilasDevolucion += mDevolucion;
            sumaFilasMontoNeto += mNeto;
        }

        if (firstCol.startsWith("A. Total Tickets Generados")) {
            totalTickets = parseCantidad(vals[3]);
        } else if (firstCol.startsWith("B. Total Tickets Anulados")) {
            ticketsAnulados = parseCantidad(vals[3]);
            devolucionesDentro = parseMonto(vals[5]);
        } else if (firstCol.startsWith("C. Tickets Confirmados")) {
            ticketsConfirmados = parseCantidad(vals[3]);
        } else if (firstCol.startsWith("D. Devoluciones por anulación dentro")) {
            devolucionesDentro = parseMonto(vals[5]);
        } else if (firstCol.startsWith("E. Devoluciones por anulación de período anterior")) {
            devolucionesFuera = parseMonto(vals[5]);
        } else if (firstCol.startsWith("F. Descuentos por Reclamos")) {
            descuentoReclamos = parseMonto(vals[5]);
        } else if (firstCol.startsWith("G. Monto Tickets Confirmados")) {
            montoConfirmados = parseMonto(vals[5]);
        } else if (firstCol.startsWith("H. Monto Descuento por Tramos")) {
            descuentoTramos = parseMonto(vals[5]);
        } else if (firstCol.startsWith("I. Monto Total EDP")) {
            montoTotalEDP = parseMonto(vals[5]);
        } else if (firstCol.startsWith("J. MONTO EDP FINAL")) {
            montoEDPFinal = parseMonto(vals[5]);
        }
    });

    return {
        totalTickets,
        ticketsAnulados,
        ticketsConfirmados,
        devolucionesDentro,
        devolucionesFuera,
        descuentoReclamos,
        montoConfirmados,
        descuentoTramos,
        montoTotalEDP,
        montoEDPFinal,
        sumaFilasMontoOriginal,
        sumaFilasDevolucion,
        sumaFilasMontoNeto,
    };
}

async function main() {
    console.log("===============================================================================");
    console.log("📊 SCRIPT DE VALIDACIÓN Y QUADRATURA: EDP PDF vs EXCEL (pdf_pruebas_edp)");
    console.log("===============================================================================\n");

    const folderPath = path.join(process.cwd(), "pdf_pruebas_edp");
    if (!fs.existsSync(folderPath)) {
        console.error(`❌ La carpeta '${folderPath}' no existe.`);
        return;
    }

    const files = fs.readdirSync(folderPath);
    const pdfFiles = files.filter((f) => f.toLowerCase().endsWith(".pdf"));
    const excelFiles = files.filter((f) => f.toLowerCase().endsWith(".xlsx"));

    if (pdfFiles.length === 0 || excelFiles.length === 0) {
        console.log(`⚠️ Se encontraron ${pdfFiles.length} archivos PDF y ${excelFiles.length} archivos Excel en '${folderPath}'.`);
        console.log("Por favor coloca al menos un archivo .pdf y un archivo .xlsx para realizar la validación.");
        return;
    }

    console.log(`Archivos detectados en 'pdf_pruebas_edp':`);
    console.log(` - PDFs  (${pdfFiles.length}):`, pdfFiles);
    console.log(` - Excels (${excelFiles.length}):`, excelFiles);
    console.log("-------------------------------------------------------------------------------\n");

    for (const pdfName of pdfFiles) {
        const pdfPath = path.join(folderPath, pdfName);
        const pdfData = await parsePDF(pdfPath);

        // Buscar Excel correspondiente por EDP ID o coincidencia en la carpeta
        const matchingExcel = excelFiles.find((e) =>
            (pdfData.edpId && e.includes(pdfData.edpId)) ||
            (pdfData.cuentaCorriente && e.includes(pdfData.cuentaCorriente)) ||
            excelFiles.length === 1
        ) || excelFiles[0];

        const excelPath = path.join(folderPath, matchingExcel);
        console.log(`🔍 Evaluando pareja:\n   📄 PDF  : ${pdfName}\n   📊 EXCEL: ${matchingExcel}`);
        console.log(`   🏢 Empresa: ${pdfData.empresaNombre || "No detectada"} (RUT: ${pdfData.rut}, Cta. Cte: ${pdfData.cuentaCorriente})`);
        console.log(`   📅 Período: ${pdfData.periodoReservas || "No detectado"} | EDP ID: ${pdfData.edpId || "No detectado"}`);
        console.log("-------------------------------------------------------------------------------");

        const excelData = await parseExcel(excelPath);

        const checks = [
            { campo: "A. Total Tickets Generados", pdf: pdfData.totalTickets, excel: excelData.totalTickets, esMonto: false },
            { campo: "B. Tickets Anulados (Período)", pdf: pdfData.ticketsAnulados, excel: excelData.ticketsAnulados, esMonto: false },
            { campo: "C. Tickets Confirmados", pdf: pdfData.ticketsConfirmados, excel: excelData.ticketsConfirmados, esMonto: false },
            { campo: "D. Devoluciones Anulación Período", pdf: pdfData.devolucionesDentro, excel: excelData.devolucionesDentro, esMonto: true },
            { campo: "E. Devoluciones Período Anterior", pdf: pdfData.devolucionesFuera, excel: excelData.devolucionesFuera, esMonto: true },
            { campo: "F. Descuentos por Reclamos", pdf: pdfData.descuentoReclamos, excel: excelData.descuentoReclamos, esMonto: true },
            { campo: "G. Monto Tickets Confirmados", pdf: pdfData.montoConfirmados, excel: excelData.montoConfirmados, esMonto: true },
            { campo: "H. Descuento por Tramos", pdf: pdfData.descuentoTramos, excel: excelData.descuentoTramos, esMonto: true },
            { campo: "I. Monto Total EDP (Subtotal)", pdf: pdfData.montoTotalEDP, excel: excelData.montoTotalEDP, esMonto: true },
            { campo: "J. MONTO EDP FINAL (Facturar)", pdf: pdfData.montoEDPFinal, excel: excelData.montoEDPFinal, esMonto: true },
        ];

        let todoCuadrado = true;

        checks.forEach((chk) => {
            const coincide = chk.pdf === chk.excel;
            if (!coincide) todoCuadrado = false;

            const icon = coincide ? "✅" : "❌";
            const statusStr = coincide ? "CUADRADO" : "DISCREPANCIA";
            const formatVal = (v: number) => chk.esMonto ? `$${v.toLocaleString("es-CL")}` : String(v);

            console.log(
                `   ${icon} [${statusStr}] ${chk.campo.padEnd(36)} | PDF: ${formatVal(chk.pdf).padStart(12)} | Excel: ${formatVal(chk.excel).padStart(12)}`
            );
        });

        console.log("-------------------------------------------------------------------------------");
        if (todoCuadrado) {
            console.log(`🎉 VEREDICTO FINAL: ¡TODOS LOS MONTOS Y VALORES ESTÁN 100% CUADRADOS ENTRE EL PDF Y EL EXCEL!\n`);
        } else {
            console.log(`⚠️ VEREDICTO FINAL: SE DETECTARON DISCREPANCIAS ENTRE EL PDF Y EL EXCEL. REVISAR DETALLE ARRIBA.\n`);
        }
    }
}

main().catch(console.error);
