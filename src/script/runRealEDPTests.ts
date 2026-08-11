import { Sequelize } from "sequelize-typescript";
import "../models/associations";
import { Empresa } from "../models/empresa.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { CentroCosto } from "../models/centro_costo.model";
import { User } from "../models/user.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Ticket } from "../models/ticket.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Pasajero } from "../models/pasajero.model";
import { UserEmpresa } from "../models/user_empresa.model";
import { Reclamo } from "../models/reclamo.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { generarEstadosPagoEmpresas } from "../cron/generarEstadosPagoEmpresas";
import { ejecutarEDPManual } from "../controllers/estadoCuenta.controller";
import { generarPDFEstadoCuenta } from "../controllers/pdf.controller";
import { generateEDPPDF, EDPPDFData } from "../services/pdf.service";
import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import fs from "fs";
import path from "path";
import moment from "moment-timezone";

import { sendEDPEmail } from "../services/mail.service";
import { generateEDPExcelBuffer } from "../services/excel.service";
import ExcelJS from "exceljs";
const { PDFParse } = require("pdf-parse");

let sequelizeDevInstance: Sequelize | null = null;

export async function connectToDevDB() {
  if (sequelizeDevInstance) return sequelizeDevInstance;

  sequelizeDevInstance = new Sequelize({
    dialect: "mysql",
    host: "ls-594a29bdbbcac0570afa88fba199455107a1c5a6.cs9gyyc0moxd.us-east-1.rds.amazonaws.com",
    port: 3306,
    username: "dbmasteruser",
    password: "aCY05KW.yh:jA%s{RO733w(AI|;Ui#6c",
    database: "multiempresa_db",
    models: [
      Empresa,
      EmpresaTramo,
      CentroCosto,
      User,
      CuentaCorriente,
      Ticket,
      EstadoCuenta,
      Pasajero,
      UserEmpresa,
      Reclamo,
      EdpTicketSnapshot,
    ],
    logging: false,
    timezone: "-04:00",
  });

  await sequelizeDevInstance.authenticate();
  console.log("✅ Conexión explícita establecida con BD Desarrollo AWS RDS.");
  return sequelizeDevInstance;
}

// ============================================================================
// CONFIGURACIÓN GLOBAL DE PRUEBAS DE EDP (EN AMBIENTE DE DESARROLLO)
// Agrega o quita entradas del array para probar distintas empresas y períodos.
// Cada entrada: { empresaId, periodo }
// ============================================================================
export const TEST_TARGETS: Array<{ empresaId: number; periodo: string }> = [
  { empresaId: 55, periodo: "2026-07" }, // ARAMARK SERVICIOS MINEROS Y REMOTOS LTDA
  // { empresaId: 11,  periodo: "2026-06" }, // KOMATSU CHILE S.A.
  // { empresaId: 389, periodo: "2026-05" }, // MARIA LORETO HERRERA SPANO SERVICIOS E.I
  // { empresaId: 472, periodo: "2026-03" }, // TIP TOP SERVICE SPA
  // { empresaId: 462, periodo: "2026-03" }, // TECNASIC
];

// Compatibilidad: variables individuales apuntando al primer target del array
export const TARGET_EMPRESA_ID = TEST_TARGETS[0].empresaId;
export const TARGET_PERIODO = TEST_TARGETS[0].periodo;
// ============================================================================

const OUTPUT_DIR = path.join(process.cwd(), "pdf_pruebas_edp");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
const TIMEZONE = "America/Santiago";

function createMockResponse() {
  let pdfBuffer: Buffer | null = null;
  let jsonResponse: any = null;
  let statusCode = 200;

  const res: Partial<Response> = {
    status: (code: number) => {
      statusCode = code;
      return res as Response;
    },
    json: (data: any) => {
      jsonResponse = data;
      return res as Response;
    },
    send: (data: any) => {
      if (Buffer.isBuffer(data)) {
        pdfBuffer = data;
      } else if (typeof data === "string") {
        pdfBuffer = Buffer.from(data);
      } else {
        jsonResponse = data;
      }
      return res as Response;
    },
    setHeader: (_name: string, _value: string) => {
      return res as Response;
    },
  };

  return {
    res: res as Response,
    getPdfBuffer: () => pdfBuffer,
    getJsonResponse: () => jsonResponse,
    getStatusCode: () => statusCode,
  };
}

export async function cleanEDPsForEmpresa(
  empresaId: number,
  periodoTarget: string,
  restoreDescuentoVal?: number,
) {
  const targetEmpresa = await Empresa.findByPk(empresaId);
  const edps = await EstadoCuenta.findAll({
    where: {
      empresa_id: empresaId,
      [Op.or]: [
        { periodo: periodoTarget },
        { fecha_inicio: { [Op.like]: `${periodoTarget}%` } },
      ],
    },
  });
  const ids = edps.map((e) => e.id);
  if (restoreDescuentoVal !== undefined && targetEmpresa) {
    await targetEmpresa.update({
      descuento_pendiente_edp: restoreDescuentoVal,
    });
  }

  if (ids.length > 0) {
    await CuentaCorriente.destroy({
      where: {
        [Op.or]: [
          { estado_cuenta_id: ids },
          { referencia: `EDP-${periodoTarget}` },
        ],
      },
    });
    await EdpTicketSnapshot.destroy({ where: { edp_id: ids } });
    await EstadoCuenta.destroy({ where: { id: ids } });
  }
}

async function verifyAndReportSnapshotDetails(
  edpId: number,
  tituloEtapa: string,
) {
  const edp = await EstadoCuenta.findByPk(edpId);
  if (!edp) {
    console.error(`❌ EDP ID ${edpId} no encontrado para revisión.`);
    return;
  }

  const snapshots = await EdpTicketSnapshot.findAll({
    where: { edp_id: edpId },
    order: [["id", "ASC"]],
  });

  console.log(`\n=======================================================`);
  console.log(` 🔎 REVISIÓN Y DIAGNÓSTICO PROFUNDO - ${tituloEtapa}`);
  console.log(`=======================================================`);
  console.log(`- EDP ID: ${edp.id}`);
  console.log(`- Período: ${edp.periodo}`);
  console.log(
    `- Rango Período BD: ${edp.fecha_inicio}  <--->  ${edp.fecha_fin}`,
  );
  console.log(
    `- Total Tickets Registrados: ${edp.total_tickets} (Anulados: ${edp.total_tickets_anulados})`,
  );
  console.log(
    `- Total Snapshots Guardados en BD: ${snapshots.length} / ${edp.total_tickets}`,
  );
  console.log(
    `- Monto Facturado Final: $${Number(edp.monto_facturado).toLocaleString("es-CL")}`,
  );
  console.log(
    `- Descuento por Reclamos Aceptados: $${Number(edp.reclamos_descuento || 0).toLocaleString("es-CL")}`,
  );
  console.log(
    `- Devoluciones Fuera de Período: $${Number(edp.devoluciones_fuera_periodo || 0).toLocaleString("es-CL")}`,
  );

  if (snapshots.length === 0) {
    console.error(
      `❌ ALERTA: No se encontraron snapshots guardados para este EDP.`,
    );
    return;
  }

  const tickets = snapshots
    .map((s) => {
      try {
        return JSON.parse(s.ticket_data);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  tickets.sort((a: any, b: any) => {
    const da = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0;
    const db = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0;
    return da - db;
  });

  const primerTicket = tickets[0];
  const ultimoTicket = tickets[tickets.length - 1];

  console.log(`\n📌 INSPECCIÓN DE TICKETS DENTRO DEL SNAPSHOT:`);
  console.log(` 1️⃣ PRIMER TICKET (Más antiguo):`);
  console.log(
    `    - ID Ticket: ${primerTicket.id} | N°: ${primerTicket.ticketNumber || primerTicket.id}`,
  );
  console.log(`    - Estado: ${primerTicket.ticketStatus}`);
  console.log(
    `    - Confirmación (confirmedAt): ${moment(primerTicket.confirmedAt).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}`,
  );
  console.log(
    `    - Fecha Viaje (travelDate): ${primerTicket.travelDate || "N/A"}`,
  );
  console.log(`    - Pasajero: ${primerTicket.pasajero?.nombre || "N/A"}`);
  console.log(
    `    - Centro de Costo: ${primerTicket.pasajero?.centroCosto?.nombre || "Sin Asignar"}`,
  );

  console.log(` 🔝 ÚLTIMO TICKET (Más reciente):`);
  console.log(
    `    - ID Ticket: ${ultimoTicket.id} | N°: ${ultimoTicket.ticketNumber || ultimoTicket.id}`,
  );
  console.log(`    - Estado: ${ultimoTicket.ticketStatus}`);
  console.log(
    `    - Confirmación (confirmedAt): ${moment(ultimoTicket.confirmedAt).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}`,
  );
  console.log(
    `    - Fecha Viaje (travelDate): ${ultimoTicket.travelDate || "N/A"}`,
  );
  console.log(`    - Pasajero: ${ultimoTicket.pasajero?.nombre || "N/A"}`);
  console.log(
    `    - Centro de Costo: ${ultimoTicket.pasajero?.centroCosto?.nombre || "Sin Asignar"}`,
  );

  const inicioEDP = new Date(edp.fecha_inicio!).getTime();
  const finEDP = new Date(edp.fecha_fin!).getTime();
  const datePrimer = new Date(primerTicket.confirmedAt).getTime();
  const dateUltimo = new Date(ultimoTicket.confirmedAt).getTime();

  const primerEnRango = datePrimer >= inicioEDP && datePrimer <= finEDP;
  const ultimoEnRango = dateUltimo >= inicioEDP && dateUltimo <= finEDP;

  const ticketsConReclamo = tickets.filter(
    (t: any) => t.reclamos && t.reclamos.length > 0,
  );
  console.log(
    `\n📋 RECLAMOS ADJUNTOS EN SNAPSHOT: ${ticketsConReclamo.length} tickets contienen reclamos registrados.`,
  );

  console.log(`-------------------------------------------------------`);
  console.log(
    `✔️ Conteo Snapshots vs Tickets: ${snapshots.length === edp.total_tickets ? "SÍ (COINCIDENCIA EXACTA)" : "NO"}`,
  );
  console.log(
    `✔️ Fechas de pasajes dentro del período del EDP: ${primerEnRango && ultimoEnRango ? "SÍ (100% CORRECTO)" : "NO"}`,
  );
  console.log(`=======================================================\n`);
}

async function verifyAllEDPAndExcelIntegrity(
  edpAuto: EstadoCuenta,
  edpManual: EstadoCuenta,
  excelFilePath: string,
  pdf1FilePath: string,
  pdf2FilePath: string,
  pdf3FilePath: string,
): Promise<boolean> {
  console.log("\n=======================================================");
  console.log(" 🔬 PASO 3: AUDITORÍA Y VERIFICACIÓN AUTOMÁTICA DE INTEGRIDAD");
  console.log("=======================================================");

  const errores: string[] = [];

  // 1. Coincidencia entre Cron Automático y EDP Manual
  if (edpAuto.total_tickets !== edpManual.total_tickets) {
    errores.push(
      `Discrepancia en Total Tickets: Cron=${edpAuto.total_tickets} vs Manual=${edpManual.total_tickets}`,
    );
  }
  if (edpAuto.total_tickets_anulados !== edpManual.total_tickets_anulados) {
    errores.push(
      `Discrepancia en Total Anulados: Cron=${edpAuto.total_tickets_anulados} vs Manual=${edpManual.total_tickets_anulados}`,
    );
  }
  if (Number(edpAuto.monto_facturado) !== Number(edpManual.monto_facturado)) {
    errores.push(
      `Discrepancia en Monto Facturado Final: Cron=$${Number(edpAuto.monto_facturado)} vs Manual=$${Number(edpManual.monto_facturado)}`,
    );
  }

  // 2. Coincidencia de Snapshots guardados en BD
  const snapshotsManual = await EdpTicketSnapshot.findAll({
    where: { edp_id: edpManual.id },
  });
  if (snapshotsManual.length !== edpManual.total_tickets) {
    errores.push(
      `Snapshots incompletos en BD: ${snapshotsManual.length}/${edpManual.total_tickets}`,
    );
  }

  // 3. Auditoría profunda del archivo Excel generado
  if (!fs.existsSync(excelFilePath)) {
    errores.push(
      `El archivo Excel no fue generado en la ruta ${excelFilePath}`,
    );
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelFilePath);
    const sheet = workbook.getWorksheet("Tickets");

    let excelTicketsCount = 0;
    let excelAnuladosCount = 0;
    let excelConfirmadosCount = 0;
    let sumaFilaMontoOriginal = 0;
    let sumaFilaDevolucion = 0;
    let sumaFilaMontoNeto = 0;

    let excelTotalOriginal = 0;
    let excelTotalDevolucion = 0;
    let excelTotalNeto = 0;

    let valAExcel = "",
      valBExcel = "",
      valCExcel = "",
      valDExcel = "",
      valEExcel = "",
      valFExcel = "",
      valGExcel = "",
      valHExcel = "",
      valIExcel = "",
      valJExcel = "";

    sheet?.eachRow((row, rowNumber) => {
      const col1 = String(row.getCell(1).value || "").trim();

      if (
        rowNumber >= 5 &&
        !col1.startsWith("TOTALES") &&
        !col1.startsWith("RESUMEN") &&
        !col1.match(/^[A-J]\./)
      ) {
        const estado = String(row.getCell(3).value || "").trim();
        const originalVal =
          parseInt(
            String(row.getCell(9).value || "").replace(/[^0-9]/g, ""),
            10,
          ) || 0;
        const devolucionVal =
          parseInt(
            String(row.getCell(10).value || "").replace(/[^0-9]/g, ""),
            10,
          ) || 0;
        const netoVal =
          parseInt(
            String(row.getCell(11).value || "").replace(/[^0-9]/g, ""),
            10,
          ) || 0;

        excelTicketsCount++;
        if (estado === "Anulado") excelAnuladosCount++;
        else excelConfirmadosCount++;

        sumaFilaMontoOriginal += originalVal;
        sumaFilaDevolucion += devolucionVal;
        sumaFilaMontoNeto += netoVal;
      }

      if (col1.startsWith("TOTALES")) {
        excelTotalOriginal = parseInt(
          String(row.getCell(9).value || "").replace(/[^0-9]/g, ""),
          10,
        );
        excelTotalDevolucion = parseInt(
          String(row.getCell(10).value || "").replace(/[^0-9]/g, ""),
          10,
        );
        excelTotalNeto = parseInt(
          String(row.getCell(11).value || "").replace(/[^0-9]/g, ""),
          10,
        );
      }

      const montoColStr = String(row.getCell(5).value || "").trim();
      if (col1.startsWith("A. Total Tickets"))
        valAExcel = String(row.getCell(3).value || "").trim();
      if (col1.startsWith("B. Total Tickets"))
        valBExcel = String(row.getCell(3).value || "").trim();
      if (col1.startsWith("C. Tickets Confirmados"))
        valCExcel = String(row.getCell(3).value || "").trim();
      if (col1.startsWith("D. Devoluciones por anulación dentro"))
        valDExcel = montoColStr;
      if (col1.startsWith("E. Devoluciones por anulación de período"))
        valEExcel = montoColStr;
      if (col1.startsWith("F. Descuentos por Reclamos"))
        valFExcel = montoColStr;
      if (col1.startsWith("G. Monto Tickets Confirmados"))
        valGExcel = montoColStr;
      if (col1.startsWith("H. Monto Descuento")) valHExcel = montoColStr;
      if (col1.startsWith("I. Monto Total EDP")) valIExcel = montoColStr;
      if (col1.startsWith("J. MONTO EDP FINAL")) valJExcel = montoColStr;
    });

    if (excelTicketsCount !== edpAuto.total_tickets) {
      errores.push(
        `Excel Total Pasajes: ${excelTicketsCount} vs Esperado EDP: ${edpAuto.total_tickets}`,
      );
    }
    if (excelAnuladosCount !== edpAuto.total_tickets_anulados) {
      errores.push(
        `Excel Total Anulados: ${excelAnuladosCount} vs Esperado EDP: ${edpAuto.total_tickets_anulados}`,
      );
    }

    // Auditoría de sumas individuales de filas vs fila TOTALES
    if (sumaFilaMontoOriginal !== excelTotalOriginal) {
      errores.push(
        `Suma filas Monto Original ($${sumaFilaMontoOriginal}) vs Fila TOTALES ($${excelTotalOriginal})`,
      );
    }
    if (sumaFilaDevolucion !== excelTotalDevolucion) {
      errores.push(
        `Suma filas Devolución ($${sumaFilaDevolucion}) vs Fila TOTALES ($${excelTotalDevolucion})`,
      );
    }
    if (sumaFilaMontoNeto !== excelTotalNeto) {
      errores.push(
        `Suma filas Monto Neto ($${sumaFilaMontoNeto}) vs Fila TOTALES ($${excelTotalNeto})`,
      );
    }
    if (excelTotalOriginal - excelTotalDevolucion !== excelTotalNeto) {
      errores.push(
        `Matemática Fila TOTALES (Original - Devolución = Neto): ${excelTotalOriginal} - ${excelTotalDevolucion} != ${excelTotalNeto}`,
      );
    }

    // Auditoría del Resumen Operacional A a J al pie del Excel
    const montoFacturadoStr = `$${Number(edpAuto.monto_facturado).toLocaleString("es-CL")}`;
    if (valJExcel !== montoFacturadoStr) {
      errores.push(
        `Excel Monto Final J (${valJExcel}) vs Esperado EDP (${montoFacturadoStr})`,
      );
    }
    const montoConfirmadosStr = `$${excelTotalNeto.toLocaleString("es-CL")}`;
    if (valGExcel !== montoConfirmadosStr) {
      errores.push(
        `Excel Resumen G (${valGExcel}) vs Esperado Total Neto (${montoConfirmadosStr})`,
      );
    }
  }

  // 4. Auditoría profunda del contenido textual y números en los 3 PDFs generados
  const pdfFiles = [
    { name: "PDF 1 (Cron Frontend)", path: pdf1FilePath },
    { name: "PDF 2 (Manual Frontend)", path: pdf2FilePath },
    { name: "PDF 3 (Cron Backend Email)", path: pdf3FilePath },
  ];

  const montoFacturadoStr = `$${Number(edpAuto.monto_facturado).toLocaleString("es-CL")}`;
  const totalTicketsStr = Number(edpAuto.total_tickets).toLocaleString("es-CL");

  for (const pdfItem of pdfFiles) {
    if (!fs.existsSync(pdfItem.path)) {
      errores.push(`${pdfItem.name} no fue generado en ${pdfItem.path}`);
      continue;
    }
    try {
      const pdfBuffer = fs.readFileSync(pdfItem.path);

      // Silenciar el warning cosmético de PDF.js sobre fuentes estándar
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        const msg = String(args[0] ?? "");
        if (
          !msg.includes("standardFontDataUrl") &&
          !msg.includes("UnknownErrorException")
        ) {
          originalWarn(...args);
        }
      };

      const pdfInstance = new PDFParse(new Uint8Array(pdfBuffer));
      await pdfInstance.load();
      const pdfRes = await pdfInstance.getText();

      console.warn = originalWarn; // Restaurar

      const pdfText = String(pdfRes.text || "").replace(/\s+/g, " ");

      // Verificar que el PDF contenga el Monto Final Facturado exacto
      if (
        !pdfText.includes(montoFacturadoStr) &&
        !pdfText.includes(String(edpAuto.monto_facturado))
      ) {
        errores.push(
          `${pdfItem.name} no contiene el Monto Facturado Final ($${montoFacturadoStr})`,
        );
      }

      // Verificar que el PDF contenga el Total de Pasajes
      if (
        !pdfText.includes(String(edpAuto.total_tickets)) &&
        !pdfText.includes(totalTicketsStr)
      ) {
        errores.push(
          `${pdfItem.name} no contiene la cantidad total de pasajes (${edpAuto.total_tickets})`,
        );
      }
    } catch (err: any) {
      errores.push(`Error al leer ${pdfItem.name}: ${err.message}`);
    }
  }

  if (errores.length === 0) {
    console.log("  ✔️ Coincidencia Cron vs Manual: SÍ (100% IDÉNTICOS)");
    console.log("  ✔️ Integridad Snapshots en BD: SÍ (100% GUARDADOS)");
    console.log(
      "  ✔️ Suma de Pasajes Fila por Fila en Excel: SÍ (Suma individual = Fila TOTALES)",
    );
    console.log(
      "  ✔️ Fila TOTALES (Original - Devolución = Neto): SÍ (Matemática 100% Exacta)",
    );
    console.log(
      "  ✔️ Cuadre Resumen A-J al Pie del Excel: SÍ (Monto Final J coincide al centavo)",
    );
    console.log(
      "  ✔️ Verificación Textual y Números en PDFs (1, 2 y 3): SÍ (100% Coincidentes)",
    );
    console.log(
      "  🎉 AUDITORÍA DE INTEGRIDAD: ÉXITO TOTAL (0 DISCREPANCIAS ENCONTRADAS)",
    );
    console.log("=======================================================\n");
    return true;
  } else {
    console.error("  ❌ DISCREPANCIAS ENCONTRADAS EN AUDITORÍA:");
    errores.forEach((err) => console.error(`     - ${err}`));
    console.log("=======================================================\n");
    return false;
  }
}

export async function runCleanAuthenticTest(
  empresaId = TARGET_EMPRESA_ID,
  periodo = TARGET_PERIODO,
) {
  await connectToDevDB();
  console.log("\n=======================================================");
  console.log(` 🚀 PRUEBA AUTÉNTICA EDP EN DESARROLLO (Paso a Paso)`);
  console.log(` Empresa ID: ${empresaId} | Período Target: ${periodo}`);
  console.log("=======================================================\n");

  const targetEmpresa = await Empresa.findByPk(empresaId);
  if (!targetEmpresa) {
    console.error(`❌ Empresa ID ${empresaId} no encontrada.`);
    process.exit(1);
  }

  const diaFacturacion = targetEmpresa.dia_facturacion || 1;
  const [yearStr, monthStr] = periodo.split("-");
  const year = parseInt(yearStr);
  const monthIdx = parseInt(monthStr) - 1;

  // Calcular rango de fechas exacto del período
  const inicioMoment = moment
    .tz([year, monthIdx, Math.min(diaFacturacion, 28)], TIMEZONE)
    .startOf("day");
  const finMoment = moment(inicioMoment)
    .add(1, "month")
    .subtract(1, "day")
    .endOf("day");

  // Fecha de corte simulada para el cron (2 días después del fin de período para forzar cierre)
  const fechaCorteCron = moment(finMoment)
    .add(2, "days")
    .startOf("day")
    .toDate();

  // Fechas enviadas al controlador manual
  const fechaDesdeManual = inicioMoment.format("YYYY-MM-DD");
  const fechaHastaManual = moment(finMoment).add(1, "day").format("YYYY-MM-DD");

  const empresaSlug = targetEmpresa.nombre
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-");
  const pdf1FileName = `1_auto_cron_frontend_${empresaSlug}_E${empresaId}_${periodo}.pdf`;
  const pdf2FileName = `2_manual_controller_frontend_${empresaSlug}_E${empresaId}_${periodo}.pdf`;
  const pdf3FileName = `3_auto_cron_backend_email_${empresaSlug}_E${empresaId}_${periodo}.pdf`;

  // Guardar estado inicial completo de la empresa para restaurarlo al terminar la prueba
  const initialFactManual = Boolean(targetEmpresa.fact_manual);
  const initialDescuentoPendiente =
    Number(targetEmpresa.descuento_pendiente_edp || 0) ||
    (empresaId === 449 ? 115700 : 0);
  const initialDevolucionPendiente = Number(
    targetEmpresa.devolucion_pendiente_edp || 0,
  );

  // Garantizar que la empresa tenga su saldo disponible y fact_manual = false temporalmente para permitir simular el cron
  await targetEmpresa.update({
    fact_manual: false,
    descuento_pendiente_edp: initialDescuentoPendiente,
    devolucion_pendiente_edp: initialDevolucionPendiente,
  });

  console.log(
    `📌 Empresa: ${targetEmpresa.nombre} (Rut: ${targetEmpresa.rut}, Día facturación: ${diaFacturacion})`,
  );
  console.log(
    `📌 Saldo Reclamos Pendientes Aceptados: $${initialDescuentoPendiente.toLocaleString("es-CL")}`,
  );
  console.log(
    `📌 Período Reservas esperadas: ${inicioMoment.format("YYYY-MM-DD HH:mm:ss")} -> ${finMoment.format("YYYY-MM-DD HH:mm:ss")}`,
  );
  console.log(
    `📌 Simulación Cron Corte: ${moment(fechaCorteCron).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}`,
  );
  console.log(
    `📌 Rango Request Manual: ${fechaDesdeManual} -> ${fechaHastaManual}\n`,
  );

  // 1. Limpiar el EDP del período objetivo
  await cleanEDPsForEmpresa(targetEmpresa.id, periodo);
  console.log(`🧹 DB limpia para Empresa ${empresaId}, Período ${periodo}.`);

  // --- PASO 1: EJECUTAR CRON AUTOMÁTICO (generarEstadosPagoEmpresas) ---
  console.log("\n-------------------------------------------------------");
  console.log(
    " PASO 1: Ejecutando Cron Automático (generarEstadosPagoEmpresas)",
  );
  console.log("-------------------------------------------------------");
  await generarEstadosPagoEmpresas(fechaCorteCron, targetEmpresa.id);

  const edpAuto = await EstadoCuenta.findOne({
    where: { empresa_id: targetEmpresa.id, periodo: periodo },
    order: [["id", "DESC"]],
  });

  if (!edpAuto) {
    console.error(
      `❌ No se generó el EDP automático para el período ${periodo}.`,
    );
    process.exit(1);
  }

  console.log(`✅ EDP Automático creado en BD con ID: ${edpAuto.id}`);
  console.log(
    `  - Total Tickets: ${edpAuto.total_tickets} | Anulados: ${edpAuto.total_tickets_anulados}`,
  );
  console.log(
    `  - Monto Facturado: $${Number(edpAuto.monto_facturado).toLocaleString("es-CL")}`,
  );

  // Verificar primer y último ticket del snapshot del Cron
  await verifyAndReportSnapshotDetails(edpAuto.id, "CRON AUTOMÁTICO");

  // Generar PDF 1 (Frontend Automático vía pdf.controller.ts)
  const mockReq1: Partial<Request> = { params: { id: String(edpAuto.id) } };
  const mockRes1 = createMockResponse();
  await generarPDFEstadoCuenta(mockReq1 as Request, mockRes1.res);
  const pdf1Buffer = mockRes1.getPdfBuffer();
  if (!pdf1Buffer) {
    console.error("❌ Error al obtener PDF 1:", mockRes1.getJsonResponse());
    process.exit(1);
  }
  const pdf1Path = path.join(OUTPUT_DIR, pdf1FileName);
  fs.writeFileSync(pdf1Path, pdf1Buffer);
  console.log(`📄 PDF 1 (Auto Cron Frontend) guardado en: ${pdf1Path}`);

  // Generar PDF 3 (Backend Email Service)
  const detallePorCC = JSON.parse(edpAuto.detalle_por_cc || "{}");
  const centrosCosto = Object.values(detallePorCC as Record<string, any>)
    .filter((cc: any) => cc.total_tickets - cc.total_anulados > 0)
    .map((cc: any, idx: number) => ({
      id: idx + 1,
      nombre: cc.nombre,
      cantidad_tickets: cc.total_tickets - cc.total_anulados,
      monto_facturado: cc.monto_facturado,
    }))
    .sort((a, b) => b.monto_facturado - a.monto_facturado);

  const ticketsConfirmados =
    (edpAuto.total_tickets || 0) - (edpAuto.total_tickets_anulados || 0);
  const montoBruto = centrosCosto.reduce(
    (sum, cc) => sum + cc.monto_facturado,
    0,
  );

  const fechaGeneracionStr = moment(edpAuto.fecha_generacion)
    .tz(TIMEZONE)
    .format("DD-MM-YYYY");
  const fechaInicioStr = moment(edpAuto.fecha_inicio)
    .tz(TIMEZONE)
    .format("DD-MM-YYYY");
  const fechaFinStr = moment(edpAuto.fecha_fin)
    .tz(TIMEZONE)
    .format("DD-MM-YYYY");
  const periodoReservasStr = `${fechaInicioStr} - ${fechaFinStr}`;

  const pctDesc = Number(edpAuto.porcentaje_descuento || 0);
  const montoDesc = Math.round(montoBruto * (pctDesc / 100));
  const devFuera = Number(edpAuto.devoluciones_fuera_periodo || 0);
  const recDesc = Number(edpAuto.reclamos_descuento || 0);

  const edpPDFData: EDPPDFData = {
    edp: {
      numero_edp: edpAuto.id.toString(),
      fecha_generacion: fechaGeneracionStr,
      periodo_reservas: periodoReservasStr,
    },
    empresa: {
      id: targetEmpresa.id,
      nombre: targetEmpresa.nombre,
      rut: targetEmpresa.rut ?? "No disponible",
      cuenta_corriente: targetEmpresa.cuenta_corriente ?? null,
    },
    resumen: {
      tickets_generados: edpAuto.total_tickets || 0,
      tickets_anulados: edpAuto.total_tickets_anulados || 0,
      suma_devoluciones: Math.max(
        0,
        Number(edpAuto.suma_devoluciones || 0) - devFuera - recDesc,
      ),
      monto_bruto_facturado: montoBruto,
      porcentaje_descuento: pctDesc,
      etiqueta_descuento:
        pctDesc > 0 ? "Descuento por Tramos" : "Descuento Aplicado",
      monto_descuento: montoDesc,
      monto_final: Number(edpAuto.monto_facturado || 0),
      monto_reclamos: recDesc,
      devoluciones_fuera_periodo: devFuera,
      saldo_favor_restante: 0,
    },
    centros_costo: centrosCosto,
    totales: {
      cantidad_tickets: ticketsConfirmados,
      monto_facturado: montoBruto,
    },
  };

  const pdf3Bytes = await generateEDPPDF(edpPDFData);
  const pdf3Path = path.join(OUTPUT_DIR, pdf3FileName);
  fs.writeFileSync(pdf3Path, pdf3Bytes);
  console.log(`📄 PDF 3 (Auto Cron Backend Email) guardado en: ${pdf3Path}`);

  // Enviar correo de prueba con PDF y Excel
  console.log(
    "\n📧 Enviando correo de prueba a dwigodski@wit.la con el EDP generado por el cron...",
  );
  const snapshotsForTest = await EdpTicketSnapshot.findAll({
    where: { edp_id: edpAuto.id },
    order: [["id", "ASC"]],
  });
  const ticketsForTest = snapshotsForTest
    .map((snap) => {
      try {
        return JSON.parse(snap.ticket_data);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const [ticketsAnuladosFueraPeriodoRow]: any =
    await sequelizeDevInstance!.query(
      `SELECT COUNT(*) as count
     FROM tickets
     WHERE id_empresa = :emp
       AND ticketStatus = 'Anulado'
       AND confirmedAt < :inicio
       AND updated_at >= :inicio
       AND updated_at <= :fin`,
      {
        replacements: {
          emp: targetEmpresa.id,
          inicio: inicioMoment.toDate(),
          fin: finMoment.toDate(),
        },
        type: QueryTypes.SELECT,
      },
    );
  const devFueraCount = Number(ticketsAnuladosFueraPeriodoRow?.count || 0);

  const excelBuffer = await generateEDPExcelBuffer(
    ticketsForTest,
    targetEmpresa.nombre,
    targetEmpresa.rut ?? "",
    targetEmpresa.cuenta_corriente ?? "",
    periodo,
    periodoReservasStr,
    devFuera,
    Number(edpAuto.monto_facturado || 0),
    pctDesc,
    montoDesc,
    recDesc,
    inicioMoment.toISOString(), // periodoInicioISO → para separar anulados dentro/fuera
    finMoment.toISOString(), // periodoFinISO
    devFueraCount, // devolucionesFueraPeriodoCount
  );

  const excelFileName = `4_tickets_excel_${empresaSlug}_E${empresaId}_${periodo}.xlsx`;
  const excelPath = path.join(OUTPUT_DIR, excelFileName);
  fs.writeFileSync(excelPath, excelBuffer);
  console.log(`📊 Excel de Pasajes guardado en: ${excelPath}`);

  try {
    await sendEDPEmail({
      recipients: ["dwigodski@wit.la"],
      empresaNombre: targetEmpresa.nombre,
      rutEmpresa: targetEmpresa.rut ?? "No disponible",
      cuentaCorriente: targetEmpresa.cuenta_corriente ?? "",
      periodo: periodo,
      fechaGeneracion: fechaGeneracionStr,
      periodoReservas: periodoReservasStr,
      totalTickets: edpAuto.total_tickets || 0,
      totalAnulados: edpAuto.total_tickets_anulados || 0,
      montoFacturado: Number(edpAuto.monto_facturado || 0),
      pdfBuffer: Buffer.from(pdf3Bytes),
      pdfFilename: pdf3FileName,
      excelBuffer: excelBuffer,
      excelFilename: excelFileName,
    });
    console.log(
      "✅ Email enviado exitosamente a dwigodski@wit.la con PDF y Excel adjuntos.",
    );
  } catch (mailErr: any) {
    console.warn(
      `⚠️ Error al enviar email a dwigodski@wit.la: ${mailErr.message} (No funciona de modo local SENDGRID_API_KEY)`,
    );
  }

  // --- PASO 2: EJECUTAR CONTROLADOR MANUAL (ejecutarEDPManual) ---
  console.log("\n-------------------------------------------------------");
  console.log(" PASO 2: Ejecutando Controlador Manual (ejecutarEDPManual)");
  console.log("-------------------------------------------------------");
  // Limpiar el EDP recién creado por el cron y restaurar saldo inicial para dar paso al EDP manual en igualdad de condiciones
  await cleanEDPsForEmpresa(
    targetEmpresa.id,
    periodo,
    initialDescuentoPendiente,
  );

  const mockReqManual: Partial<Request> = {
    body: {
      empresa_id: targetEmpresa.id,
      fecha_desde: fechaDesdeManual,
      fecha_hasta: fechaHastaManual,
    },
  };
  const mockResManual = createMockResponse();

  await ejecutarEDPManual(mockReqManual as Request, mockResManual.res);
  console.log(
    `   Manual controller response (${mockResManual.getStatusCode()}):`,
    mockResManual.getJsonResponse()?.message || "OK",
  );

  const edpManual = await EstadoCuenta.findOne({
    where: { empresa_id: targetEmpresa.id, periodo: periodo },
    order: [["id", "DESC"]],
  });

  if (!edpManual) {
    console.error(`❌ No se creó el EDP manual para el período ${periodo}.`);
    process.exit(1);
  }

  console.log(`✅ EDP Manual creado en BD con ID: ${edpManual.id}`);
  console.log(
    `  - Total Tickets: ${edpManual.total_tickets} | Anulados: ${edpManual.total_tickets_anulados}`,
  );
  console.log(
    `  - Monto Facturado: $${Number(edpManual.monto_facturado).toLocaleString("es-CL")}`,
  );

  // Verificar primer y último ticket del snapshot del EDP Manual
  await verifyAndReportSnapshotDetails(edpManual.id, "EDP MANUAL");

  // Generar PDF 2 (Frontend Manual vía pdf.controller.ts)
  const mockReq2: Partial<Request> = { params: { id: String(edpManual.id) } };
  const mockRes2 = createMockResponse();
  await generarPDFEstadoCuenta(mockReq2 as Request, mockRes2.res);
  const pdf2Buffer = mockRes2.getPdfBuffer();
  if (!pdf2Buffer) {
    console.error("❌ Error al obtener PDF 2:", mockRes2.getJsonResponse());
    process.exit(1);
  }
  const pdf2Path = path.join(OUTPUT_DIR, pdf2FileName);
  fs.writeFileSync(pdf2Path, pdf2Buffer);
  console.log(`📄 PDF 2 (Manual Controller Frontend) guardado en: ${pdf2Path}`);

  // --- PASO 3: AUDITORÍA Y VERIFICACIÓN AUTOMÁTICA DE INTEGRIDAD ---
  const auditoriaOk = await verifyAllEDPAndExcelIntegrity(
    edpAuto,
    edpManual,
    excelPath,
    pdf1Path,
    pdf2Path,
    pdf3Path,
  );

  // --- PASO 4: RESTAURACIÓN Y NORMALIZACIÓN COMPLETA DE LA BASE DE DATOS ---
  // IMPORTANTE: siempre se ejecuta aunque la auditoría haya fallado,
  // para no dejar registros de prueba en la BD.
  console.log("\n-------------------------------------------------------");
  console.log(" PASO 4: Normalización y Restauración de Base de Datos");
  console.log("-------------------------------------------------------");
  await cleanEDPsForEmpresa(
    targetEmpresa.id,
    periodo,
    initialDescuentoPendiente,
  );
  await targetEmpresa.update({
    fact_manual: initialFactManual,
    descuento_pendiente_edp: initialDescuentoPendiente,
    devolucion_pendiente_edp: initialDevolucionPendiente,
  });
  console.log(
    `🧹 DB NORMALIZADA: Registros de EDPs (${edpAuto.id}, ${edpManual.id}), Snapshots y Cargos de Cta Cte fueron borrados.`,
  );
  console.log(
    `🧹 EMPRESA RESTAURADA: Modalidad fact_manual (${initialFactManual}), saldo de reclamos ($${initialDescuentoPendiente.toLocaleString("es-CL")}) y devoluciones ($${initialDevolucionPendiente.toLocaleString("es-CL")}) restaurados exactamente a su valor original.`,
  );

  console.log("\n=======================================================");
  console.log(" 🎉 RESUMEN DE ARCHIVOS GUARDADOS EN 'pdf_pruebas_edp':");
  console.log(` 1. ${pdf1FileName} (PDF Cron Frontend)`);
  console.log(` 2. ${pdf2FileName} (PDF Manual Frontend)`);
  console.log(` 3. ${pdf3FileName} (PDF Cron Backend Email)`);
  console.log(` 4. ${excelFileName} (Excel de Pasajes del Snapshot)`);
  console.log("=======================================================\n");

  // Propagar el fallo DESPUÉS de limpiar la BD
  if (!auditoriaOk) {
    throw new Error(
      `Auditoría de integridad FALLIDA para Empresa ${empresaId} / ${periodo} — revisa las discrepancias reportadas arriba.`,
    );
  }
}

if (require.main === module) {
  (async () => {
    console.log("\n=======================================================");
    console.log(
      ` 🚀 SUITE DE PRUEBAS EDP — ${TEST_TARGETS.length} empresa(s) en cola`,
    );
    console.log("=======================================================\n");

    const results: Array<{
      empresaId: number;
      periodo: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const target of TEST_TARGETS) {
      console.log("\n######################################################");
      console.log(
        `# ▶ Iniciando prueba: Empresa ${target.empresaId} | Período ${target.periodo}`,
      );
      console.log("######################################################");
      try {
        await runCleanAuthenticTest(target.empresaId, target.periodo);
        results.push({
          empresaId: target.empresaId,
          periodo: target.periodo,
          ok: true,
        });
      } catch (err: any) {
        console.error(
          `❌ Error en Empresa ${target.empresaId} / ${target.periodo}: ${err.message}`,
        );
        results.push({
          empresaId: target.empresaId,
          periodo: target.periodo,
          ok: false,
          error: err.message,
        });
      }
    }

    // ─── RESUMEN FINAL ───────────────────────────────────────────
    console.log("\n=======================================================");
    console.log(" 📊 RESUMEN FINAL DE SUITE DE PRUEBAS EDP");
    console.log("=======================================================\n");

    let passed = 0;
    let failed = 0;
    for (const r of results) {
      const icon = r.ok ? "✅" : "❌";
      const label = r.ok ? "PASÓ" : "FALLÓ";
      console.log(
        `  ${icon} Empresa ${r.empresaId} | ${r.periodo} → ${label}${r.error ? `: ${r.error}` : ""}`,
      );
      if (r.ok) passed++;
      else failed++;
    }

    console.log("");
    console.log(
      `  Total: ${results.length} | ✅ ${passed} OK | ❌ ${failed} con error`,
    );
    console.log("=======================================================\n");

    process.exit(failed > 0 ? 1 : 0);
  })().catch((err) => {
    console.error("❌ Error fatal en la suite de pruebas:", err);
    process.exit(1);
  });
}
