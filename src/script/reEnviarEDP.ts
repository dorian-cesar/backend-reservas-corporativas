/**
 * Script para re-enviar el correo de un EDP existente (con su PDF, HTML template y Excel oficial)
 *
 * Uso en servidor:
 *   npx ts-node src/script/reEnviarEDP.ts [EDP_ID]
 * Ejemplo para Acciona (EDP 7784):
 *   npx ts-node src/script/reEnviarEDP.ts 7784
 */

import * as dotenv from "dotenv";
dotenv.config();

// Asegurar dispatch activo
process.env.ENABLE_EDP_EMAIL_DISPATCH = "true";

import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import {
  processEDPMailQueue,
  EDPMailQueueItem,
} from "../services/edpMailBatch.service";

async function main() {
  const args = process.argv.slice(2);
  const edpId = args[0] ? parseInt(args[0], 10) : 7784; // Por defecto EDP 7784 (Acciona)

  console.log(`[${new Date().toISOString()}] === INICIO Re-Envío EDP ID ${edpId} ===`);
  await connectDB();

  // 1. Cargar el EDP
  const estadoCuenta = await EstadoCuenta.findByPk(edpId);
  if (!estadoCuenta) {
    console.error(`❌ EDP ID ${edpId} no fue encontrado en la base de datos.`);
    process.exit(1);
  }

  // 2. Cargar la Empresa
  const empresa = await Empresa.findByPk(estadoCuenta.empresa_id);
  if (!empresa) {
    console.error(`❌ Empresa ID ${estadoCuenta.empresa_id} no encontrada.`);
    process.exit(1);
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

  console.log(`📋 Datos del EDP a Re-Enviar:`);
  console.log(`  - EDP ID: ${estadoCuenta.id}`);
  console.log(`  - Empresa: ${empresa.nombre} (ID: ${empresa.id})`);
  console.log(`  - RUT: ${empresa.rut || "Sin RUT"}`);
  console.log(`  - Período: ${estadoCuenta.periodo}`);
  console.log(`  - Total Tickets en Snapshot: ${tickets.length}`);
  console.log(`  - Monto Facturado Final: $${Number(estadoCuenta.monto_facturado).toLocaleString("es-CL")}`);
  console.log(`  - Correos Destinatarios: ${[empresa.contacto_fact_email, empresa.ejecutivo_com_email].filter(Boolean).join(", ")}`);

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

  // 5. Construir EDPMailQueueItem con los datos reales
  const queueItem: EDPMailQueueItem = {
    estadoCuentaId: estadoCuenta.id,
    periodo: estadoCuenta.periodo,
    fechaInicio: estadoCuenta.fecha_inicio ? new Date(estadoCuenta.fecha_inicio) : new Date(),
    fechaFin: estadoCuenta.fecha_fin ? new Date(estadoCuenta.fecha_fin) : new Date(),
    fechaGeneracion: estadoCuenta.fecha_generacion ? new Date(estadoCuenta.fecha_generacion) : new Date(),
    totalTickets: Number(estadoCuenta.total_tickets || 0),
    totalTicketsAnulados: Number(estadoCuenta.total_tickets_anulados || 0),
    montoFacturado: Number(estadoCuenta.monto_facturado || 0),
    porcentajeDescuento: Number(estadoCuenta.porcentaje_descuento || 0),
    montoDescuento: 0,
    devolucionesDentroDelPeriodo: Number(estadoCuenta.suma_devoluciones || 0),
    devolucionesFueraPeriodo: Number(estadoCuenta.devoluciones_fuera_periodo || 0),
    reclamosDescuento: Number(estadoCuenta.reclamos_descuento || 0),
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      rut: empresa.rut,
      cuenta_corriente: empresa.cuenta_corriente,
      contacto_fact_email: empresa.contacto_fact_email || "",
      ejecutivo_com_email: empresa.ejecutivo_com_email || "",
      tipo_facturacion: "Masiva",
    },
    tickets,
    detallePorCC,
  };

  console.log(`\n🚀 Ejecutando processEDPMailQueue para enviar correo real...`);
  await processEDPMailQueue([queueItem]);

  console.log(`\n[${new Date().toISOString()}] === FIN Re-Envío EDP ID ${edpId} ===`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error ejecutando re-envío de EDP:", err);
  process.exit(1);
});
