import * as dotenv from "dotenv";
dotenv.config();

// Habilitar envío de correos y forzar producción en memoria
process.env.ENABLE_EDP_EMAIL_DISPATCH = "true";

import { Sequelize } from "sequelize-typescript";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Pasajero } from "../models/pasajero.model";
import { Reclamo } from "../models/reclamo.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { UserEmpresa } from "../models/user_empresa.model";
import {
  processEDPMailQueue,
  EDPMailQueueItem,
} from "../services/edpMailBatch.service";
import moment from "moment-timezone";
import { Op } from "sequelize";

const TIMEZONE = "America/Santiago";
const TEST_EMAIL = "dwigodski@wit.la";

const main = async () => {
  console.log("\n========================================================");
  console.log(" PRUEBA DE REENVÍO DE 1 EDP DE HOY (A dwigodski@wit.la)");
  console.log("========================================================\n");

  // Conectar directamente a la base de datos de producción para la prueba
  const sequelize = new Sequelize({
    dialect: "mysql",
    host: "reserva-corporativa.c6xou04wqeof.us-east-1.rds.amazonaws.com",
    port: 3306,
    username: "admin",
    password: "BIWEHB?NtOi6GPo.WaKD-Uvy[I9F",
    database: "multiempresa_db",
    logging: false,
    models: [
      Empresa,
      EmpresaTramo,
      CentroCosto,
      User,
      CuentaCorriente,
      Ticket,
      EstadoCuenta,
      Pasajero,
      UserEmpresa,
      Reclamo,
      EdpTicketSnapshot,
    ],
  });

  await sequelize.authenticate();
  console.log("Conectado exitosamente a la base de datos de Producción.");

  // Fecha de inicio de hoy
  const hoyInicio = moment().tz(TIMEZONE).startOf("day").toDate();
  const hoyFin = moment().tz(TIMEZONE).endOf("day").toDate();

  // Buscar el EDP más reciente de tipo Masiva
  const ec = await EstadoCuenta.findOne({
    include: [
      {
        model: Empresa,
        required: true,
        where: {
          tipo_facturacion: "Masiva"
        }
      },
    ],
    order: [["id", "DESC"]]
  });

  if (!ec) {
    console.log("No se encontraron EDPs generados hoy en producción.");
    process.exit(0);
  }

  const empresa = ec.empresa;
  console.log(`Seleccionado EDP ID: ${ec.id} de la empresa: ${empresa.nombre}`);

  // Cargar snapshot de tickets
  const snapshots = await EdpTicketSnapshot.findAll({
    where: { edp_id: ec.id },
    order: [["id", "ASC"]],
  });

  if (snapshots.length === 0) {
    console.log(`⚠️ El EDP ID: ${ec.id} no tiene snapshots de tickets. Abortando.`);
    process.exit(1);
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

  // Obtener detallePorCC desde la base de datos
  let detallePorCC = {};
  try {
    detallePorCC = JSON.parse(ec.detalle_por_cc || "{}");
  } catch (err) {
    console.warn(`⚠️ Error al parsear detalle_por_cc, se usará vacío.`);
  }

  // Calcular conteo de anulados fuera de periodo en producción
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

  const queueItem: EDPMailQueueItem = {
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
      // FORZAR el correo del destinatario a dwigodski@wit.la para la prueba
      contacto_fact_email: TEST_EMAIL,
      ejecutivo_com_email: "",
      tipo_facturacion: empresa.tipo_facturacion as any,
    },
    tickets,
    detallePorCC,
  };

  console.log(`\nEnviando EDP de prueba a ${TEST_EMAIL}...`);
  await processEDPMailQueue([queueItem]);
  console.log("\nPrueba de reenvío finalizada.");
  process.exit(0);
};

main().catch((err) => {
  console.error("\nError en prueba de reenvío:", err);
  process.exit(1);
});
