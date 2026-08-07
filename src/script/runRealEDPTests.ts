import { connectDB } from "../database";
import { Empresa } from "../models/empresa.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { generarEstadosPagoEmpresas } from "../cron/generarEstadosPagoEmpresas";
import { ejecutarEDPManual } from "../controllers/estadoCuenta.controller";
import { generarPDFEstadoCuenta } from "../controllers/pdf.controller";
import { generateEDPPDF, EDPPDFData } from "../services/pdf.service";
import { Request, Response } from "express";
import { Op } from "sequelize";
import fs from "fs";
import path from "path";
import moment from "moment-timezone";

import { sendEDPEmail } from "../services/mail.service";
import { generateEDPExcelBuffer } from "../services/excel.service";

// ============================================================================
// CONFIGURACIÓN GLOBAL DE PRUEBAS DE EDP
// Cambia estas dos variables para probar cualquier Empresa y cualquier Período
// ============================================================================
export const TARGET_EMPRESA_ID = 22;       // Empresa ID 22: SANTA ELVIRA S.A. (Con 585 tickets en 2026-07)
export const TARGET_PERIODO = "2026-07";   // Período '2026-07'
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
    setHeader: (name: string, value: string) => {
      return res as Response;
    }
  };

  return {
    res: res as Response,
    getPdfBuffer: () => pdfBuffer,
    getJsonResponse: () => jsonResponse,
    getStatusCode: () => statusCode
  };
}

export async function cleanEDPsForEmpresa(empresaId: number, periodoTarget: string) {
  const targetEmpresa = await Empresa.findByPk(empresaId);
  const diaFacturacion = targetEmpresa?.dia_facturacion || 1;
  const [yearStr, monthStr] = periodoTarget.split("-");
  const year = parseInt(yearStr);
  const monthIdx = parseInt(monthStr) - 1;

  const inicioMoment = moment.tz([year, monthIdx, Math.min(diaFacturacion, 28)], TIMEZONE).startOf("day");

  const edps = await EstadoCuenta.findAll({
    where: {
      empresa_id: empresaId,
      [Op.or]: [
        { periodo: periodoTarget },
        {
          fecha_inicio: {
            [Op.between]: [inicioMoment.clone().subtract(2, "days").toDate(), inicioMoment.clone().add(2, "days").toDate()]
          }
        }
      ]
    }
  });
  const ids = edps.map(e => e.id);
  if (ids.length > 0) {
    // Restablecer descuento_pendiente_edp al saldo inicial de prueba (115.700)
    if (targetEmpresa) {
      await targetEmpresa.update({
        descuento_pendiente_edp: 115700,
      });
    }

    await CuentaCorriente.destroy({
      where: {
        [Op.or]: [
          { estado_cuenta_id: ids },
          { referencia: `EDP-${periodoTarget}` }
        ]
      }
    });
    await EdpTicketSnapshot.destroy({ where: { edp_id: ids } });
    await EstadoCuenta.destroy({ where: { id: ids } });
  }
}

export async function runCleanAuthenticTest(empresaId = TARGET_EMPRESA_ID, periodo = TARGET_PERIODO) {
  await connectDB();
  console.log("\n=======================================================");
  console.log(` EJECUCIÓN AUTÉNTICA Y LIMPIA DE LOS 3 FLUJOS PROD`);
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
  const monthIdx = parseInt(monthStr) - 1; // 0-indexed month

  // Calcular rango de fechas exacto del período
  const inicioMoment = moment.tz([year, monthIdx, Math.min(diaFacturacion, 28)], TIMEZONE).startOf("day");
  const finMoment = moment(inicioMoment).add(1, "month").subtract(1, "day").endOf("day");
  
  // Fecha de corte simulada para el cron (2 días después del fin de período para forzar cierre)
  const fechaCorteCron = moment(finMoment).add(2, "days").startOf("day").toDate();

  // Fechas enviadas al controlador manual
  const fechaDesdeManual = inicioMoment.format("YYYY-MM-DD");
  const fechaHastaManual = moment(finMoment).add(1, "day").format("YYYY-MM-DD");

  // Nombres dinámicos para los archivos PDF
  const empresaSlug = targetEmpresa.nombre.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
  const pdf1FileName = `1_auto_cron_frontend_${empresaSlug}_E${empresaId}_${periodo}.pdf`;
  const pdf2FileName = `2_manual_controller_frontend_${empresaSlug}_E${empresaId}_${periodo}.pdf`;
  const pdf3FileName = `3_auto_cron_backend_email_${empresaSlug}_E${empresaId}_${periodo}.pdf`;

  console.log(`📌 Empresa: ${targetEmpresa.nombre} (Día facturación: ${diaFacturacion})`);
  console.log(`📌 Período Reservas esperadas: ${inicioMoment.format("DD-MM-YYYY")} -> ${finMoment.format("DD-MM-YYYY")}`);
  console.log(`📌 Simulación Cron Corte: ${moment(fechaCorteCron).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}`);
  console.log(`📌 Rango Request Manual: ${fechaDesdeManual} -> ${fechaHastaManual}\n`);

  // 1. Limpiar ÚNICAMENTE el período en prueba conservando la historia restante
  await cleanEDPsForEmpresa(targetEmpresa.id, periodo);
  console.log(`🧹 DB limpia para Empresa ${empresaId}, Período ${periodo} (historia restante conservada).`);

  // --- PASO 1: EJECUTAR CRON AUTOMÁTICO (generarEstadosPagoEmpresas.ts) ---
  console.log("\n--- PASO 1: Ejecutando Cron Automático (generarEstadosPagoEmpresas) ---");
  await generarEstadosPagoEmpresas(fechaCorteCron, targetEmpresa.id);

  const edpAuto = await EstadoCuenta.findOne({
    where: { empresa_id: targetEmpresa.id, periodo: periodo },
    order: [["id", "DESC"]]
  });

  if (!edpAuto) {
    console.error(`❌ No se generó el EDP automático para el período ${periodo}.`);
    process.exit(1);
  }

  console.log(`✅ EDP Automático creado con ID: ${edpAuto.id}`);

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

  // Generar PDF 3 (Email Backend procesando edpMailBatch.service.ts exactamente como en producción)
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

  const ticketsConfirmados = (edpAuto.total_tickets || 0) - (edpAuto.total_tickets_anulados || 0);
  const montoBruto = centrosCosto.reduce((sum, cc) => sum + cc.monto_facturado, 0);

  const fechaGeneracionStr = moment(edpAuto.fecha_generacion).tz(TIMEZONE).format("DD-MM-YYYY");
  const fechaInicioStr = moment(edpAuto.fecha_inicio).tz(TIMEZONE).format("DD-MM-YYYY");
  const fechaFinStr = moment(edpAuto.fecha_fin).tz(TIMEZONE).format("DD-MM-YYYY");
  const periodoReservasStr = `${fechaInicioStr} - ${fechaFinStr}`;

  const pctDesc = Number(edpAuto.porcentaje_descuento || 0);
  const montoDesc = Math.round(montoBruto * (pctDesc / 100));
  const devFuera = Number(edpAuto.devoluciones_fuera_periodo || 0);
  const recDesc = Number(edpAuto.reclamos_descuento || 0);
  const montoFinalCalc = Math.max(0, montoBruto - montoDesc - devFuera - recDesc);

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
      suma_devoluciones: Math.max(0, Number(edpAuto.suma_devoluciones || 0) - devFuera - recDesc),
      monto_bruto_facturado: montoBruto,
      porcentaje_descuento: pctDesc,
      etiqueta_descuento: pctDesc > 0 ? "Descuento por Tramos" : "Descuento Aplicado",
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
  console.log(`📄 PDF 3 (Auto Cron Email Backend) guardado en: ${pdf3Path}`);

  // Enviar correo de prueba a dwigodski@wit.la emulando el despacho masivo del cron
  console.log("\n📧 Enviando correo de prueba a dwigodski@wit.la con el EDP generado por el cron...");
  
  // Obtener tickets desde snapshots para incluir los pasajes en la planilla Excel
  const snapshotsForTest = await EdpTicketSnapshot.findAll({
    where: { edp_id: edpAuto.id },
    order: [["id", "ASC"]],
  });
  const ticketsForTest = snapshotsForTest.map((snap) => {
    try {
      return JSON.parse(snap.ticket_data);
    } catch {
      return null;
    }
  }).filter(Boolean);

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
    recDesc
  );

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
    excelFilename: `tickets_edp_${periodo}_${targetEmpresa.id}.xlsx`,
  });
  console.log("✅ Email enviado exitosamente a dwigodski@wit.la");


  // --- PASO 2: EJECUTAR CONTROLADOR MANUAL (ejecutarEDPManual) ---
  console.log("\n--- PASO 2: Ejecutando Controlador Manual (ejecutarEDPManual) ---");
  // Limpiar únicamente el EDP automático recién creado para dar paso al EDP manual sobre el mismo período exacto
  await cleanEDPsForEmpresa(targetEmpresa.id, periodo);

  const mockReqManual: Partial<Request> = {
    body: {
      empresa_id: targetEmpresa.id,
      fecha_desde: fechaDesdeManual,
      fecha_hasta: fechaHastaManual
    }
  };
  const mockResManual = createMockResponse();

  await ejecutarEDPManual(mockReqManual as Request, mockResManual.res);
  console.log(`   Manual controller response (${mockResManual.getStatusCode()}):`, mockResManual.getJsonResponse()?.message || "OK");

  const edpManual = await EstadoCuenta.findOne({
    where: { empresa_id: targetEmpresa.id, periodo: periodo },
    order: [["id", "DESC"]]
  });

  if (!edpManual) {
    console.error(`❌ No se creó el EDP manual para el período ${periodo}.`);
    process.exit(1);
  }

  console.log(`✅ EDP Manual creado con ID: ${edpManual.id}`);

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

  console.log("\n=======================================================");
  console.log(" 🎉 LOS 3 PDFS FUERON GENERADOS EN 'pdf_pruebas_edp':");
  console.log(` 1. ${pdf1FileName}`);
  console.log(` 2. ${pdf2FileName}`);
  console.log(` 3. ${pdf3FileName}`);
  console.log("=======================================================\n");
}

const TEST_CASES = [
  { empresaId: 11, periodo: "2026-07" },
  { empresaId: 22, periodo: "2026-07" },
  { empresaId: 24, periodo: "2026-07" },
  { empresaId: 13, periodo: "2026-07" },
  { empresaId: 38, periodo: "2026-01" },
];

if (require.main === module) {
  (async () => {
    await runCleanAuthenticTest(TARGET_EMPRESA_ID, TARGET_PERIODO);
    console.log("\n=======================================================");
    console.log(" 🚀 PRUEBA DE EDP Y ENVÍO DE EMAIL COMPLETADA CON ÉXITO");
    console.log("=======================================================\n");
    process.exit(0);
  })().catch(err => {
    console.error("❌ Error en ejecución de prueba:", err);
    process.exit(1);
  });
}
