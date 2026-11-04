import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { Ticket } from "../models/ticket.model";
import { Op } from "sequelize";
import { generateEDPPDF, EDPPDFData } from "./pdf.service";
import { generateEDPExcelBuffer } from "./excel.service";
import { sendEDPEmail } from "./mail.service";
import moment from "moment-timezone";

const TIMEZONE = "America/Santiago";
const CHUNK_SIZE = 25;

export interface EDPMailQueueItem {
  estadoCuentaId: number;
  periodo: string;
  fechaInicio: Date;
  fechaFin: Date;
  fechaGeneracion: Date;
  totalTickets: number;
  totalTicketsAnulados: number;
  montoFacturado: number;
  montoConfirmados?: number;
  porcentajeDescuento: number;
  montoDescuento: number;
  devolucionesDentroDelPeriodo: number;
  devolucionesFueraPeriodo: number;
  devolucionesFueraPeriodoCount?: number;
  reclamosDescuento: number;
  empresa: {
    id: number;
    nombre: string;
    rut?: string;
    cuenta_corriente?: string;
    contacto_fact_email: string;
    contacto_fact_email_cc?: string;
    ejecutivo_com_email: string;
    tipo_facturacion: "Masiva" | "Especial";
  };
  tickets: any[];
  detallePorCC: Record<
    string,
    { nombre: string; total_tickets: number; total_anulados: number; monto_facturado: number }
  >;
}

/**
 * Procesa la cola de envíos de email de EDP en lotes de CHUNK_SIZE.
 * Solo se ejecuta si ENABLE_EDP_EMAIL_DISPATCH === "true".
 * Solo envía a empresas con tipo_facturacion === "Masiva".
 */
export const processEDPMailQueue = async (
  queue: EDPMailQueueItem[],
): Promise<void> => {
  if (process.env.ENABLE_EDP_EMAIL_DISPATCH !== "true") {
    console.log(
      "[EDP Mail Queue] ENABLE_EDP_EMAIL_DISPATCH no está activo. Sin envíos.",
    );
    return;
  }

  const masivaQueue = queue.filter(
    (item) => item.empresa.tipo_facturacion === "Masiva",
  );

  if (masivaQueue.length === 0) {
    console.log("[EDP Mail Queue] Sin empresas de tipo Masiva en la cola.");
    return;
  }

  console.log(
    `[EDP Mail Queue] Procesando ${masivaQueue.length} EDPs de tipo Masiva en lotes de ${CHUNK_SIZE}...`,
  );

  let enviados = 0;
  let fallidos = 0;

  for (let i = 0; i < masivaQueue.length; i += CHUNK_SIZE) {
    const chunk = masivaQueue.slice(i, i + CHUNK_SIZE);
    console.log(
      `[EDP Mail Queue] Lote ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} items`,
    );

    const results = await Promise.allSettled(
      chunk.map(async (item) => {
        const { empresa, estadoCuentaId, tickets } = item;

        // 1. Filtrar destinatarios válidos
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const recipients = [
          empresa.contacto_fact_email,
          empresa.ejecutivo_com_email,
        ]
          .map((e) => (e ? e.trim() : ""))
          .filter((e) => e.length > 0 && emailRegex.test(e));

        // Filtrar destinatarios en copia (CC)
        const ccRecipients = (empresa.contacto_fact_email_cc || "")
          .split(/[,;]+/)
          .map((e) => e.trim())
          .filter((e) => e.length > 0 && emailRegex.test(e));

        // Copia fija obligatoria para facturación Pullman Bus en envíos automáticos
        const EDP_COPY_EMAIL = "facturacion@pullmanbus.cl";
        if (
          !recipients.includes(EDP_COPY_EMAIL) &&
          !ccRecipients.includes(EDP_COPY_EMAIL)
        ) {
          ccRecipients.push(EDP_COPY_EMAIL);
        }

        if (recipients.length === 0) {
          console.log(
            `[EDP Mail Queue] Empresa ${empresa.nombre} (ID: ${empresa.id}) sin emails configurados — omitido`,
          );
          return;
        }

        // 2. Construir EDPPDFData para generateEDPPDF
        const fechaGeneracionStr = moment(item.fechaGeneracion)
          .tz(TIMEZONE)
          .format("DD-MM-YYYY");
        const fechaInicioStr = moment(item.fechaInicio)
          .tz(TIMEZONE)
          .format("DD-MM-YYYY");
        const fechaFinStr = moment(item.fechaFin)
          .tz(TIMEZONE)
          .format("DD-MM-YYYY");
        const periodoReservas = `${fechaInicioStr} - ${fechaFinStr}`;

        // Construir centros de costo desde detallePorCC
        const centrosCosto = Object.values(item.detallePorCC)
          .filter((cc) => cc.total_tickets - cc.total_anulados > 0)
          .map((cc, idx) => ({
            id: idx + 1,
            nombre: cc.nombre,
            cantidad_tickets: cc.total_tickets - cc.total_anulados,
            monto_facturado: cc.monto_facturado,
          }))
          .sort((a, b) => b.monto_facturado - a.monto_facturado);

        const ticketsConfirmados = item.totalTickets - item.totalTicketsAnulados;
        const montoBruto = item.montoConfirmados !== undefined
          ? item.montoConfirmados
          : centrosCosto.reduce((sum, cc) => sum + cc.monto_facturado, 0);

        const montoDescuento = Math.round(
          montoBruto * ((item.porcentajeDescuento || 0) / 100),
        );
        const montoI = Math.max(0, montoBruto - montoDescuento);
        const montoFinal = Math.max(
          0,
          montoI -
            (item.devolucionesFueraPeriodo || 0) -
            (item.reclamosDescuento || 0),
        );

        const edpPDFData: EDPPDFData = {
          edp: {
            numero_edp: estadoCuentaId.toString(),
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
            tickets_generados: item.totalTickets,
            tickets_anulados: item.totalTicketsAnulados,
            suma_devoluciones: item.devolucionesDentroDelPeriodo,
            monto_bruto_facturado: montoBruto,
            porcentaje_descuento: item.porcentajeDescuento,
            etiqueta_descuento:
              item.porcentajeDescuento > 0 ? "Descuento por Tramos" : "Descuento Aplicado",
            monto_descuento: montoDescuento,
            monto_final: montoFinal,
            monto_reclamos: item.reclamosDescuento,
            devoluciones_fuera_periodo: item.devolucionesFueraPeriodo,
            saldo_favor_restante: 0,
          },
          centros_costo: centrosCosto,
          totales: {
            cantidad_tickets: ticketsConfirmados,
            monto_facturado: montoBruto,
          },
        };

        // 3. Generar PDF
        const pdfBytes = await generateEDPPDF(edpPDFData);
        const pdfBuffer = Buffer.from(pdfBytes);
        const pdfFilename = `EDP-${empresa.nombre.replace(/\s+/g, "-").substring(0, 40)}-${item.periodo}.pdf`;

        // 4. Generar Excel
        const excelBuffer = await generateEDPExcelBuffer(
          tickets,
          empresa.nombre,
          empresa.rut ?? "",
          empresa.cuenta_corriente ?? "",
          item.periodo,
          periodoReservas,
          item.devolucionesFueraPeriodo,
          montoFinal,
          item.porcentajeDescuento,
          montoDescuento,
          item.reclamosDescuento,
          item.fechaInicio ? new Date(item.fechaInicio).toISOString() : undefined,
          item.fechaFin    ? new Date(item.fechaFin).toISOString()    : undefined,
          item.devolucionesFueraPeriodoCount,
        );
        const excelFilename = `tickets_edp_${item.periodo}_${empresa.cuenta_corriente || empresa.id}.xlsx`;

        // 5. Enviar email
        await sendEDPEmail({
          recipients,
          cc: ccRecipients,
          empresaNombre: empresa.nombre,
          rutEmpresa: empresa.rut ?? "No disponible",
          cuentaCorriente: empresa.cuenta_corriente ?? "",
          periodo: item.periodo,
          fechaGeneracion: fechaGeneracionStr,
          periodoReservas,
          totalTickets: item.totalTickets,
          totalAnulados: item.totalTicketsAnulados,
          montoFacturado: montoFinal,
          pdfBuffer,
          pdfFilename,
          excelBuffer,
          excelFilename,
        });
      }),
    );

    results.forEach((result, idx) => {
      const empresaNombre = chunk[idx]?.empresa?.nombre ?? `item ${idx}`;
      if (result.status === "fulfilled") {
        enviados++;
      } else {
        fallidos++;
        console.error(
          `❌ [EDP Mail Queue] Error al enviar EDP para ${empresaNombre}:`,
          result.reason,
        );
      }
    });
  }

  console.log(
    `[EDP Mail Queue] Finalizado — ✅ ${enviados} enviados, ❌ ${fallidos} fallidos`,
  );
};


/**
 * Reenvía manualmente el email de un Estado de Pago individual.
 * Reconstruye el PDF y el Excel y actualiza la trazabilidad en la base de datos.
 */
export const resendSingleEDPEmail = async (
  estadoCuentaId: number,
): Promise<{ success: boolean; message: string; recipients?: string[]; cc?: string[] }> => {
  const ec = await EstadoCuenta.findByPk(estadoCuentaId, {
    include: [{ model: Empresa, required: true }],
  });

  if (!ec) {
    throw new Error(`Estado de cuenta #${estadoCuentaId} no encontrado`);
  }

  const empresa = ec.empresa;
  if (!empresa) {
    throw new Error(`Empresa asociada al EDP #${estadoCuentaId} no encontrada`);
  }

  // 1. Obtener snapshots de tickets
  const snapshots = await EdpTicketSnapshot.findAll({
    where: { edp_id: ec.id },
    order: [["id", "ASC"]],
  });

  let tickets: any[] = [];
  if (snapshots.length > 0) {
    tickets = snapshots
      .map((s) => {
        try {
          return JSON.parse(s.ticket_data);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } else {
    // Si no hay snapshot, buscar tickets de la BD
    const fechaInicioDate = ec.fecha_inicio ? new Date(ec.fecha_inicio) : new Date(ec.fecha_generacion);
    const fechaFinDate = ec.fecha_fin ? new Date(ec.fecha_fin) : new Date(ec.fecha_generacion);
    tickets = await Ticket.findAll({
      where: {
        id_empresa: empresa.id,
        created_at: { [Op.between]: [fechaInicioDate, fechaFinDate] },
      },
    });
  }

  // 2. Parsear detallePorCC
  let detallePorCC: Record<string, { nombre: string; total_tickets: number; total_anulados: number; monto_facturado: number }> = {};
  try {
    detallePorCC = JSON.parse(ec.detalle_por_cc || "{}");
  } catch {
    detallePorCC = {};
  }

  const fechaInicioDate = ec.fecha_inicio ? new Date(ec.fecha_inicio) : new Date(ec.fecha_generacion);
  const fechaFinDate = ec.fecha_fin ? new Date(ec.fecha_fin) : new Date(ec.fecha_generacion);

  const devolucionesFueraPeriodoCount = await Ticket.count({
    where: {
      id_empresa: empresa.id,
      ticketStatus: "Anulado",
      confirmedAt: { [Op.lt]: fechaInicioDate },
      updated_at: { [Op.between]: [fechaInicioDate, fechaFinDate] },
    },
  });

  const porcentajeDescuento = Number(ec.porcentaje_descuento || 0);
  const montoFacturado = Number(ec.monto_facturado || 0);
  const montoConfirmados = tickets
    .filter((t) => t.ticketStatus === "Confirmed")
    .reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);

  const montoDescuento = Math.round(montoConfirmados * (porcentajeDescuento / 100));
  const devolucionesDentro = tickets
    .filter((t) => t.ticketStatus === "Anulado")
    .reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);

  // 3. Filtrar destinatarios válidos
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = [
    empresa.contacto_fact_email,
    empresa.ejecutivo_com_email,
  ]
    .map((e) => (e ? e.trim() : ""))
    .filter((e) => e.length > 0 && emailRegex.test(e));

  const ccRecipients = (empresa.contacto_fact_email_cc || "")
    .split(/[,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && emailRegex.test(e));

  const EDP_COPY_EMAIL = "facturacion@pullmanbus.cl";
  if (!recipients.includes(EDP_COPY_EMAIL) && !ccRecipients.includes(EDP_COPY_EMAIL)) {
    ccRecipients.push(EDP_COPY_EMAIL);
  }

  if (recipients.length === 0) {
    await ec.update({
      email_estado: "omitido",
      email_motivo: "Sin email de facturación configurado o formato inválido",
    });
    return {
      success: false,
      message: `La empresa ${empresa.nombre} no tiene correos de facturación válidos configurados.`,
    };
  }

  const fechaGeneracionStr = moment(ec.fecha_generacion).tz(TIMEZONE).format("DD-MM-YYYY");
  const fechaInicioStr = moment(fechaInicioDate).tz(TIMEZONE).format("DD-MM-YYYY");
  const fechaFinStr = moment(fechaFinDate).tz(TIMEZONE).format("DD-MM-YYYY");
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

  const ticketsConfirmados = Number(ec.total_tickets || 0) - Number(ec.total_tickets_anulados || 0);
  const montoBruto = montoConfirmados > 0 ? montoConfirmados : centrosCosto.reduce((sum, cc) => sum + cc.monto_facturado, 0);
  const montoI = Math.max(0, montoBruto - montoDescuento);
  const montoFinal = Math.max(
    0,
    montoI - Number(ec.devoluciones_fuera_periodo || 0) - Number(ec.reclamos_descuento || 0),
  );

  const edpPDFData: EDPPDFData = {
    edp: {
      numero_edp: ec.id.toString(),
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
      tickets_generados: Number(ec.total_tickets || 0),
      tickets_anulados: Number(ec.total_tickets_anulados || 0),
      suma_devoluciones: devolucionesDentro,
      monto_bruto_facturado: montoBruto,
      porcentaje_descuento: porcentajeDescuento,
      etiqueta_descuento: porcentajeDescuento > 0 ? "Descuento por Tramos" : "Descuento Aplicado",
      monto_descuento: montoDescuento,
      monto_final: montoFinal,
      monto_reclamos: Number(ec.reclamos_descuento || 0),
      devoluciones_fuera_periodo: Number(ec.devoluciones_fuera_periodo || 0),
      saldo_favor_restante: 0,
    },
    centros_costo: centrosCosto,
    totales: {
      cantidad_tickets: ticketsConfirmados,
      monto_facturado: montoBruto,
    },
  };

  const pdfBytes = await generateEDPPDF(edpPDFData);
  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfFilename = `EDP-${empresa.nombre.replace(/\s+/g, "-").substring(0, 40)}-${ec.periodo}.pdf`;

  const excelBuffer = await generateEDPExcelBuffer(
    tickets,
    empresa.nombre,
    empresa.rut ?? "",
    empresa.cuenta_corriente ?? "",
    ec.periodo,
    periodoReservas,
    Number(ec.devoluciones_fuera_periodo || 0),
    montoFinal,
    porcentajeDescuento,
    montoDescuento,
    Number(ec.reclamos_descuento || 0),
    fechaInicioDate.toISOString(),
    fechaFinDate.toISOString(),
    devolucionesFueraPeriodoCount,
  );
  const excelFilename = `tickets_edp_${ec.periodo}_${empresa.cuenta_corriente || empresa.id}.xlsx`;

  try {
    await sendEDPEmail({
      recipients,
      cc: ccRecipients,
      empresaNombre: empresa.nombre,
      rutEmpresa: empresa.rut ?? "No disponible",
      cuentaCorriente: empresa.cuenta_corriente ?? "",
      periodo: ec.periodo,
      fechaGeneracion: fechaGeneracionStr,
      periodoReservas,
      totalTickets: Number(ec.total_tickets || 0),
      totalAnulados: Number(ec.total_tickets_anulados || 0),
      montoFacturado: montoFinal,
      pdfBuffer,
      pdfFilename,
      excelBuffer,
      excelFilename,
    });

    await ec.update({
      email_estado: "enviado",
      email_fecha_envio: new Date(),
      email_destinatarios: [...recipients, ...ccRecipients].join(", "),
      email_motivo: "Reenviado manualmente por supervisor",
    });

    return {
      success: true,
      message: `EDP #${ec.id} reenviado exitosamente a ${recipients.join(", ")} (CC: ${ccRecipients.join(", ")})`,
      recipients,
      cc: ccRecipients,
    };
  } catch (err: any) {
    await ec.update({
      email_estado: "fallido",
      email_motivo: (err?.message || "Fallo en reintento SendGrid").substring(0, 255),
    });
    throw new Error(`Error al enviar correo por SendGrid: ${err?.message || err}`);
  }
};
