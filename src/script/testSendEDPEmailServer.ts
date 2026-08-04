/**
 * Script de prueba de envío de email de EDP — Para ejecutar DESDE EL SERVIDOR.
 *
 * Uso desde el servidor:
 *   npx ts-node src/script/testSendEDPEmailServer.ts
 *
 * El script:
 *  1. Busca automáticamente el primer EDP de producción que tenga snapshot de tickets.
 *  2. Construye el PDF y Excel con esos datos reales.
 *  3. Envía el email a TEST_EMAIL (forzado), ignorando los emails de la empresa.
 *  4. NO modifica ningún dato de la base de datos.
 *  5. Activa ENABLE_EDP_EMAIL_DISPATCH en memoria solo para esta ejecución.
 */

import * as dotenv from "dotenv";
dotenv.config();

// Activar el dispatch solo para esta ejecución (sin tocar .env)
process.env.ENABLE_EDP_EMAIL_DISPATCH = "true";

import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import {
  processEDPMailQueue,
  EDPMailQueueItem,
} from "../services/edpMailBatch.service";
import { Op } from "sequelize";

// ─── Configuración ────────────────────────────────────────────────────────────
const TEST_EMAIL = "dwigodski@wit.la";

// EDP específico a usar (opcional). Si es null, se busca automáticamente.
// Puedes forzar uno de los EDPs de producción conocidos: 7772, 7767, 7765, 7758, 7757
const FORCE_EDP_ID: number | null = 7758; // Empresa 9 — 1095 tickets (el más completo)

// ─────────────────────────────────────────────────────────────────────────────

const main = async () => {
  console.log("\n==========================================");
  console.log(" TEST ENVÍO EMAIL EDP — DESDE SERVIDOR");
  console.log("==========================================\n");

  await connectDB();

  let edpId: number;

  if (FORCE_EDP_ID !== null) {
    edpId = FORCE_EDP_ID;
    console.log(`[Server Test] Usando EDP forzado: ${edpId}`);
  } else {
    // Buscar el EDP más reciente que tenga snapshots de tickets
    console.log("[Server Test] Buscando EDP con snapshot de tickets...");

    const snapshotIds = await EdpTicketSnapshot.findAll({
      attributes: ["edp_id"],
      group: ["edp_id"],
      order: [["edp_id", "DESC"]],
      limit: 10,
    });

    if (snapshotIds.length === 0) {
      console.error(
        "[Server Test] No se encontraron EDPs con snapshots en la DB.",
      );
      process.exit(1);
    }

    edpId = snapshotIds[0].edp_id;
    console.log(`[Server Test] EDP seleccionado automáticamente: ${edpId}`);
  }

  // Cargar el EDP
  const estadoCuenta = await EstadoCuenta.findByPk(edpId);
  if (!estadoCuenta) {
    console.error(`[Server Test] EDP ${edpId} no encontrado en la DB.`);
    process.exit(1);
  }

  // Cargar la empresa
  const empresa = await Empresa.findByPk(estadoCuenta.empresa_id);
  if (!empresa) {
    console.error(`[Server Test] Empresa no encontrada para EDP ${edpId}.`);
    process.exit(1);
  }

  // Cargar snapshot de tickets
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

  console.log(`[Server Test] Empresa: ${empresa.nombre}`);
  console.log(`[Server Test] RUT: ${empresa.rut}`);
  console.log(`[Server Test] Período: ${estadoCuenta.periodo}`);
  console.log(`[Server Test] Tickets en snapshot: ${tickets.length}`);
  console.log(
    `[Server Test] Monto facturado: $${Number(estadoCuenta.monto_facturado).toLocaleString("es-CL")}`,
  );
  console.log(`[Server Test] Destinatario de prueba: ${TEST_EMAIL}`);
  console.log("");

  // Calcular detallePorCC desde los tickets del snapshot
  const detallePorCC: Record<
    string,
    {
      nombre: string;
      total_tickets: number;
      total_anulados: number;
      monto_facturado: number;
    }
  > = {};

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

  // Calcular descuento
  const porcentajeDescuento = Number(estadoCuenta.porcentaje_descuento || 0);
  const montoFacturado = Number(estadoCuenta.monto_facturado || 0);
  const montoDescuento = Math.round(
    montoFacturado * (porcentajeDescuento / 100),
  );

  const devolucionesDentro =
    Number(estadoCuenta.suma_devoluciones || 0) -
    Number(estadoCuenta.reclamos_descuento || 0) -
    Number(estadoCuenta.devoluciones_fuera_periodo || 0);

  // Construir el item de la cola — forzando destinatario a TEST_EMAIL
  const queueItem: EDPMailQueueItem = {
    estadoCuentaId: estadoCuenta.id!,
    periodo: estadoCuenta.periodo || "sin-periodo",
    fechaInicio: estadoCuenta.fecha_inicio
      ? new Date(estadoCuenta.fecha_inicio)
      : new Date(),
    fechaFin: estadoCuenta.fecha_fin
      ? new Date(estadoCuenta.fecha_fin)
      : new Date(),
    fechaGeneracion: estadoCuenta.fecha_generacion
      ? new Date(estadoCuenta.fecha_generacion)
      : new Date(),
    totalTickets: Number(estadoCuenta.total_tickets || 0),
    totalTicketsAnulados: Number(estadoCuenta.total_tickets_anulados || 0),
    montoFacturado,
    porcentajeDescuento,
    montoDescuento,
    devolucionesDentroDelPeriodo: devolucionesDentro,
    devolucionesFueraPeriodo: Number(
      estadoCuenta.devoluciones_fuera_periodo || 0,
    ),
    reclamosDescuento: Number(estadoCuenta.reclamos_descuento || 0),
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      rut: empresa.rut,
      cuenta_corriente: empresa.cuenta_corriente,
      // FORZAR destinatario de prueba — no se usan los emails reales de la empresa
      contacto_fact_email: TEST_EMAIL,
      ejecutivo_com_email: "",
      tipo_facturacion: "Masiva", // Forzado para que pase el filtro
    },
    tickets,
    detallePorCC,
  };

  console.log(
    "[Server Test] Iniciando generación de PDF + Excel y envío de email...",
  );

  await processEDPMailQueue([queueItem]);

  console.log("\n[Server Test] Prueba finalizada.");
  process.exit(0);
};

main().catch((err) => {
  console.error("\n[Server Test] Error inesperado:", err?.message || err);
  process.exit(1);
});
