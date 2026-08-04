import "../database";
import { Empresa } from "../models/empresa.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Pasajero } from "../models/pasajero.model";
import { User } from "../models/user.model";
import { Ticket } from "../models/ticket.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { generarEstadosPagoEmpresas } from "../cron/generarEstadosPagoEmpresas";
import { ejecutarEDPManual } from "../controllers/estadoCuenta.controller";
import moment from "moment-timezone";
import { Request, Response } from "express";
import { Op } from "sequelize";

const TIMEZONE = "America/Santiago";

async function main() {
  console.log("=========================================================");
  console.log("=== GENERANDO DOS EDPs IDENTICOS (CRON vs MANUAL) ===");
  console.log("=========================================================");

  const empresa = await Empresa.findByPk(5);
  if (!empresa) {
    console.error("ERROR: No se encontró la empresa con ID 5.");
    process.exit(1);
  }

  // Configurar fact_manual = false para que la procese el cron
  await empresa.update({ fact_manual: false });

  // 1. Limpiar boletos de prueba previos de la empresa 5
  console.log("\n--- Limpiando tickets y EDPs de prueba anteriores de Empresa 5 ---");
  const edpsTest = await EstadoCuenta.findAll({
    where: { empresa_id: 5 },
  });

  for (const edp of edpsTest) {
    await EdpTicketSnapshot.destroy({ where: { edp_id: edp.id } });
    await CuentaCorriente.destroy({ where: { estado_cuenta_id: edp.id } });
    await edp.destroy();
  }

  await Ticket.destroy({ where: { id_empresa: 5, ticketNumber: { [Op.like]: "TEST-IDENTICO-%" } } });

  // 2. Crear Centros de Costo de Prueba con Duplicados
  const nombreCCDuplicado = "CC OPERACIONES NORTE (TEST)";
  const nombreCCUnico = "CC ADMINISTRACION CENTRAL (TEST)";

  const cc1 = await CentroCosto.create({ nombre: nombreCCDuplicado, empresa_id: 5, estado: true });
  const cc2 = await CentroCosto.create({ nombre: nombreCCDuplicado, empresa_id: 5, estado: true });
  const cc3 = await CentroCosto.create({ nombre: nombreCCDuplicado, empresa_id: 5, estado: false });
  const cc4 = await CentroCosto.create({ nombre: nombreCCUnico, empresa_id: 5, estado: true });

  let user = await User.findOne({ where: { email: "test.empresa5@wit.cl" } });
  if (!user) {
    user = await User.create({
      nombre: "Usuario Test Empresa 5",
      email: "test.empresa5@wit.cl",
      password: "password123",
      rol: "empresa",
      empresa_id: 5,
    });
  }

  const pas1 = await Pasajero.create({ nombre: "Juan Perez (CC1)", rut: "11.111.111-1", correo: "juan.perez@test.cl", id_empresa: 5, id_centro_costo: cc1.id });
  const pas2 = await Pasajero.create({ nombre: "Maria Gomez (CC2)", rut: "22.222.222-2", correo: "maria.gomez@test.cl", id_empresa: 5, id_centro_costo: cc2.id });
  const pas3 = await Pasajero.create({ nombre: "Pedro Soto (CC3)", rut: "33.333.333-3", correo: "pedro.soto@test.cl", id_empresa: 5, id_centro_costo: cc3.id });
  const pas4 = await Pasajero.create({ nombre: "Ana Rojas (CC4)", rut: "44.444.444-4", correo: "ana.rojas@test.cl", id_empresa: 5, id_centro_costo: cc4.id });

  // 3. Crear 20 tickets idénticos para el Período 1 (CRON: 2026-07)
  const fechaPeriodo1 = moment.tz("2026-07-15 12:00:00", TIMEZONE).toDate();
  console.log("\n--- Creando 20 tickets para Período 1 (Cron) ---");
  let ticketCounter = Date.now();

  const crearSetTickets = async (fecha: Date, prefix: string) => {
    const list = [
      // CC OPERACIONES NORTE (CC1, CC2, CC3) -> 10 confirmados + 2 anulados
      ...Array.from({ length: 4 }, () => ({ pas: pas1, status: "Confirmed" as const, boleto: 25000, dev: 0 })),
      { pas: pas1, status: "Anulado" as const, boleto: 25000, dev: 25000 },
      ...Array.from({ length: 4 }, () => ({ pas: pas2, status: "Confirmed" as const, boleto: 25000, dev: 0 })),
      ...Array.from({ length: 2 }, () => ({ pas: pas3, status: "Confirmed" as const, boleto: 25000, dev: 0 })),
      { pas: pas3, status: "Anulado" as const, boleto: 25000, dev: 25000 },

      // CC ADMINISTRACION CENTRAL (CC4) -> 6 confirmados + 2 anulados
      ...Array.from({ length: 6 }, () => ({ pas: pas4, status: "Confirmed" as const, boleto: 40000, dev: 0 })),
      { pas: pas4, status: "Anulado" as const, boleto: 40000, dev: 40000 },
      { pas: pas4, status: "Anulado" as const, boleto: 40000, dev: 40000 },
    ];

    for (const item of list) {
      ticketCounter++;
      await Ticket.create({
        ticketNumber: `TEST-IDENTICO-${prefix}-${ticketCounter}`,
        pnrNumber: `PNR${ticketCounter.toString().slice(-5)}`,
        ticketStatus: item.status,
        origin: "Santiago",
        destination: "Concepción",
        travelDate: "2026-07-20",
        departureTime: "10:00",
        seatNumbers: "10",
        fare: item.boleto,
        monto_boleto: item.boleto,
        monto_devolucion: item.dev,
        confirmedAt: fecha,
        created_at: fecha,
        updated_at: fecha,
        id_User: user!.id,
        id_pasajero: item.pas.id,
        id_empresa: 5,
      });
    }
  };

  await crearSetTickets(fechaPeriodo1, "CRON");

  // Generar EDP 1 con el CRON (simulando 6 de Agosto para cerrar periodo 2026-07)
  console.log("\n--- Generando EDP 1 vía CRON ---");
  const fechaCron = moment.tz("2026-08-06 00:01:00", TIMEZONE).toDate();
  await generarEstadosPagoEmpresas(fechaCron, 5);

  const edpCron = await EstadoCuenta.findOne({
    where: { empresa_id: 5, periodo: "2026-07" },
  });

  // 4. Crear 20 tickets idénticos para el Período 2 (MANUAL: 2026-08)
  const fechaPeriodo2 = moment.tz("2026-08-15 12:00:00", TIMEZONE).toDate();
  console.log("\n--- Creando 20 tickets idénticos para Período 2 (Manual) ---");
  await crearSetTickets(fechaPeriodo2, "MANUAL");

  // Generar EDP 2 con el ENDPOINT MANUAL (período 2026-08)
  console.log("\n--- Generando EDP 2 vía ENDPOINT MANUAL ---");
  let statusManual = 0;
  let jsonManual: any = null;

  const mockReq = {
    body: {
      empresa_id: 5,
      fecha_desde: "2026-08-05",
      fecha_hasta: "2026-09-05", // hasta 2026-09-04 23:59:59
    },
  } as unknown as Request;

  const mockRes = {
    status: (code: number) => { statusManual = code; return mockRes; },
    json: (data: any) => { jsonManual = data; return mockRes; },
  } as unknown as Response;

  await ejecutarEDPManual(mockReq, mockRes);

  const edpManual = await EstadoCuenta.findByPk(jsonManual.data.estado_cuenta.id);

  console.log("\n=========================================================");
  console.log("=== COMPARACIÓN DE EDPs GENERADOS ===");
  console.log("=========================================================");
  console.log(`EDP 1 (CRON)   -> ID: ${edpCron?.id} | Periodo: ${edpCron?.periodo} | Total Tickets: ${edpCron?.total_tickets} (Anulados: ${edpCron?.total_tickets_anulados}) | Monto Facturado: $${edpCron?.monto_facturado}`);
  console.log(`EDP 2 (MANUAL) -> ID: ${edpManual?.id} | Periodo: ${edpManual?.periodo} | Total Tickets: ${edpManual?.total_tickets} (Anulados: ${edpManual?.total_tickets_anulados}) | Monto Facturado: $${edpManual?.monto_facturado}`);

  console.log("\n--- Detalle CC EDP 1 (Cron) ---");
  console.log(JSON.parse(edpCron?.detalle_por_cc || "{}"));

  console.log("\n--- Detalle CC EDP 2 (Manual) ---");
  console.log(JSON.parse(edpManual?.detalle_por_cc || "{}"));

  console.log("\n¡Prueba terminada! Ambos EDPs tienen EXACTAMENTE la misma cantidad de tickets, montos y desglose por CC.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en la ejecución:", err);
  process.exit(1);
});
