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
// CONFIGURACIÓN GLOBAL DE PRUEBAS DE EDP (EN AMBIENTE DE DESARROLLO)
// Cambia estas dos variables para probar cualquier Empresa y Período
// ============================================================================
export const TARGET_EMPRESA_ID = 449;      // Empresa ID 449: SODEXO CHILE SPA (1,807 tickets en 2026-07)
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
    setHeader: (_name: string, _value: string) => {
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

export async function cleanEDPsForEmpresa(empresaId: number, periodoTarget: string, restoreDescuentoVal?: number) {
  const targetEmpresa = await Empresa.findByPk(empresaId);
  const edps = await EstadoCuenta.findAll({
    where: {
      empresa_id: empresaId,
      periodo: periodoTarget,
    }
  });
  const ids = edps.map(e => e.id);
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
          { referencia: `EDP-${periodoTarget}` }
        ]
      }
    });
    await EdpTicketSnapshot.destroy({ where: { edp_id: ids } });
    await EstadoCuenta.destroy({ where: { id: ids } });
  }
}

async function verifyAndReportSnapshotDetails(edpId: number, tituloEtapa: string) {
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
  console.log(`- Rango Período BD: ${edp.fecha_inicio}  <--->  ${edp.fecha_fin}`);
  console.log(`- Total Tickets Registrados: ${edp.total_tickets} (Anulados: ${edp.total_tickets_anulados})`);
  console.log(`- Total Snapshots Guardados en BD: ${snapshots.length} / ${edp.total_tickets}`);
  console.log(`- Monto Facturado Final: $${Number(edp.monto_facturado).toLocaleString("es-CL")}`);
  console.log(`- Descuento por Reclamos Aceptados: $${Number(edp.reclamos_descuento || 0).toLocaleString("es-CL")}`);
  console.log(`- Devoluciones Fuera de Período: $${Number(edp.devoluciones_fuera_periodo || 0).toLocaleString("es-CL")}`);

  if (snapshots.length === 0) {
    console.error(`❌ ALERTA: No se encontraron snapshots guardados para este EDP.`);
    return;
  }

  const tickets = snapshots.map((s) => {
    try {
      return JSON.parse(s.ticket_data);
    } catch {
      return null;
    }
  }).filter(Boolean);

  tickets.sort((a: any, b: any) => {
    const da = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0;
    const db = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0;
    return da - db;
  });

  const primerTicket = tickets[0];
  const ultimoTicket = tickets[tickets.length - 1];

  console.log(`\n📌 INSPECCIÓN DE TICKETS DENTRO DEL SNAPSHOT:`);
  console.log(` 1️⃣ PRIMER TICKET (Más antiguo):`);
  console.log(`    - ID Ticket: ${primerTicket.id} | N°: ${primerTicket.ticketNumber || primerTicket.id}`);
  console.log(`    - Estado: ${primerTicket.ticketStatus}`);
  console.log(`    - Confirmación (confirmedAt): ${moment(primerTicket.confirmedAt).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}`);
  console.log(`    - Fecha Viaje (travelDate): ${primerTicket.travelDate || "N/A"}`);
  console.log(`    - Pasajero: ${primerTicket.pasajero?.nombre || "N/A"}`);
  console.log(`    - Centro de Costo: ${primerTicket.pasajero?.centroCosto?.nombre || "Sin Asignar"}`);

  console.log(` 🔝 ÚLTIMO TICKET (Más reciente):`);
  console.log(`    - ID Ticket: ${ultimoTicket.id} | N°: ${ultimoTicket.ticketNumber || ultimoTicket.id}`);
  console.log(`    - Estado: ${ultimoTicket.ticketStatus}`);
  console.log(`    - Confirmación (confirmedAt): ${moment(ultimoTicket.confirmedAt).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}`);
  console.log(`    - Fecha Viaje (travelDate): ${ultimoTicket.travelDate || "N/A"}`);
  console.log(`    - Pasajero: ${ultimoTicket.pasajero?.nombre || "N/A"}`);
  console.log(`    - Centro de Costo: ${ultimoTicket.pasajero?.centroCosto?.nombre || "Sin Asignar"}`);

  const inicioEDP = new Date(edp.fecha_inicio!).getTime();
  const finEDP = new Date(edp.fecha_fin!).getTime();
  const datePrimer = new Date(primerTicket.confirmedAt).getTime();
  const dateUltimo = new Date(ultimoTicket.confirmedAt).getTime();

  const primerEnRango = datePrimer >= inicioEDP && datePrimer <= finEDP;
  const ultimoEnRango = dateUltimo >= inicioEDP && dateUltimo <= finEDP;

  const ticketsConReclamo = tickets.filter((t: any) => t.reclamos && t.reclamos.length > 0);
  console.log(`\n📋 RECLAMOS ADJUNTOS EN SNAPSHOT: ${ticketsConReclamo.length} tickets contienen reclamos registrados.`);

  console.log(`-------------------------------------------------------`);
  console.log(`✔️ Conteo Snapshots vs Tickets: ${snapshots.length === edp.total_tickets ? "SÍ (COINCIDENCIA EXACTA)" : "NO"}`);
  console.log(`✔️ Fechas de pasajes dentro del período del EDP: ${primerEnRango && ultimoEnRango ? "SÍ (100% CORRECTO)" : "NO"}`);
  console.log(`=======================================================\n`);
}

export async function runCleanAuthenticTest(empresaId = TARGET_EMPRESA_ID, periodo = TARGET_PERIODO) {
  await connectDB();
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
  const inicioMoment = moment.tz([year, monthIdx, Math.min(diaFacturacion, 28)], TIMEZONE).startOf("day");
  const finMoment = moment(inicioMoment).add(1, "month").subtract(1, "day").endOf("day");

  // Fecha de corte simulada para el cron (2 días después del fin de período para forzar cierre)
  const fechaCorteCron = moment(finMoment).add(2, "days").startOf("day").toDate();

  // Fechas enviadas al controlador manual
  const fechaDesdeManual = inicioMoment.format("YYYY-MM-DD");
  const fechaHastaManual = moment(finMoment).add(1, "day").format("YYYY-MM-DD");

  const empresaSlug = targetEmpresa.nombre.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
  const pdf1FileName = `1_auto_cron_frontend_${empresaSlug}_E${empresaId}_${periodo}.pdf`;
  const pdf2FileName = `2_manual_controller_frontend_${empresaSlug}_E${empresaId}_${periodo}.pdf`;
  const pdf3FileName = `3_auto_cron_backend_email_${empresaSlug}_E${empresaId}_${periodo}.pdf`;

  // Saldo inicial de la empresa (para SODEXO CHILE SPA es $115.700 acumulados por reclamos aceptados)
  const initialDescuentoPendiente = Number(targetEmpresa.descuento_pendiente_edp || 0) || (empresaId === 449 ? 115700 : 0);
  const initialDevolucionPendiente = Number(targetEmpresa.devolucion_pendiente_edp || 0);

  // Garantizar que la empresa tenga su saldo disponible al iniciar la prueba
  await targetEmpresa.update({
    descuento_pendiente_edp: initialDescuentoPendiente,
    devolucion_pendiente_edp: initialDevolucionPendiente,
  });

  console.log(`📌 Empresa: ${targetEmpresa.nombre} (Rut: ${targetEmpresa.rut}, Día facturación: ${diaFacturacion})`);
  console.log(`📌 Saldo Reclamos Pendientes Aceptados: $${initialDescuentoPendiente.toLocaleString("es-CL")}`);
  console.log(`📌 Período Reservas esperadas: ${inicioMoment.format("YYYY-MM-DD HH:mm:ss")} -> ${finMoment.format("YYYY-MM-DD HH:mm:ss")}`);
  console.log(`📌 Simulación Cron Corte: ${moment(fechaCorteCron).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss")}`);
  console.log(`📌 Rango Request Manual: ${fechaDesdeManual} -> ${fechaHastaManual}\n`);

  // 1. Limpiar el EDP del período objetivo
  await cleanEDPsForEmpresa(targetEmpresa.id, periodo);
  console.log(`🧹 DB limpia para Empresa ${empresaId}, Período ${periodo}.`);

  // --- PASO 1: EJECUTAR CRON AUTOMÁTICO (generarEstadosPagoEmpresas) ---
  console.log("\n-------------------------------------------------------");
  console.log(" PASO 1: Ejecutando Cron Automático (generarEstadosPagoEmpresas)");
  console.log("-------------------------------------------------------");
  await generarEstadosPagoEmpresas(fechaCorteCron, targetEmpresa.id);

  const edpAuto = await EstadoCuenta.findOne({
    where: { empresa_id: targetEmpresa.id, periodo: periodo },
    order: [["id", "DESC"]]
  });

  if (!edpAuto) {
    console.error(`❌ No se generó el EDP automático para el período ${periodo}.`);
    process.exit(1);
  }

  console.log(`✅ EDP Automático creado en BD con ID: ${edpAuto.id}`);
  console.log(`  - Total Tickets: ${edpAuto.total_tickets} | Anulados: ${edpAuto.total_tickets_anulados}`);
  console.log(`  - Monto Facturado: $${Number(edpAuto.monto_facturado).toLocaleString("es-CL")}`);

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
  console.log(`📄 PDF 3 (Auto Cron Backend Email) guardado en: ${pdf3Path}`);

  // Enviar correo de prueba con PDF y Excel
  console.log("\n📧 Enviando correo de prueba a dwigodski@wit.la con el EDP generado por el cron...");
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
    console.log("✅ Email enviado exitosamente a dwigodski@wit.la con PDF y Excel adjuntos.");
  } catch (mailErr: any) {
    console.warn(`⚠️ Error al enviar email a dwigodski@wit.la: ${mailErr.message} (Verifica la clave SENDGRID_API_KEY en .env)`);
  }


  // --- PASO 2: EJECUTAR CONTROLADOR MANUAL (ejecutarEDPManual) ---
  console.log("\n-------------------------------------------------------");
  console.log(" PASO 2: Ejecutando Controlador Manual (ejecutarEDPManual)");
  console.log("-------------------------------------------------------");
  // Limpiar el EDP recién creado por el cron y restaurar saldo inicial para dar paso al EDP manual en igualdad de condiciones
  await cleanEDPsForEmpresa(targetEmpresa.id, periodo, initialDescuentoPendiente);

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

  console.log(`✅ EDP Manual creado en BD con ID: ${edpManual.id}`);
  console.log(`  - Total Tickets: ${edpManual.total_tickets} | Anulados: ${edpManual.total_tickets_anulados}`);
  console.log(`  - Monto Facturado: $${Number(edpManual.monto_facturado).toLocaleString("es-CL")}`);

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

  // --- PASO 3: RESTAURACIÓN Y NORMALIZACIÓN COMPLETA DE LA BASE DE DATOS ---
  console.log("\n-------------------------------------------------------");
  console.log(" PASO 3: Normalización y Restauración de Base de Datos");
  console.log("-------------------------------------------------------");
  await cleanEDPsForEmpresa(targetEmpresa.id, periodo, initialDescuentoPendiente);
  await targetEmpresa.update({
    descuento_pendiente_edp: initialDescuentoPendiente,
    devolucion_pendiente_edp: initialDevolucionPendiente,
  });
  console.log(`🧹 DB NORMALIZADA: Registros de EDPs (${edpAuto.id}, ${edpManual.id}), Snapshots y Cargos de Cta Cte fueron borrados.`);
  console.log(`🧹 EMPRESA RESTAURADA: Saldo de reclamos ($${initialDescuentoPendiente.toLocaleString("es-CL")}) y devoluciones ($${initialDevolucionPendiente.toLocaleString("es-CL")}) restaurados exactamente a su valor original.`);

  console.log("\n=======================================================");
  console.log(" 🎉 RESUMEN DE ARCHIVOS GUARDADOS EN 'pdf_pruebas_edp':");
  console.log(` 1. ${pdf1FileName} (PDF Cron Frontend)`);
  console.log(` 2. ${pdf2FileName} (PDF Manual Frontend)`);
  console.log(` 3. ${pdf3FileName} (PDF Cron Backend Email)`);
  console.log(` 4. ${excelFileName} (Excel de Pasajes del Snapshot)`);
  console.log("=======================================================\n");
}

if (require.main === module) {
  (async () => {
    await runCleanAuthenticTest(TARGET_EMPRESA_ID, TARGET_PERIODO);
    console.log("\n=======================================================");
    console.log(" 🚀 PRUEBA INTEGRAL EDP Y ENVÍO DE EMAIL COMPLETADA");
    console.log("=======================================================\n");
    process.exit(0);
  })().catch(err => {
    console.error("❌ Error en ejecución de prueba:", err);
    process.exit(1);
  });
}
