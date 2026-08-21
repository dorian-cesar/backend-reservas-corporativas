import * as dotenv from "dotenv";
dotenv.config();

// Habilitar envío de correos
process.env.ENABLE_EDP_EMAIL_DISPATCH = "true";

import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { Ticket } from "../models/ticket.model";
import {
  processEDPMailQueue,
  EDPMailQueueItem,
} from "../services/edpMailBatch.service";
import moment from "moment-timezone";
import { Op } from "sequelize";

const TIMEZONE = "America/Santiago";

const main = async () => {
  console.log("\n==========================================");
  console.log(" REENVIAR EMAILS EDP GENERADOS HOY");
  console.log("==========================================\n");

  await connectDB();

  // Fecha de inicio de hoy
  const hoyInicio = moment().tz(TIMEZONE).startOf("day").toDate();
  const hoyFin = moment().tz(TIMEZONE).endOf("day").toDate();

  console.log(`Buscando EDPs generados entre: ${hoyInicio.toISOString()} y ${hoyFin.toISOString()}...`);

  const estadosCuenta = await EstadoCuenta.findAll({
    where: {
      fecha_generacion: {
        [Op.between]: [hoyInicio, hoyFin],
      },
    },
    include: [
      {
        model: Empresa,
        required: true,
      },
    ],
  });

  if (estadosCuenta.length === 0) {
    console.log("No se encontraron EDPs generados hoy.");
    process.exit(0);
  }

  console.log(`Se encontraron ${estadosCuenta.length} EDPs generados hoy.`);

  const queueItems: EDPMailQueueItem[] = [];

  for (const ec of estadosCuenta) {
    const empresa = ec.empresa;
    if (!empresa) continue;

    // Solo procesar empresas con facturación Masiva
    if (empresa.tipo_facturacion !== "Masiva") {
      console.log(`[ID: ${ec.id}] Omitiendo empresa ${empresa.nombre} porque es de tipo: ${empresa.tipo_facturacion}`);
      continue;
    }

    console.log(`Procesando EDP ID: ${ec.id} para la empresa: ${empresa.nombre}`);

    // Cargar snapshot de tickets
    const snapshots = await EdpTicketSnapshot.findAll({
      where: { edp_id: ec.id },
      order: [["id", "ASC"]],
    });

    if (snapshots.length === 0) {
      console.log(`⚠️ [ID: ${ec.id}] No tiene snapshots de tickets. No se enviará.`);
      continue;
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

    // Obtener detallePorCC desde la base de datos (ya precalculado en el EDP)
    let detallePorCC: Record<
      string,
      {
        nombre: string;
        total_tickets: number;
        total_anulados: number;
        monto_facturado: number;
      }
    > = {};
    try {
      detallePorCC = JSON.parse(ec.detalle_por_cc || "{}");
    } catch (err) {
      console.warn(`⚠️ [ID: ${ec.id}] Error al parsear detalle_por_cc, se usará vacío.`);
    }

    // Calcular devoluciones fuera de periodo count consultando la base de datos tal como en el cron original
    const fechaInicioDate = ec.fecha_inicio ? new Date(ec.fecha_inicio) : new Date();
    const fechaFinDate = ec.fecha_fin ? new Date(ec.fecha_fin) : new Date();
    
    const devolucionesFueraPeriodoCount = await Ticket.count({
      where: {
        id_empresa: empresa.id,
        ticketStatus: "Anulado",
        confirmedAt: {
          [Op.lt]: fechaInicioDate,
        },
        updated_at: {
          [Op.between]: [fechaInicioDate, fechaFinDate],
        },
      },
    });

    // Calcular descuentos
    const porcentajeDescuento = Number(ec.porcentaje_descuento || 0);
    const montoFacturado = Number(ec.monto_facturado || 0);
    const montoConfirmados = tickets
      .filter((t) => t.ticketStatus === "Confirmed")
      .reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);

    const montoDescuento = Math.round(
      montoConfirmados * (porcentajeDescuento / 100)
    );

    const devolucionesDentro = tickets
      .filter((t) => t.ticketStatus === "Anulado")
      .reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);

    queueItems.push({
      estadoCuentaId: ec.id!,
      periodo: ec.periodo || "sin-periodo",
      fechaInicio: fechaInicioDate,
      fechaFin: fechaFinDate,
      fechaGeneracion: ec.fecha_generacion ? new Date(ec.fecha_generacion) : new Date(),
      totalTickets: Number(ec.total_tickets || 0),
      totalTicketsAnulados: Number(ec.total_tickets_anulados || 0),
      montoFacturado,
      montoConfirmados,
      porcentajeDescuento,
      montoDescuento,
      devolucionesDentroDelPeriodo: devolucionesDentro,
      devolucionesFueraPeriodo: Number(ec.devoluciones_fuera_periodo || 0),
      devolucionesFueraPeriodoCount,
      reclamosDescuento: Number(ec.reclamos_descuento || 0),
      empresa: {
        id: empresa.id,
        nombre: empresa.nombre,
        rut: empresa.rut,
        cuenta_corriente: empresa.cuenta_corriente,
        contacto_fact_email: empresa.contacto_fact_email || "",
        ejecutivo_com_email: empresa.ejecutivo_com_email || "",
        tipo_facturacion: empresa.tipo_facturacion as any,
      },
      tickets,
      detallePorCC,
    });
  }

  if (queueItems.length === 0) {
    console.log("No hay ítems elegibles de facturación Masiva para enviar hoy.");
    process.exit(0);
  }

  console.log(`\nIniciando despacho de emails para ${queueItems.length} empresas...`);
  await processEDPMailQueue(queueItems);
  console.log("\nProceso de reenvío finalizado con éxito.");
  process.exit(0);
};

main().catch((err) => {
  console.error("\nError en script de reenvío:", err);
  process.exit(1);
});
