import ExcelJS from "exceljs";
import { resendSingleEDPEmail } from "../services/edpMailBatch.service";
import { Request, Response } from "express";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Op } from "sequelize";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Pasajero } from "../models/pasajero.model";
import { Empresa } from "../models/empresa.model";
import { CentroCosto } from "../models/centro_costo.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { Reclamo } from "../models/reclamo.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import moment from "moment-timezone";

const TIMEZONE = "America/Santiago";

export const ejecutarEDPManual = async (req: Request, res: Response) => {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.body;

    // Validaciones
    if (!empresa_id) {
      return res.status(400).json({
        message: "El ID de la empresa es requerido",
      });
    }

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        message: "Las fechas desde y hasta son requeridas",
      });
    }

    // Verificar que la empresa existe
    const empresa = await Empresa.findByPk(empresa_id);
    if (!empresa) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    // *** SOLUCIÓN: Función para parsear fechas correctamente sin problemas de zona horaria ***
    function parseDateSafely(dateStr: string): Date {
      // Si viene en formato YYYY-MM-DD (con guiones)
      if (dateStr.includes("-")) {
        const [year, month, day] = dateStr.split("-").map(Number);
        // Crear fecha usando los componentes numéricos directamente (año, mes, día)
        // Nota: mes es 0-indexed en JavaScript, por eso restamos 1
        return new Date(year, month - 1, day);
      }
      // Si viene en formato YYYY/MM/DD (con slashes)
      else if (dateStr.includes("/")) {
        const [year, month, day] = dateStr.split("/").map(Number);
        return new Date(year, month - 1, day);
      }
      // Si viene en cualquier otro formato, intentar con el constructor por defecto
      else {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          throw new Error(`Formato de fecha no reconocido: ${dateStr}`);
        }
        return date;
      }
    }

    // Parsear fechas de manera segura
    let fechaDesde: Date, fechaHasta: Date;

    try {
      fechaDesde = parseDateSafely(fecha_desde);
      fechaHasta = parseDateSafely(fecha_hasta);
    } catch (error) {
      return res.status(400).json({
        message: "Error al parsear las fechas",
        error:
          error instanceof Error ? error.message : "Formato de fecha inválido",
      });
    }

    // Validar que las fechas sean válidas
    if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
      return res.status(400).json({
        message: "Fechas inválidas después del parseo",
      });
    }

    // Validar que fecha_desde sea menor o igual a fecha_hasta
    if (fechaDesde > fechaHasta) {
      return res.status(400).json({
        message: "La fecha desde debe ser menor o igual a la fecha hasta",
      });
    }

    // *** CORRECCIÓN: Ajustar fechas según la lógica de negocio ***

    // Para la consulta de tickets:
    // - inicioConsulta = fecha_desde a las 00:00:00 (exactamente el día que enviaron)
    // - finConsulta = fecha_hasta - 1 día a las 23:59:59 (un día antes)

    const inicioConsulta = new Date(fechaDesde);
    inicioConsulta.setHours(0, 0, 0, 0);

    // Crear fecha_hasta_ajustada = fecha_hasta - 1 día
    const finConsulta = new Date(fechaHasta);
    finConsulta.setDate(finConsulta.getDate() - 1); // Restar un día
    finConsulta.setHours(23, 59, 59, 999);

    // Para guardar en estado_cuenta (usar las mismas fechas ajustadas)
    const inicioPeriodoStr = formatDateForDB(inicioConsulta);
    const finPeriodoStr = formatDateForDB(finConsulta);

    console.log(`=== INICIO FACTURACIÓN MANUAL ===`);
    console.log(`Empresa: ${empresa.nombre} (ID: ${empresa_id})`);
    console.log(`Fechas recibidas: ${fecha_desde} → ${fecha_hasta}`);
    console.log(
      `Fechas parseadas: ${fechaDesde.toISOString()} → ${fechaHasta.toISOString()}`,
    );
    console.log(`Período facturado: ${inicioPeriodoStr} → ${finPeriodoStr}`);

    // Verificar si ya existe un estado de cuenta para este período
    const existe = await EstadoCuenta.findOne({
      where: {
        empresa_id: empresa_id,
        fecha_inicio: inicioPeriodoStr,
        fecha_fin: finPeriodoStr,
      },
    });

    if (existe) {
      return res.status(400).json({
        message: "Ya existe un estado de cuenta para este período",
        estado_cuenta_existente: existe,
      });
    }

    // Obtener tickets del período (usando las fechas ajustadas)
    // Se incluyen todas las relaciones necesarias para generar un snapshot completo
    const tickets = await Ticket.findAll({
      where: {
        id_empresa: empresa_id,
        ticketStatus: { [Op.in]: ["Confirmed", "Anulado"] },
        confirmedAt: {
          [Op.between]: [inicioConsulta, finConsulta],
        },
      },
      include: [
        {
          model: User,
          attributes: ["id", "nombre", "rut", "email"],
          required: false,
        },
        {
          model: Pasajero,
          required: false,
          attributes: [
            "id",
            "nombre",
            "rut",
            "correo",
            "telefono",
            "id_centro_costo",
          ],
          include: [{ model: CentroCosto, required: false }],
        },
        {
          model: Empresa,
          attributes: ["id", "nombre", "rut", "cuenta_corriente"],
          required: false,
        },
        {
          model: Reclamo,
          required: false,
        },
      ],
    });

    // Calcular totales
    const total_confirmados = tickets.filter(
      (t) => t.ticketStatus === "Confirmed",
    ).length;
    const total_anulados = tickets.filter(
      (t) => t.ticketStatus === "Anulado",
    ).length;

    // Base de cálculo: solo tickets CONFIRMADOS
    const monto_confirmados = tickets
      .filter((t) => t.ticketStatus === "Confirmed")
      .reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
    // Devoluciones: solo los montos devueltos de tickets anulados dentro del periodo
    const devoluciones = tickets
      .filter((t) => t.ticketStatus === "Anulado")
      .reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
    // Base neta: G = confirmados
    const monto_neto_base = monto_confirmados;

    const monto_neto_consumo_real = monto_neto_base;
    let monto_neto_consumo = 0;
    let porcentajeDescuento = 0;
    let descuentoTramos = 0;
    let monto_facturado = 0;

    if (monto_neto_consumo_real >= 0) {
      monto_neto_consumo = monto_neto_consumo_real;
      // Descuento por tramos sobre monto_neto_base (G = confirmados - devoluciones_dentro)
      const tramos = await EmpresaTramo.findAll({
        where: { id_empresa: empresa_id },
        order: [["monto_desde", "ASC"]],
      });
      for (const tramo of tramos) {
        const desde = Number(tramo.monto_desde);
        const hasta =
          tramo.monto_hasta !== null && tramo.monto_hasta !== undefined
            ? Number(tramo.monto_hasta)
            : null;
        if (
          monto_neto_consumo >= desde &&
          (hasta === null || monto_neto_consumo <= hasta)
        ) {
          porcentajeDescuento = Number(tramo.porcentaje_descuento);
        }
      }
      // H = G * porcentaje / 100
      descuentoTramos = Math.round(monto_neto_consumo * (porcentajeDescuento / 100));
      // I = G - H (antes de E y F)
      monto_facturado = monto_neto_consumo - descuentoTramos;
      if (monto_facturado < 0) monto_facturado = 0;
    }

    // Buscar tickets del periodo anterior anulados fuera de periodo
    const ticketsAnuladosFueraPeriodo = await Ticket.findAll({
      where: {
        id_empresa: empresa_id,
        ticketStatus: "Anulado",
        confirmedAt: {
          [Op.lt]: inicioConsulta,
        },
        updated_at: {
          [Op.between]: [inicioConsulta, finConsulta],
        },
      },
    });
    const devoluciones_fuera_periodo = ticketsAnuladosFueraPeriodo.reduce(
      (sum, t) => sum + (Number(t.monto_devolucion) || 0),
      0,
    );

    // Generar detalle por centro de costo agrupado por nombre
    const detallePorCC: Record<
      string,
      {
        nombre: string;
        total_tickets: number;
        total_anulados: number;
        monto_facturado: number;
      }
    > = {};

    detallePorCC["Sin asignar"] = {
      nombre: "Sin asignar",
      total_tickets: 0,
      total_anulados: 0,
      monto_facturado: 0,
    };

    for (const ticket of tickets) {
      const pasajero = ticket.pasajero;
      const centroCostoNombre =
        pasajero?.centroCosto?.nombre ||
        (pasajero as any)?.centro_costo?.nombre ||
        (pasajero as any)?.CentroCosto?.nombre ||
        "Sin asignar";

      if (!detallePorCC[centroCostoNombre]) {
        detallePorCC[centroCostoNombre] = {
          nombre: centroCostoNombre,
          total_tickets: 0,
          total_anulados: 0,
          monto_facturado: 0,
        };
      }

      detallePorCC[centroCostoNombre].total_tickets += 1;
      if (ticket.ticketStatus === "Anulado") {
        detallePorCC[centroCostoNombre].total_anulados += 1;
      } else {
        detallePorCC[centroCostoNombre].monto_facturado +=
          Number(ticket.monto_boleto) || 0;
      }
    }

    // === DESCUENTO POR DEVOLUCIONES FUERA DE PERIODO Y RECLAMOS ===
    const devolucionFueraPendiente = Number(empresa.devolucion_pendiente_edp) || 0;
    const totalDevolucionesFueraDisponibles = devoluciones_fuera_periodo + devolucionFueraPendiente;
    const reclamosDisponibles = Number(empresa.descuento_pendiente_edp) || 0;

    let balance = monto_facturado;

    // 1. Aplicar devoluciones fuera de periodo (tickets del mes + saldo acumulado fuera de periodo)
    let devoluciones_fuera_periodo_aplicadas = 0;
    let devoluciones_fuera_periodo_restante = 0;
    if (balance >= totalDevolucionesFueraDisponibles) {
      devoluciones_fuera_periodo_aplicadas = totalDevolucionesFueraDisponibles;
      balance -= devoluciones_fuera_periodo_aplicadas;
      devoluciones_fuera_periodo_restante = 0;
    } else {
      devoluciones_fuera_periodo_aplicadas = balance;
      devoluciones_fuera_periodo_restante = totalDevolucionesFueraDisponibles - devoluciones_fuera_periodo_aplicadas;
      balance = 0;
    }

    // 2. Aplicar reclamos aceptados
    let reclamos_aplicados = 0;
    let reclamos_restante = 0;
    if (balance >= reclamosDisponibles) {
      reclamos_aplicados = reclamosDisponibles;
      balance -= reclamos_aplicados;
      reclamos_restante = 0;
    } else {
      reclamos_aplicados = balance;
      reclamos_restante = reclamosDisponibles - reclamos_aplicados;
      balance = 0;
    }

    const monto_facturado_con_reclamos = balance;
    const suma_devoluciones_final = devoluciones + reclamos_aplicados + devoluciones_fuera_periodo_aplicadas;

    // Crear estado de cuenta
    const estadoCuenta = await EstadoCuenta.create({
      empresa_id: empresa_id,
      periodo: `${fechaDesde.getFullYear()}-${String(fechaDesde.getMonth() + 1).padStart(2, "0")}`,
      fecha_inicio: inicioPeriodoStr,
      fecha_fin: finPeriodoStr,
      fecha_generacion: moment().tz(TIMEZONE).toDate(),
      fecha_facturacion: moment().tz(TIMEZONE).toDate(),
      total_tickets: tickets.length,
      total_tickets_anulados: total_anulados,
      monto_facturado: monto_facturado_con_reclamos,
      suma_devoluciones: suma_devoluciones_final,
      reclamos_descuento: reclamos_aplicados,
      devoluciones_fuera_periodo: devoluciones_fuera_periodo_aplicadas,
      porcentaje_descuento: porcentajeDescuento,
      detalle_por_cc: JSON.stringify(detallePorCC),
      pagado: false,
    });

    // Guardar snapshot de cada ticket en la tabla edp_ticket_snapshots con reintentos y verificación
    // Se incluyen los tickets del período actual y al final los anulados de período anterior
    const todosTicketsParaSnapshot = [
      ...tickets,
      ...ticketsAnuladosFueraPeriodo.map((t) => {
        const j = t.toJSON ? t.toJSON() : JSON.parse(JSON.stringify(t));
        j.es_anulado_periodo_anterior = true;
        return j;
      }),
    ];

    if (todosTicketsParaSnapshot.length > 0) {
      const snapshotRows = todosTicketsParaSnapshot.map((t) => {
        const json = t.toJSON ? t.toJSON() : JSON.parse(JSON.stringify(t));
        if (json.pasajero) {
          const cc =
            json.pasajero.centroCosto ||
            json.pasajero.centro_costo ||
            json.pasajero.CentroCosto;
          if (cc) {
            json.pasajero.centroCosto = cc;
            json.pasajero.centro_costo = cc;
            json.pasajero.CentroCosto = cc;
          }
        }
        return {
          edp_id: estadoCuenta.id,
          ticket_data: JSON.stringify(json),
        };
      });

      // Guardar en lotes de 500 con hasta 3 reintentos por lote
      const BATCH_SIZE = 500;
      const MAX_RETRIES = 3;
      let todoCorrectoEnLotes = true;

      for (let i = 0; i < snapshotRows.length; i += BATCH_SIZE) {
        const chunk = snapshotRows.slice(i, i + BATCH_SIZE);
        let intento = 0;
        let exitoLote = false;

        while (intento < MAX_RETRIES && !exitoLote) {
          try {
            intento++;
            await EdpTicketSnapshot.bulkCreate(chunk);
            exitoLote = true;
          } catch (errBulk: any) {
            console.warn(
              `⚠️ [EDP Snapshot Manual] Intento ${intento}/${MAX_RETRIES} falló guardando lote de edp_id ${estadoCuenta.id}: ${errBulk.message}`
            );
            if (intento < MAX_RETRIES) {
              await new Promise((res) => setTimeout(res, 1000 * intento));
            }
          }
        }

        if (!exitoLote) {
          todoCorrectoEnLotes = false;
          break;
        }
      }

      // Verificación estricta posterior en la base de datos (COUNT)
      try {
        const countBD = await EdpTicketSnapshot.count({
          where: { edp_id: estadoCuenta.id },
        });

        if (countBD === snapshotRows.length && todoCorrectoEnLotes) {
          console.log(
            `✅ [EDP Snapshot Manual] Confirmado: ${countBD}/${snapshotRows.length} snapshots guardados perfectamente en BD para EDP ID ${estadoCuenta.id}.`
          );
        } else {
          console.error(
            `❌ [EDP Snapshot Manual] ERROR DE INTEGRIDAD: Se esperaban ${snapshotRows.length} snapshots para EDP ID ${estadoCuenta.id}, pero hay ${countBD} en BD.`
          );
        }
      } catch (errCount: any) {
        console.error(
          `❌ [EDP Snapshot Manual] Error verificando COUNT de snapshots para EDP ID ${estadoCuenta.id}: ${errCount.message}`
        );
      }
    }

    const ticketsActivosNuevos = await Ticket.findAll({
      where: {
        id_empresa: empresa_id,
        ticketStatus: "Confirmed",
        confirmedAt: { [Op.gt]: fechaHasta },
      },
    });
    const nuevoMontoAcumuladoActivo = ticketsActivosNuevos.reduce(
      (sum, t) => sum + (Number(t.monto_boleto) || 0),
      0
    );

    await empresa.update({
      devolucion_pendiente_edp: devoluciones_fuera_periodo_restante,
      descuento_pendiente_edp: reclamos_restante,
      monto_acumulado: nuevoMontoAcumuladoActivo,
    });


    // Crear cargo en cuenta corriente
    if (estadoCuenta && estadoCuenta.id) {
      const ultimoMovimiento = await CuentaCorriente.findOne({
        where: { empresa_id: empresa_id },
        order: [
          ["fecha_movimiento", "DESC"],
          ["id", "DESC"],
        ],
      });

      let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;
      const nuevoSaldo = saldoActual - monto_facturado_con_reclamos;

      const cargo = await CuentaCorriente.create({
        empresa_id: empresa_id,
        tipo_movimiento: "cargo",
        monto: monto_facturado_con_reclamos,
        descripcion: porcentajeDescuento > 0 && reclamos_aplicados > 0
          ? `Cargo por estado de cuenta #${estadoCuenta.id} - Período ${inicioPeriodoStr} al ${finPeriodoStr} (Descuento del ${porcentajeDescuento}% y descuento por reclamos de $${reclamos_aplicados} aplicados)`
          : porcentajeDescuento > 0
          ? `Cargo por estado de cuenta #${estadoCuenta.id} - Período ${inicioPeriodoStr} al ${finPeriodoStr} (Descuento del ${porcentajeDescuento}% aplicado)`
          : reclamos_aplicados > 0
          ? `Cargo por estado de cuenta #${estadoCuenta.id} - Período ${inicioPeriodoStr} al ${finPeriodoStr} (Descuento por reclamos de $${reclamos_aplicados} aplicado)`
          : `Cargo por estado de cuenta #${estadoCuenta.id} - Período ${inicioPeriodoStr} al ${finPeriodoStr}`,
        saldo: nuevoSaldo,
        referencia: `CARGO-EDC-${estadoCuenta.id}`,
        pagado: false,
        fecha_movimiento: new Date(),
        estado_cuenta_id: estadoCuenta.id,
      });

      return res.status(201).json({
        message: "Facturación EDP manual ejecutada correctamente",
        data: {
          estado_cuenta: estadoCuenta,
          cargo_cuenta_corriente: cargo,
          resumen: {
            total_tickets: tickets.length,
            tickets_confirmados: total_confirmados,
            tickets_anulados: total_anulados,
            monto_bruto: monto_confirmados,
            devoluciones,
            monto_facturado: monto_facturado_con_reclamos,
            detalle_por_cc: detallePorCC,
            fechas_utilizadas: {
              fecha_desde_enviada: fecha_desde,
              fecha_hasta_enviada: fecha_hasta,
              fecha_desde_parseada: formatDateForDB(fechaDesde),
              fecha_hasta_parseada: formatDateForDB(fechaHasta),
              fecha_inicio_real: inicioPeriodoStr,
              fecha_fin_real: finPeriodoStr,
            },
          },
        },
      });
    } else {
      throw new Error("Error al crear el estado de cuenta");
    }
  } catch (error) {
    console.error("Error en facturación manual:", error);
    if (error && (error as any).name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        message:
          "Ya existe un estado de cuenta registrado para esta empresa y periodo.",
      });
    }
    return res.status(500).json({
      message: "Error al ejecutar facturación manual",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export const listarEstadosCuenta = async (req: Request, res: Response) => {
  try {
    const { empresaId, empresa_id, periodo, pagado, desde, hasta } = req.query;

    // Soporta ambos nombres: empresaId (del frontend) y empresa_id (directo)
    const empresaIdFinal = empresaId || empresa_id;

    const where: any = {};

    if (empresaIdFinal) where.empresa_id = empresaIdFinal;
    if (periodo) where.periodo = periodo;
    if (pagado !== undefined) where.pagado = pagado === "true";

    if (desde || hasta) {
      const fechaFiltro: any = {};

      if (desde) {
        fechaFiltro[Op.gte] = new Date(desde as string);
      }

      if (hasta) {
        const hastaDate = new Date(hasta as string);
        hastaDate.setDate(hastaDate.getDate() + 1);
        fechaFiltro[Op.lt] = hastaDate;
      }

      where.fecha_generacion = fechaFiltro;
    }

    const estados = await EstadoCuenta.findAll({
      where,
      include: [
        {
          model: Empresa,
          attributes: ["id", "nombre", "rut", "cuenta_corriente", "estado"],
        },
      ],
      order: [["fecha_generacion", "DESC"]],
    });

    return res.json(estados);
  } catch (error) {
    console.error("Error al listar estados de cuenta:", error);
    return res.status(500).json({
      message: "Error al obtener estados de cuenta",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Helper para parsear de manera segura strings "YYYY-MM-DD HH:mm:ss" a Date local components
export function parseDateString(dateStr: string): Date {
  const [datePart, timePart] = dateStr.trim().split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes, seconds] = timePart
    ? timePart.split(":").map(Number)
    : [0, 0, 0];
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

export const listarTicketsDeEstadoCuenta = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;

    const page = req.query.page ? parseInt(req.query.page as string, 10) : null;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : null;
    const offset = page && limit ? (page - 1) * limit : undefined;

    const estado = await EstadoCuenta.findByPk(id);
    if (!estado)
      return res
        .status(404)
        .json({ message: "Estado de cuenta no encontrado" });

    const estadoData = estado.toJSON();

    // ─────────────────────────────────────────────────────────────────────────
    // Cargar boletos de período anterior anulados dentro de este período
    // Aparecen al FINAL de la lista conforme al ítem E del PDF
    // ─────────────────────────────────────────────────────────────────────────
    let ticketsFueraPeriodo: any[] = [];
    if (
      Number(estadoData.devoluciones_fuera_periodo || 0) > 0 &&
      estadoData.fecha_inicio &&
      estadoData.fecha_fin &&
      estadoData.empresa_id
    ) {
      try {
        let inicioConsulta = parseDateString(estadoData.fecha_inicio);
        let finConsulta = parseDateString(estadoData.fecha_fin);
        finConsulta.setHours(23, 59, 59, 999);
        const offsetMinutes = new Date().getTimezoneOffset();
        inicioConsulta = new Date(inicioConsulta.getTime() - offsetMinutes * 60 * 1000);
        finConsulta = new Date(finConsulta.getTime() - offsetMinutes * 60 * 1000);

        const rawFuera = await Ticket.findAll({
          where: {
            id_empresa: estadoData.empresa_id,
            ticketStatus: "Anulado",
            confirmedAt: { [Op.lt]: inicioConsulta },
            updated_at: { [Op.between]: [inicioConsulta, finConsulta] },
          },
          include: [
            {
              model: User,
              attributes: ["id", "nombre", "rut", "email"],
              required: false,
            },
            {
              model: Empresa,
              attributes: ["id", "nombre", "rut", "cuenta_corriente"],
              required: false,
            },
            {
              model: Reclamo,
              required: false,
            },
            {
              model: Pasajero,
              required: false,
              attributes: [
                "id",
                "nombre",
                "rut",
                "correo",
                "telefono",
                "id_centro_costo",
              ],
              include: [{ model: CentroCosto, required: false }],
            },
          ],
          order: [["updated_at", "ASC"]],
        });

        ticketsFueraPeriodo = rawFuera.map((t) => {
          const json = t.toJSON ? t.toJSON() : JSON.parse(JSON.stringify(t));
          json.es_anulado_periodo_anterior = true;
          return json;
        });
      } catch (errFuera) {
        console.warn("⚠️ No se pudieron cargar boletos anulados de período anterior:", errFuera);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASO 1: El EDP tiene snapshots congelados en la tabla edp_ticket_snapshots
    // ─────────────────────────────────────────────────────────────────────────
    const snapshotsCount = await EdpTicketSnapshot.count({
      where: { edp_id: id },
    });

    if (snapshotsCount > 0) {
      // Verificar si los snapshots ya contienen boletos de período anterior
      const alreadyHasFuera = await EdpTicketSnapshot.findOne({
        where: {
          edp_id: id,
          ticket_data: { [Op.like]: '%"es_anulado_periodo_anterior":true%' },
        },
      });

      // Si los snapshots aún no los tienen guardados, los anexamos al final
      const fueraParaAnexar = alreadyHasFuera ? [] : ticketsFueraPeriodo;
      const totalGeneral = snapshotsCount + fueraParaAnexar.length;

      if (page && limit) {
        const pageOffset = (page - 1) * limit;

        if (pageOffset >= totalGeneral) {
          return res.json({
            data: [],
            pagination: {
              total: totalGeneral,
              page,
              limit,
              totalPages: Math.ceil(totalGeneral / limit) || 1,
            },
          });
        }

        let resultItems: any[] = [];

        // 1. Elementos que provienen de los snapshots
        if (pageOffset < snapshotsCount) {
          const snapshotLimit = Math.min(limit, snapshotsCount - pageOffset);
          const rows = await EdpTicketSnapshot.findAll({
            where: { edp_id: id },
            order: [["id", "ASC"]],
            limit: snapshotLimit,
            offset: pageOffset,
          });

          const snapshotItems = rows
            .map((r) => {
              try {
                return JSON.parse(r.ticket_data);
              } catch {
                return null;
              }
            })
            .filter(Boolean);

          resultItems.push(...snapshotItems);
        }

        // 2. Si todavía queda espacio en la página actual y la ventana llega al final (anexados)
        const itemsFaltantes = limit - resultItems.length;
        if (itemsFaltantes > 0 && fueraParaAnexar.length > 0) {
          const fueraOffset = Math.max(0, pageOffset - snapshotsCount);
          const sliceFuera = fueraParaAnexar.slice(
            fueraOffset,
            fueraOffset + itemsFaltantes
          );
          resultItems.push(...sliceFuera);
        }

        return res.json({
          data: resultItems,
          pagination: {
            total: totalGeneral,
            page,
            limit,
            totalPages: Math.ceil(totalGeneral / limit) || 1,
          },
        });
      }

      // Sin paginación (exportación completa CSV / XLSX)
      const rows = await EdpTicketSnapshot.findAll({
        where: { edp_id: id },
        order: [["id", "ASC"]],
      });
      const allSnapshotItems = rows
        .map((r) => {
          try {
            return JSON.parse(r.ticket_data);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      return res.json([...allSnapshotItems, ...fueraParaAnexar]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CASO 2: EDP sin snapshot (histórico) → comportamiento dinámico original
    // ─────────────────────────────────────────────────────────────────────────
    if (!estadoData.fecha_inicio || !estadoData.fecha_fin) {
      return res.status(400).json({
        message: "El estado de cuenta no tiene fechas de período definidas",
        detalles: {
          fecha_inicio: estadoData.fecha_inicio,
          fecha_fin: estadoData.fecha_fin,
        },
      });
    }

    const empresaId = estadoData.empresa_id;

    let inicio: Date;
    let fin: Date;

    try {
      inicio = parseDateString(estadoData.fecha_inicio);
      fin = parseDateString(estadoData.fecha_fin);
      fin.setHours(23, 59, 59, 999);

      // Adjust dates by subtracting local timezone offset to counteract the Sequelize connection timezone shift.
      // This aligns the query range with UTC, matching the historical behavior before the timezone configuration was added.
      const offsetMinutes = new Date().getTimezoneOffset();
      inicio = new Date(inicio.getTime() - offsetMinutes * 60 * 1000);
      fin = new Date(fin.getTime() - offsetMinutes * 60 * 1000);
    } catch (error) {
      return res.status(400).json({
        message: "Error al procesar las fechas del estado de cuenta",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }

    const whereCondition: any = {
      confirmedAt: {
        [Op.between]: [inicio, fin],
      },
    };

    if (empresaId) {
      const empresa = await Empresa.findByPk(empresaId);
      if (empresa) {
        whereCondition.id_empresa = empresaId;
      } else {
        return res.status(404).json({
          message: "Empresa no encontrada",
          empresaId,
        });
      }
    } else {
      whereCondition.id_empresa = null;
    }

    const queryOptions: any = {
      where: whereCondition,
      include: [
        {
          model: User,
          attributes: ["id", "nombre", "rut", "email"],
          required: false,
        },
        {
          model: Empresa,
          attributes: ["id", "nombre", "rut", "cuenta_corriente"],
          required: empresaId ? true : false,
        },
        {
          model: Reclamo,
          required: false,
        },
        {
          model: Pasajero,
          required: false,
          attributes: [
            "id",
            "nombre",
            "rut",
            "correo",
            "telefono",
            "id_centro_costo",
          ],
          include: [{ model: CentroCosto, required: false }],
        },
      ],
      order: [["confirmedAt", "DESC"]],
    };

    const baseTickets = await Ticket.findAll(queryOptions);
    const baseTicketsJSON = baseTickets.map((t) =>
      t.toJSON ? t.toJSON() : JSON.parse(JSON.stringify(t))
    );
    const allCombined = [...baseTicketsJSON, ...ticketsFueraPeriodo];
    const total = allCombined.length;

    if (page && limit) {
      const pageOffset = (page - 1) * limit;
      if (pageOffset >= total) {
        return res.json({
          data: [],
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
          },
        });
      }

      const paginatedData = allCombined.slice(pageOffset, pageOffset + limit);
      return res.json({
        data: paginatedData,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      });
    }

    return res.json(allCombined);
  } catch (error) {
    console.error("❌ Error al obtener tickets:", error);
    return res.status(500).json({
      message: "Error al obtener tickets del estado de cuenta",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

/**
 * Obtener un estado de cuenta por ID
 */
export const obtenerEstadoCuenta = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const estado = await EstadoCuenta.findByPk(id);
    if (!estado)
      return res
        .status(404)
        .json({ message: "Estado de cuenta no encontrado" });

    return res.json(estado);
  } catch (error) {
    console.error("Error al obtener estado de cuenta:", error);
    return res.status(500).json({
      message: "Error al obtener estado de cuenta",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

export const aplicarDescuentoEstadoCuenta = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const { porcentaje_descuento, descripcion_descuento } = req.body;

    // Validaciones
    if (!porcentaje_descuento || isNaN(Number(porcentaje_descuento))) {
      return res.status(400).json({
        message: "Porcentaje de descuento inválido o faltante",
      });
    }

    const porcentaje = Number(porcentaje_descuento);
    if (porcentaje < 0 || porcentaje > 100) {
      return res.status(400).json({
        message: "El porcentaje de descuento debe estar entre 0 y 100",
      });
    }

    // Buscar el estado de cuenta
    const estadoCuenta = await EstadoCuenta.findByPk(id);
    if (!estadoCuenta) {
      return res
        .status(404)
        .json({ message: "Estado de cuenta no encontrado" });
    }

    // Verificar que no esté pagado
    if (estadoCuenta.pagado) {
      return res.status(400).json({
        message:
          "No se puede aplicar descuento a un estado de cuenta ya pagado",
      });
    }

    // Verificar que no tenga ya un descuento aplicado
    if (
      estadoCuenta.porcentaje_descuento &&
      estadoCuenta.porcentaje_descuento > 0
    ) {
      return res.status(400).json({
        message: "Este estado de cuenta ya tiene un descuento aplicado",
        porcentaje_actual: estadoCuenta.porcentaje_descuento,
      });
    }

    // Base del descuento: consumo neto de tickets del periodo (tickets del periodo menos devoluciones dentro del periodo)
    // Excluye devoluciones fuera de periodo y reclamos
    const montoConsumoNetoPeriodo =
      Number(estadoCuenta.monto_facturado) +
      Number(estadoCuenta.devoluciones_fuera_periodo || 0) +
      Number(estadoCuenta.reclamos_descuento || 0);

    const montoDescuento = Math.round(montoConsumoNetoPeriodo * (porcentaje / 100));

    // 1. Obtener último saldo para calcular nuevo
    const ultimoMovimiento = await CuentaCorriente.findOne({
      where: { empresa_id: estadoCuenta.empresa_id },
      order: [
        ["fecha_movimiento", "DESC"],
        ["id", "DESC"],
      ],
    });

    let nuevoSaldo = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

    // 2. El descuento es un ABONO (suma al saldo)
    nuevoSaldo = nuevoSaldo + montoDescuento;

    // 3. Crear movimiento de ABONO por el descuento
    const abonoDescuento = await CuentaCorriente.create({
      empresa_id: estadoCuenta.empresa_id,
      tipo_movimiento: "abono",
      monto: montoDescuento,
      descripcion:
        descripcion_descuento ||
        `Descuento del ${porcentaje}% aplicado al estado de cuenta ${estadoCuenta.periodo}`,
      saldo: nuevoSaldo,
      referencia: `DESCUENTO-EDC-${estadoCuenta.id}`,
      fecha_movimiento: new Date(),
      estado_cuenta_id: estadoCuenta.id, // Vinculamos el abono con el estado de cuenta
    });

    // 4. Actualizar estado de cuenta con el porcentaje de descuento y el nuevo monto facturado final
    const nuevoMontoFacturado = Math.max(
      0,
      Number(estadoCuenta.monto_facturado) - montoDescuento,
    );

    await estadoCuenta.update({
      porcentaje_descuento: porcentaje,
      monto_facturado: nuevoMontoFacturado,
    });

    return res.json({
      message: "Descuento aplicado correctamente",
      descuento_aplicado: {
        porcentaje,
        monto_descuento: montoDescuento,
        monto_original: montoConsumoNetoPeriodo,
        monto_final: nuevoMontoFacturado,
        nuevo_saldo_empresa: nuevoSaldo,
      },
      movimiento_descuento: abonoDescuento,
      estado_cuenta: estadoCuenta,
    });
  } catch (error) {
    console.error("Error al aplicar descuento:", error);
    return res.status(500).json({
      message: "Error al aplicar descuento",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

/**
 * Revertir descuento de un estado de cuenta
 * Crea un CARGO para compensar el abono del descuento
 */
export const revertirDescuentoEstadoCuenta = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const { descripcion } = req.body;

    const estadoCuenta = await EstadoCuenta.findByPk(id);
    if (!estadoCuenta) {
      return res
        .status(404)
        .json({ message: "Estado de cuenta no encontrado" });
    }

    // Verificar que tenga un descuento aplicado
    if (!estadoCuenta.porcentaje_descuento) {
      return res.status(400).json({
        message: "Este estado de cuenta no tiene descuento aplicado",
      });
    }

    // Verificar que no esté pagado
    if (estadoCuenta.pagado) {
      return res.status(400).json({
        message:
          "No se puede revertir descuento a un estado de cuenta ya pagado",
      });
    }

    // Buscar el movimiento de descuento
    const movimientoDescuento = await CuentaCorriente.findOne({
      where: {
        empresa_id: estadoCuenta.empresa_id,
        tipo_movimiento: "abono",
        referencia: `DESCUENTO-EDC-${estadoCuenta.id}`,
      },
    });

    if (!movimientoDescuento) {
      return res.status(404).json({
        message: "No se encontró el movimiento de descuento asociado",
      });
    }

    // Obtener el monto de descuento real del movimiento
    const montoDescuento = Number(movimientoDescuento.monto);
    const porcentaje = estadoCuenta.porcentaje_descuento || 0;

    // 1. Obtener último saldo
    const ultimoMovimiento = await CuentaCorriente.findOne({
      where: { empresa_id: estadoCuenta.empresa_id },
      order: [
        ["fecha_movimiento", "DESC"],
        ["id", "DESC"],
      ],
    });

    let nuevoSaldo = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

    // 2. Crear CARGO para compensar el descuento (resta del saldo)
    nuevoSaldo = nuevoSaldo - montoDescuento;

    const cargoCompensatorio = await CuentaCorriente.create({
      empresa_id: estadoCuenta.empresa_id,
      tipo_movimiento: "cargo",
      monto: montoDescuento,
      descripcion:
        descripcion ||
        `Reversión de descuento del ${porcentaje}% al estado de cuenta ${estadoCuenta.periodo}`,
      saldo: nuevoSaldo,
      referencia: `REV-DESCUENTO-EDC-${estadoCuenta.id}`,
      fecha_movimiento: new Date(),
      estado_cuenta_id: estadoCuenta.id,
    });

    // 3. Eliminar el movimiento de descuento original
    await movimientoDescuento.destroy();

    // 4. Actualizar estado de cuenta (quitar porcentaje y restaurar monto facturado)
    const montoRestaurado = Number(estadoCuenta.monto_facturado) + montoDescuento;

    await estadoCuenta.update({
      porcentaje_descuento: 0,
      monto_facturado: montoRestaurado,
    });

    // 5. Recalcular saldos posteriores al movimiento eliminado
    await recalcularSaldosDesde(
      estadoCuenta.empresa_id,
      cargoCompensatorio.fecha_movimiento,
    );

    return res.json({
      message: "Descuento revertido correctamente",
      movimiento_compensatorio: cargoCompensatorio,
      estado_cuenta: estadoCuenta,
    });
  } catch (error) {
    console.error("Error al revertir descuento:", error);
    return res.status(500).json({
      message: "Error al revertir descuento",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

/**
 * Función helper para recalcular saldos desde una fecha
 */
const recalcularSaldosDesde = async (
  empresaId: number,
  fechaDesde: Date,
): Promise<void> => {
  // Obtener todos los movimientos desde la fecha indicada
  const movimientos = await CuentaCorriente.findAll({
    where: {
      empresa_id: empresaId,
      fecha_movimiento: { [Op.gte]: fechaDesde },
    },
    order: [
      ["fecha_movimiento", "ASC"],
      ["id", "ASC"],
    ],
  });

  if (movimientos.length === 0) return;

  // Obtener saldo anterior al primer movimiento
  const saldoAnterior = await CuentaCorriente.findOne({
    where: {
      empresa_id: empresaId,
      fecha_movimiento: { [Op.lt]: fechaDesde },
    },
    order: [["fecha_movimiento", "DESC"]],
  });

  let saldoAcumulado = saldoAnterior ? Number(saldoAnterior.saldo) : 0;

  // Recalcular cada movimiento
  for (const movimiento of movimientos) {
    if (movimiento.tipo_movimiento === "abono") {
      saldoAcumulado += Number(movimiento.monto);
    } else if (movimiento.tipo_movimiento === "cargo") {
      saldoAcumulado -= Number(movimiento.monto);
    }

    // Actualizar si el saldo cambió
    if (Math.abs(Number(movimiento.saldo) - saldoAcumulado) > 0.01) {
      await movimiento.update({ saldo: saldoAcumulado });
    }
  }
};

/**
 * Obtener información del descuento aplicado a un estado de cuenta
 */
export const obtenerDescuentoEstadoCuenta = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;

    const estadoCuenta = await EstadoCuenta.findByPk(id);
    if (!estadoCuenta) {
      return res
        .status(404)
        .json({ message: "Estado de cuenta no encontrado" });
    }

    // Buscar movimiento de descuento si existe
    const movimientoDescuento = await CuentaCorriente.findOne({
      where: {
        empresa_id: estadoCuenta.empresa_id,
        tipo_movimiento: "abono",
        referencia: `DESCUENTO-EDC-${estadoCuenta.id}`,
      },
    });

    const porcentaje = Number(estadoCuenta.porcentaje_descuento || 0);
    const montoFacturado = Number(estadoCuenta.monto_facturado || 0);
    const montoDescuento = movimientoDescuento ? Number(movimientoDescuento.monto) : 0;
    const montoOriginal = montoFacturado + montoDescuento;

    return res.json({
      estado_cuenta: estadoCuenta,
      descuento: movimientoDescuento
        ? {
            existe: true,
            porcentaje,
            monto_descuento: montoDescuento,
            monto_original: montoOriginal,
            monto_final: montoFacturado,
            movimiento: movimientoDescuento,
          }
        : {
            existe: false,
            porcentaje: 0,
            monto_descuento: 0,
            monto_original: montoFacturado,
            monto_final: montoFacturado,
          },
    });
  } catch (error) {
    console.error("Error al obtener descuento:", error);
    return res.status(500).json({
      message: "Error al obtener información de descuento",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};


/**
 * Reporte de control de envíos de EDPs por rango de fechas y estado
 */
export const obtenerReporteEnviosEDP = async (req: Request, res: Response) => {
  try {
    const {
      desde,
      hasta,
      estado,
      empresaId,
      search,
      owner,
      page = "1",
      limit = "20",
    } = req.query;

    const where: any = {};
    const empresaWhere: any = {};

    // 1. Filtro por rango de fechas (fecha_generacion)
    if (desde || hasta) {
      const fechaFiltro: any = {};
      if (desde) {
        fechaFiltro[Op.gte] = moment(desde as string).tz(TIMEZONE).startOf("day").toDate();
      }
      if (hasta) {
        fechaFiltro[Op.lte] = moment(hasta as string).tz(TIMEZONE).endOf("day").toDate();
      }
      where.fecha_generacion = fechaFiltro;
    }

    // 2. Filtro por empresaId directa (aislamiento de multi-empresa para rol admin)
    const userRole = (req as any).user?.rol;
    const userEmpresaId = (req as any).user?.empresa_id;
    if (userRole === "admin" && userEmpresaId) {
      where.empresa_id = Number(userEmpresaId);
    } else if (empresaId && empresaId !== "todas") {
      where.empresa_id = Number(empresaId);
    }

    // 3. Filtro por estado de email
    if (estado && estado !== "todos") {
      where.email_estado = estado;
    }

    // 4. Filtro por owner (multi-tenant)
    if (owner && (owner === "Pullman" || owner === "Wit")) {
      empresaWhere.owner = owner;
    }

    // 5. Búsqueda por término (RUT, nombre de empresa, o ID de EDP)
    if (search && typeof search === "string" && search.trim().length > 0) {
      const term = search.trim();
      const isNumeric = !isNaN(Number(term));

      if (isNumeric) {
        where[Op.or] = [
          { id: Number(term) },
          { "$empresa.rut$": { [Op.like]: `%${term}%` } },
          { "$empresa.nombre$": { [Op.like]: `%${term}%` } },
        ];
      } else {
        where[Op.or] = [
          { "$empresa.rut$": { [Op.like]: `%${term}%` } },
          { "$empresa.nombre$": { [Op.like]: `%${term}%` } },
        ];
      }
    }

    // 6. Cálculo de KPIs en el rango de fechas base (sin filtrar por el estado seleccionado para mostrar métricas globales del rango)
    const baseWhereForKPIs: any = {};
    if (where.fecha_generacion) {
      baseWhereForKPIs.fecha_generacion = where.fecha_generacion;
    }
    if (where.empresa_id) {
      baseWhereForKPIs.empresa_id = where.empresa_id;
    }

    const allEdpsInRange = await EstadoCuenta.findAll({
      where: baseWhereForKPIs,
      include: [
        {
          model: Empresa,
          as: "empresa",
          where: Object.keys(empresaWhere).length > 0 ? empresaWhere : undefined,
          attributes: ["id", "nombre", "rut", "owner"],
        },
      ],
      attributes: ["id", "email_estado"],
    });

    const totalInRange = allEdpsInRange.length;
    let enviados = 0;
    let omitidos = 0;
    let fallidos = 0;
    let pendientes = 0;

    allEdpsInRange.forEach((item) => {
      const st = item.email_estado || "pendiente";
      if (st === "enviado") enviados++;
      else if (st === "omitido") omitidos++;
      else if (st === "fallido") fallidos++;
      else pendientes++;
    });

    const tasaExito = totalInRange > 0 ? Math.round((enviados / totalInRange) * 100) : 0;

    // 7. Paginación y consulta de registros
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await EstadoCuenta.findAndCountAll({
      where,
      include: [
        {
          model: Empresa,
          as: "empresa",
          where: Object.keys(empresaWhere).length > 0 ? empresaWhere : undefined,
          attributes: [
            "id",
            "nombre",
            "rut",
            "cuenta_corriente",
            "contacto_fact_email",
            "contacto_fact_email_cc",
            "ejecutivo_com_email",
            "tipo_facturacion",
            "owner",
          ],
        },
      ],
      order: [["id", "DESC"]],
      limit: limitNum,
      offset,
    });

    const totalPages = Math.ceil(count / limitNum);

    return res.status(200).json({
      kpis: {
        total: totalInRange,
        enviados,
        omitidos,
        fallidos,
        pendientes,
        tasaExito,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages,
      },
      edps: rows.map((ec) => ({
        id: ec.id,
        empresa_id: ec.empresa_id,
        empresa_nombre: ec.empresa?.nombre ?? "Sin Empresa",
        empresa_rut: ec.empresa?.rut ?? "Sin RUT",
        empresa_cuenta_corriente: ec.empresa?.cuenta_corriente ?? "",
        empresa_tipo_facturacion: ec.empresa?.tipo_facturacion ?? "Masiva",
        empresa_owner: ec.empresa?.owner ?? "Pullman",
        contacto_fact_email: ec.empresa?.contacto_fact_email ?? "",
        contacto_fact_email_cc: ec.empresa?.contacto_fact_email_cc ?? "",
        periodo: ec.periodo,
        fecha_inicio: ec.fecha_inicio,
        fecha_fin: ec.fecha_fin,
        fecha_generacion: ec.fecha_generacion,
        total_tickets: ec.total_tickets,
        total_tickets_anulados: ec.total_tickets_anulados,
        monto_facturado: Number(ec.monto_facturado || 0),
        pagado: ec.pagado,
        email_estado: ec.email_estado || "pendiente",
        email_fecha_envio: ec.email_fecha_envio,
        email_destinatarios: ec.email_destinatarios,
        email_motivo: ec.email_motivo,
      })),
    });
  } catch (error) {
    console.error("Error al obtener reporte de envíos EDP:", error);
    return res.status(500).json({
      message: "Error interno al generar el reporte de envíos",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

/**
 * Exporta el reporte de envíos de EDPs a una planilla Excel corporativa
 */
export const exportarReporteEnviosExcel = async (req: Request, res: Response) => {
  try {
    const { desde, hasta, estado, empresaId, search, owner } = req.query;

    const where: any = {};
    const empresaWhere: any = {};

    if (desde || hasta) {
      const fechaFiltro: any = {};
      if (desde) {
        fechaFiltro[Op.gte] = moment(desde as string).tz(TIMEZONE).startOf("day").toDate();
      }
      if (hasta) {
        fechaFiltro[Op.lte] = moment(hasta as string).tz(TIMEZONE).endOf("day").toDate();
      }
      where.fecha_generacion = fechaFiltro;
    }

    const excelUserRole = (req as any).user?.rol;
    const excelUserEmpresaId = (req as any).user?.empresa_id;
    if (excelUserRole === "admin" && excelUserEmpresaId) {
      where.empresa_id = Number(excelUserEmpresaId);
    } else if (empresaId && empresaId !== "todas") {
      where.empresa_id = Number(empresaId);
    }
    if (estado && estado !== "todos") where.email_estado = estado;
    if (owner && (owner === "Pullman" || owner === "Wit")) empresaWhere.owner = owner;

    if (search && typeof search === "string" && search.trim().length > 0) {
      const term = search.trim();
      const isNumeric = !isNaN(Number(term));
      if (isNumeric) {
        where[Op.or] = [
          { id: Number(term) },
          { "$empresa.rut$": { [Op.like]: `%${term}%` } },
          { "$empresa.nombre$": { [Op.like]: `%${term}%` } },
        ];
      } else {
        where[Op.or] = [
          { "$empresa.rut$": { [Op.like]: `%${term}%` } },
          { "$empresa.nombre$": { [Op.like]: `%${term}%` } },
        ];
      }
    }

    const edps = await EstadoCuenta.findAll({
      where,
      include: [
        {
          model: Empresa,
          as: "empresa",
          where: Object.keys(empresaWhere).length > 0 ? empresaWhere : undefined,
          attributes: [
            "id",
            "nombre",
            "rut",
            "cuenta_corriente",
            "contacto_fact_email",
            "contacto_fact_email_cc",
            "tipo_facturacion",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Pullman Bus - Reservas Corporativas";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Reporte Envíos EDP", {
      views: [{ showGridLines: true }],
    });

    // Título Principal
    sheet.mergeCells("A1:M1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "PULLMAN BUS - REPORTE DE CONTROL DE ENVÍO DE ESTADOS DE PAGO (EDP)";
    titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2B48" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 30;

    // Subtítulo con rango de fechas y generación
    sheet.mergeCells("A2:M2");
    const subCell = sheet.getCell("A2");
    const fechaReporte = moment().tz(TIMEZONE).format("DD-MM-YYYY HH:mm");
    subCell.value = `Rango Consultado: ${desde || "Histórico"} al ${hasta || "Hoy"} | Generado: ${fechaReporte}`;
    subCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF334155" } };
    subCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(2).height = 20;

    sheet.addRow([]); // Espaciador

    // Encabezados de Columna
    const headers = [
      "N° EDP",
      "Razón Social Empresa",
      "RUT",
      "Cta. Corriente",
      "Tipo Facturación",
      "Período",
      "Fecha Generación",
      "Boletos Vigentes",
      "Boletos Anulados",
      "Monto Facturado (CLP)",
      "Estado Envío",
      "Fecha Envío",
      "Destinatarios",
      "Motivo / Observación",
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
      };
    });

    // Filas de datos
    edps.forEach((ec, idx) => {
      const estado = ec.email_estado || "pendiente";
      const fechaGenStr = ec.fecha_generacion
        ? moment(ec.fecha_generacion).tz(TIMEZONE).format("DD-MM-YYYY")
        : "";
      const fechaEnvioStr = ec.email_fecha_envio
        ? moment(ec.email_fecha_envio).tz(TIMEZONE).format("DD-MM-YYYY HH:mm")
        : "-";

      const row = sheet.addRow([
        ec.id,
        ec.empresa?.nombre || "Sin Empresa",
        ec.empresa?.rut || "Sin RUT",
        ec.empresa?.cuenta_corriente || "-",
        ec.empresa?.tipo_facturacion || "Masiva",
        ec.periodo,
        fechaGenStr,
        Number(ec.total_tickets || 0) - Number(ec.total_tickets_anulados || 0),
        Number(ec.total_tickets_anulados || 0),
        Number(ec.monto_facturado || 0),
        estado.toUpperCase(),
        fechaEnvioStr,
        ec.email_destinatarios || "-",
        ec.email_motivo || "-",
      ]);

      row.height = 22;
      const isZebra = idx % 2 === 1;

      row.eachCell((cell, colNumber) => {
        cell.font = { name: "Arial", size: 9 };
        if (isZebra) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }

        // Formatos específicos por columna
        if (colNumber === 1 || colNumber === 3 || colNumber === 4 || colNumber === 5 || colNumber === 6 || colNumber === 7 || colNumber === 12) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (colNumber === 8 || colNumber === 9) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.numFmt = "#,##0";
        } else if (colNumber === 10) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.numFmt = "$#,##0";
        } else if (colNumber === 11) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
          // Colores de estado
          if (estado === "enviado") {
            cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF166534" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
          } else if (estado === "omitido") {
            cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF854D0E" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
          } else if (estado === "fallido") {
            cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF991B1B" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          }
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }

        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    // Ajustar anchos automáticos
    sheet.columns = [
      { width: 10 }, // N° EDP
      { width: 34 }, // Empresa
      { width: 14 }, // RUT
      { width: 14 }, // Cta Corriente
      { width: 16 }, // Tipo Fact
      { width: 12 }, // Periodo
      { width: 16 }, // Fecha Gen
      { width: 15 }, // Boletos Vigentes
      { width: 15 }, // Boletos Anulados
      { width: 20 }, // Monto Facturado
      { width: 16 }, // Estado Envío
      { width: 18 }, // Fecha Envío
      { width: 36 }, // Destinatarios
      { width: 36 }, // Motivo
    ];

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=reporte_envios_edp_${moment().tz(TIMEZONE).format("YYYYMMDD_HHmm")}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error al exportar reporte de envíos Excel:", error);
    return res.status(500).json({
      message: "Error al generar la planilla Excel",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

/**
 * Reenvía manualmente el correo de un Estado de Pago individual
 */
export const reenviarEDPEmailIndividual = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ message: "ID de Estado de Pago inválido" });
    }

    const resultado = await resendSingleEDPEmail(Number(id));
    return res.status(200).json(resultado);
  } catch (error) {
    console.error(`Error al reenviar email para EDP #${req.params.id}:`, error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Error desconocido al reenviar el correo",
    });
  }
};
