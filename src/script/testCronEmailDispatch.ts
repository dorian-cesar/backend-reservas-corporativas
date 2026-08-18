/**
 * Script de prueba para simular el envío de EDP por correo en el Cron.
 *
 * Uso en servidor o cron:
 *   npx ts-node src/script/testCronEmailDispatch.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

// Asegurar que la variable esté activa para la prueba (por si no estuviera en .env)
process.env.ENABLE_EDP_EMAIL_DISPATCH = "true";

import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import {
  processEDPMailQueue,
  EDPMailQueueItem,
} from "../services/edpMailBatch.service";

const TARGET_EMAIL = "dwigodski@wit.la";

async function runTestCronMail() {
  console.log(`[${new Date().toISOString()}] === INICIO Test Cron Email Dispatch ===`);
  await connectDB();

  // 1. Obtener un EDP de prueba (el más reciente que contenga tickets en snapshot)
  const snapshotItem = await EdpTicketSnapshot.findOne({
    order: [["edp_id", "DESC"]],
  });

  let estadoCuenta: EstadoCuenta | null = null;
  let empresa: Empresa | null = null;
  let tickets: any[] = [];

  if (snapshotItem) {
    estadoCuenta = await EstadoCuenta.findByPk(snapshotItem.edp_id);
    if (estadoCuenta) {
      empresa = await Empresa.findByPk(estadoCuenta.empresa_id);
      const snapshots = await EdpTicketSnapshot.findAll({
        where: { edp_id: estadoCuenta.id },
      });
      tickets = snapshots
        .map((s) => {
          try {
            return JSON.parse(s.ticket_data);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
  }

  // 2. Si no hay EDPs o snapshots previos, construir datos ficticios de prueba
  const empresaNombre = empresa?.nombre || "EMPRESA DE PRUEBA CRON";
  const rutEmpresa = empresa?.rut || "76.123.456-7";
  const cuentaCorriente = empresa?.cuenta_corriente || "CC-12345";
  const periodo = estadoCuenta?.periodo || "2026-08";
  const estadoCuentaId = estadoCuenta?.id || 99999;
  const montoFacturado = Number(estadoCuenta?.monto_facturado || 150000);
  const totalTickets = Number(estadoCuenta?.total_tickets || 5);
  const totalAnulados = Number(estadoCuenta?.total_tickets_anulados || 0);

  // 3. Detalle por Centro de Costo
  const detallePorCC: Record<
    string,
    { nombre: string; total_tickets: number; total_anulados: number; monto_facturado: number }
  > = {
    "Centro de Costo Prueba": {
      nombre: "Centro de Costo Prueba",
      total_tickets: totalTickets,
      total_anulados: totalAnulados,
      monto_facturado: montoFacturado,
    },
  };

  // 4. Armar el item de la cola (EDPMailQueueItem) exactamente como lo hace el cron
  const queueItem: EDPMailQueueItem = {
    estadoCuentaId,
    periodo,
    fechaInicio: new Date(),
    fechaFin: new Date(),
    fechaGeneracion: new Date(),
    totalTickets,
    totalTicketsAnulados: totalAnulados,
    montoFacturado,
    porcentajeDescuento: 0,
    montoDescuento: 0,
    devolucionesDentroDelPeriodo: 0,
    devolucionesFueraPeriodo: 0,
    reclamosDescuento: 0,
    empresa: {
      id: empresa?.id || 1,
      nombre: empresaNombre,
      rut: rutEmpresa,
      cuenta_corriente: cuentaCorriente,
      contacto_fact_email: TARGET_EMAIL,
      ejecutivo_com_email: "",
      tipo_facturacion: "Masiva",
    },
    tickets,
    detallePorCC,
  };

  console.log(`[${new Date().toISOString()}] Enviando correo de prueba EDP...`);
  console.log(`  - Destinatario: ${TARGET_EMAIL}`);
  console.log(`  - Empresa: ${empresaNombre}`);
  console.log(`  - Período: ${periodo}`);
  console.log(`  - Monto: $${montoFacturado.toLocaleString("es-CL")}`);

  // 5. Clonar exactamente la llamada que hace el cron a processEDPMailQueue
  await processEDPMailQueue([queueItem]);

  console.log(`[${new Date().toISOString()}] === FIN Test Cron Email Dispatch ===`);
  process.exit(0);
}

runTestCronMail().catch((err) => {
  console.error(`[${new Date().toISOString()}] Error ejecutando test:`, err);
  process.exit(1);
});
