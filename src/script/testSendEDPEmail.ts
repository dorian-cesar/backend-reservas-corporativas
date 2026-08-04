/**
 * Script de prueba manual para el envío de email de EDP.
 * Uso: ts-node src/script/testSendEDPEmail.ts
 *
 * IMPORTANTE: Requiere ENABLE_EDP_EMAIL_DISPATCH=true en .env (solo para esta prueba)
 */

import * as dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { processEDPMailQueue, EDPMailQueueItem } from "../services/edpMailBatch.service";

// ─── Configuración de la prueba ───────────────────────────────────────────────
const TEST_EDP_ID = 6443;                           // ID del EDP a probar
const TEST_EMAIL = "dwigodski@wit.la";              // Email de prueba
// ─────────────────────────────────────────────────────────────────────────────

const main = async () => {
  await connectDB();

  console.log(`\n[Test] Cargando EDP ID: ${TEST_EDP_ID}...`);

  const estadoCuenta = await EstadoCuenta.findByPk(TEST_EDP_ID);
  if (!estadoCuenta) {
    console.error(`[Test] EDP ${TEST_EDP_ID} no encontrado.`);
    process.exit(1);
  }

  const empresa = await Empresa.findByPk(estadoCuenta.empresa_id);
  if (!empresa) {
    console.error(`[Test] Empresa no encontrada para EDP ${TEST_EDP_ID}.`);
    process.exit(1);
  }

  // Cargar tickets del snapshot
  const snapshots = await EdpTicketSnapshot.findAll({
    where: { edp_id: TEST_EDP_ID },
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

  console.log(
    `[Test] Empresa: ${empresa.nombre} | Tickets en snapshot: ${tickets.length}`,
  );

  // Calcular detallePorCC desde los tickets
  const detallePorCC: Record<
    string,
    { nombre: string; total_tickets: number; total_anulados: number; monto_facturado: number }
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

  // Sobrescribir emails para que vayan al email de prueba
  const queueItem: EDPMailQueueItem = {
    estadoCuentaId: estadoCuenta.id!,
    periodo: estadoCuenta.periodo || "2026-10",
    fechaInicio: estadoCuenta.fecha_inicio
      ? new Date(estadoCuenta.fecha_inicio)
      : new Date(),
    fechaFin: estadoCuenta.fecha_fin
      ? new Date(estadoCuenta.fecha_fin)
      : new Date(),
    fechaGeneracion: estadoCuenta.fecha_generacion
      ? new Date(estadoCuenta.fecha_generacion)
      : new Date(),
    totalTickets: estadoCuenta.total_tickets || 0,
    totalTicketsAnulados: estadoCuenta.total_tickets_anulados || 0,
    montoFacturado: Number(estadoCuenta.monto_facturado || 0),
    porcentajeDescuento: Number(estadoCuenta.porcentaje_descuento || 0),
    montoDescuento: Math.round(
      Number(estadoCuenta.monto_facturado || 0) *
        (Number(estadoCuenta.porcentaje_descuento || 0) / 100),
    ),
    devolucionesDentroDelPeriodo:
      Number(estadoCuenta.suma_devoluciones || 0) -
      Number(estadoCuenta.reclamos_descuento || 0) -
      Number(estadoCuenta.devoluciones_fuera_periodo || 0),
    devolucionesFueraPeriodo: Number(estadoCuenta.devoluciones_fuera_periodo || 0),
    reclamosDescuento: Number(estadoCuenta.reclamos_descuento || 0),
    empresa: {
      id: empresa.id,
      nombre: empresa.nombre,
      rut: empresa.rut,
      cuenta_corriente: empresa.cuenta_corriente,
      // Forzar envío al email de prueba
      contacto_fact_email: TEST_EMAIL,
      ejecutivo_com_email: "",
      tipo_facturacion: "Masiva", // Forzado para la prueba
    },
    tickets,
    detallePorCC,
  };

  // Activar temporalmente el envío para la prueba
  process.env.ENABLE_EDP_EMAIL_DISPATCH = "true";

  console.log(`\n[Test] Enviando email de prueba a: ${TEST_EMAIL}...`);
  await processEDPMailQueue([queueItem]);

  console.log("\n[Test] ✅ Prueba completada.");
  process.exit(0);
};

main().catch((err) => {
  console.error("[Test] ❌ Error:", err);
  process.exit(1);
});
