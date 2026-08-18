/**
 * Script para re-enviar el correo de un EDP existente (con su PDF, HTML template y Excel oficial)
 * EXCLUSIVO PARA PRUEBA: Incluye a ccampana@acciona.com, facturacion@pullmanbus.cl y dwigodski@wit.la
 */

import moment from "moment-timezone";
import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { generateEDPPDF, EDPPDFData } from "../services/pdf.service";
import { generateEDPExcelBuffer } from "../services/excel.service";
import { sendEDPEmail } from "../services/mail.service";

const TIMEZONE = "America/Santiago";

export async function reEnviarEDP(edpIdTarget?: number) {
  const edpId = edpIdTarget || 7784; // Por defecto EDP 7784 (Acciona)

  console.log(`[${new Date().toISOString()}] === INICIO Re-Envío EDP ID ${edpId} ===`);
  await connectDB();

  // 1. Cargar el EDP
  const estadoCuenta = await EstadoCuenta.findByPk(edpId);
  if (!estadoCuenta) {
    throw new Error(`❌ EDP ID ${edpId} no fue encontrado en la base de datos.`);
  }

  // 2. Cargar la Empresa
  const empresa = await Empresa.findByPk(estadoCuenta.empresa_id);
  if (!empresa) {
    throw new Error(`❌ Empresa ID ${estadoCuenta.empresa_id} no encontrada.`);
  }

  // 3. Cargar Snapshots de tickets guardados para este EDP
  const snapshots = await EdpTicketSnapshot.findAll({
    where: { edp_id: edpId },
    order: [["id", "ASC"]],
  });

  const tickets = snapshots
    .map((s) => {
      try {
        return JSON.parse(s.ticket_data);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // 4. Reconstruir el desglose por Centro de Costo (detallePorCC)
  let detallePorCC: Record<
    string,
    { nombre: string; total_tickets: number; total_anulados: number; monto_facturado: number }
  > = {};

  try {
    if (estadoCuenta.detalle_por_cc) {
      detallePorCC = JSON.parse(estadoCuenta.detalle_por_cc);
    }
  } catch {
    detallePorCC = {};
  }

  if (Object.keys(detallePorCC).length === 0) {
    for (const t of tickets) {
      const ccNombre = t.pasajero?.centroCosto?.nombre || "Sin asignar";
      if (!detallePorCC[ccNombre]) {
        detallePorCC[ccNombre] = {
          nombre: ccNombre,
          total_tickets: 0,
          total_anulados: 0,
          monto_facturado: 0,
        };
      }
      detallePorCC[ccNombre].total_tickets++;
      if (t.ticketStatus === "Anulado") {
        detallePorCC[ccNombre].total_anulados++;
      } else {
        detallePorCC[ccNombre].monto_facturado += Number(t.monto_boleto || 0);
      }
    }
  }

  // Destinatarios exactos para la prueba:
  const recipients = [
    empresa.contacto_fact_email,
    empresa.ejecutivo_com_email,
    "dwigodski@wit.la",
  ]
    .map((e) => (e ? e.trim() : ""))
    .filter((e) => e.length > 0);

  console.log(`📋 Datos del EDP a Re-Enviar:`);
  console.log(`  - EDP ID: ${estadoCuenta.id}`);
  console.log(`  - Empresa: ${empresa.nombre} (ID: ${empresa.id})`);
  console.log(`  - RUT: ${empresa.rut || "Sin RUT"}`);
  console.log(`  - Período: ${estadoCuenta.periodo}`);
  console.log(`  - Total Tickets: ${tickets.length}`);
  console.log(`  - Monto Facturado: $${Number(estadoCuenta.monto_facturado).toLocaleString("es-CL")}`);
  console.log(`  - Destinatarios del Envío: ${recipients.join(", ")}`);

  // 5. Preparar fechas y datos para PDF y Excel oficiales
  const fechaGeneracionStr = moment(estadoCuenta.fecha_generacion)
    .tz(TIMEZONE)
    .format("DD-MM-YYYY");
  const fechaInicioStr = moment(estadoCuenta.fecha_inicio)
    .tz(TIMEZONE)
    .format("DD-MM-YYYY");
  const fechaFinStr = moment(estadoCuenta.fecha_fin)
    .tz(TIMEZONE)
    .format("DD-MM-YYYY");
  const periodoReservas = `${fechaInicioStr} - ${fechaFinStr}`;

  const centrosCosto = Object.values(detallePorCC)
    .filter((cc) => cc.total_tickets - cc.total_anulados > 0)
    .map((cc, idx) => ({
      id: idx + 1,
      nombre: cc.nombre,
      cantidad_tickets: cc.total_tickets - cc.total_anulados,
      monto_facturado: cc.monto_facturado,
    }))
    .sort((a, b) => b.monto_facturado - a.monto_facturado);

  const totalTickets = Number(estadoCuenta.total_tickets || 0);
  const totalAnulados = Number(estadoCuenta.total_tickets_anulados || 0);
  const ticketsConfirmados = totalTickets - totalAnulados;
  const montoBruto = centrosCosto.reduce((sum, cc) => sum + cc.monto_facturado, 0);
  const porcentajeDescuento = Number(estadoCuenta.porcentaje_descuento || 0);
  const montoDescuento = Math.round(montoBruto * (porcentajeDescuento / 100));
  const montoFinal = Number(estadoCuenta.monto_facturado || 0);

  const edpPDFData: EDPPDFData = {
    edp: {
      numero_edp: estadoCuenta.id.toString(),
      fecha_generacion: fechaGeneracionStr,
      periodo_reservas: periodoReservas,
    },
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      rut: empresa.rut ?? "No disponible",
      cuenta_corriente: empresa.cuenta_corriente ?? null,
    },
    resumen: {
      tickets_generados: totalTickets,
      tickets_anulados: totalAnulados,
      suma_devoluciones: Number(estadoCuenta.suma_devoluciones || 0),
      monto_bruto_facturado: montoBruto,
      porcentaje_descuento: porcentajeDescuento,
      etiqueta_descuento: porcentajeDescuento > 0 ? "Descuento por Tramos" : "Descuento Aplicado",
      monto_descuento: montoDescuento,
      monto_final: montoFinal,
      monto_reclamos: Number(estadoCuenta.reclamos_descuento || 0),
      devoluciones_fuera_periodo: Number(estadoCuenta.devoluciones_fuera_periodo || 0),
      saldo_favor_restante: 0,
    },
    centros_costo: centrosCosto,
    totales: {
      cantidad_tickets: ticketsConfirmados,
      monto_facturado: montoBruto,
    },
  };

  console.log(`📄 Generando PDF y Excel oficiales...`);
  const pdfBytes = await generateEDPPDF(edpPDFData);
  const pdfBuffer = Buffer.from(pdfBytes);

  const rawExcelBuffer = await generateEDPExcelBuffer(
    tickets,
    empresa.nombre,
    empresa.rut ?? "",
    empresa.cuenta_corriente ?? "",
    estadoCuenta.periodo,
    periodoReservas,
    Number(estadoCuenta.devoluciones_fuera_periodo || 0),
    montoFinal,
    porcentajeDescuento,
    montoDescuento,
    Number(estadoCuenta.reclamos_descuento || 0),
    estadoCuenta.fecha_inicio ? new Date(estadoCuenta.fecha_inicio).toISOString() : undefined,
    estadoCuenta.fecha_fin ? new Date(estadoCuenta.fecha_fin).toISOString() : undefined,
    0
  );
  const excelBuffer = Buffer.from(rawExcelBuffer);

  const safeEmpresaNombre = empresa.nombre.replace(/\s+/g, "-").substring(0, 40);
  const pdfFilename = `EDP-${safeEmpresaNombre}-${estadoCuenta.periodo}.pdf`;
  const excelFilename = `tickets_edp_${estadoCuenta.periodo}_${empresa.cuenta_corriente || empresa.id}.xlsx`;

  console.log(`✉️ Enviando correo vía SendGrid a ${recipients.join(", ")}...`);
  await sendEDPEmail({
    recipients,
    empresaNombre: empresa.nombre,
    rutEmpresa: empresa.rut || "",
    cuentaCorriente: empresa.cuenta_corriente || "",
    periodo: estadoCuenta.periodo,
    fechaGeneracion: fechaGeneracionStr,
    periodoReservas,
    totalTickets,
    totalAnulados,
    montoFacturado: montoFinal,
    pdfBuffer,
    pdfFilename,
    excelBuffer,
    excelFilename,
  });

  console.log(`✅ Correo procesado exitosamente.`);
  console.log(`[${new Date().toISOString()}] === FIN Re-Envío EDP ID ${edpId} ===`);
}
