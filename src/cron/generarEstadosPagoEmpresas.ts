import { connectDB } from "../database";
import { Empresa } from "../models/empresa.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Pasajero } from "../models/pasajero.model";
import { Reclamo } from "../models/reclamo.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { Op } from "sequelize";
import moment from "moment-timezone";
import {
  processEDPMailQueue,
  EDPMailQueueItem,
} from "../services/edpMailBatch.service";

const TIMEZONE = "America/Santiago";

/**
 * Formatea una fecha al huso horario de Chile (America/Santiago) en string 'YYYY-MM-DD HH:mm:ss'
 */
const formatFecha = (d: Date | string | moment.Moment): string => {
  return moment(d).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss");
};

export const generarEstadosPagoEmpresas = async (
  fechaActual?: Date,
  targetEmpresaId?: number,
) => {
  await connectDB();
  const hoyChile = fechaActual
    ? moment(fechaActual).tz(TIMEZONE)
    : moment().tz(TIMEZONE);
  const hoy = hoyChile.toDate();
  const periodoActual = hoyChile.format("YYYY-MM");

  console.log(
    `[${new Date().toISOString()}] === INICIO generarEstadosPagoEmpresas (Hora Chile: ${hoyChile.format("YYYY-MM-DD HH:mm:ss")}) ===`,
  );

  // Cola de EDPs para envio de email (solo se acumula, no afecta la generacion de EDPs)
  const edpCreatedForEmail: EDPMailQueueItem[] = [];

  // Buscar solo empresas con facturación automática (excluir fact_manual = true)
  const whereCondition: any = { fact_manual: false };
  if (targetEmpresaId) {
    whereCondition.id = targetEmpresaId;
  }
  const empresas = await Empresa.findAll({ where: whereCondition });
  console.log(
    `[${new Date().toISOString()}] Empresas encontradas: ${empresas.length}`,
  );

  for (const empresa of empresas) {
    const empresaId = empresa.id;
    const empresaNombre = empresa.nombre;
    const diaFacturacion = empresa.dia_facturacion || 1;
    const diaVencimiento = empresa.dia_vencimiento || 1;

    console.log(
      `[${new Date().toISOString()}] Procesando empresa ID: ${empresaId} (${empresaNombre}), Día facturación: ${diaFacturacion}, Día vencimiento: ${diaVencimiento}`,
    );

    // Buscar el primer ticket de la empresa
    const primerTicket = await Ticket.findOne({
      where: { id_empresa: empresaId },
      order: [["created_at", "ASC"]],
    });

    if (primerTicket) {
      console.log(
        `[${new Date().toISOString()}] Primer ticket: #${primerTicket.ticketNumber} - ${primerTicket.created_at}`,
      );
    } else {
      console.log(
        `[${new Date().toISOString()}] No hay tickets para empresa ${empresaId}`,
      );
    }

    // Calcular fechaInicio fijada en horario de Chile
    let fechaInicioChile: moment.Moment;
    if (primerTicket && primerTicket.created_at) {
      fechaInicioChile = moment(primerTicket.created_at).tz(TIMEZONE);
    } else {
      fechaInicioChile = moment(hoyChile)
        .subtract(1, "month")
        .date(1)
        .startOf("day");
    }

    // Ajustar fechaInicioChile al día de facturación en hora local de Chile
    if (fechaInicioChile.date() > diaFacturacion) {
      fechaInicioChile.add(1, "month");
    }
    const maxDays = fechaInicioChile.daysInMonth();
    fechaInicioChile.date(Math.min(diaFacturacion, maxDays)).startOf("day");

    const fechaFinChile = moment(hoyChile).endOf("day");

    // Generar periodos mensuales desde fechaInicioChile hasta fechaFinChile
    const periodos: {
      periodo: string;
      inicio: Date;
      fin: Date;
      esPeriodoActual: boolean;
    }[] = [];

    let fechaIterChile = moment(fechaInicioChile);
    let periodosGenerados = 0;

    while (fechaIterChile.isSameOrBefore(fechaFinChile, "day")) {
      const inicioPeriodoChile = moment(fechaIterChile).startOf("day");
      const siguientePeriodoChile = moment(inicioPeriodoChile).add(1, "month");
      const finPeriodoChile = moment(siguientePeriodoChile)
        .subtract(1, "day")
        .endOf("day");

      const periodoStr = inicioPeriodoChile.format("YYYY-MM");
      const esPeriodoCerrado = hoyChile.isAfter(finPeriodoChile);
      const esPeriodoActual = !esPeriodoCerrado;

      periodos.push({
        periodo: periodoStr,
        inicio: inicioPeriodoChile.toDate(),
        fin: esPeriodoActual ? hoy : finPeriodoChile.toDate(),
        esPeriodoActual,
      });

      fechaIterChile = moment(siguientePeriodoChile);
      periodosGenerados++;
    }

    if (periodosGenerados === 0) {
      const inicioPeriodo = new Date(
        hoy.getFullYear(),
        hoy.getMonth(),
        diaFacturacion,
        0,
        0,
        0,
      );
      const siguientePeriodo = new Date(inicioPeriodo);
      siguientePeriodo.setMonth(siguientePeriodo.getMonth() + 1);
      const finPeriodo = new Date(siguientePeriodo);
      finPeriodo.setDate(finPeriodo.getDate() - 1);
      finPeriodo.setHours(23, 59, 59, 999);

      const periodo = `${inicioPeriodo.getFullYear()}-${(inicioPeriodo.getMonth() + 1).toString().padStart(2, "0")}`;
      const esPeriodoActual = hoy >= inicioPeriodo && hoy < finPeriodo;

      periodos.push({
        periodo,
        inicio: inicioPeriodo,
        fin: esPeriodoActual ? hoy : finPeriodo,
        esPeriodoActual,
      });
    }

    console.log(
      `[${new Date().toISOString()}] Periodos generados para empresa ${empresaId}: ${periodos.map((p) => p.periodo).join(", ")}`,
    );

    // Procesar cada periodo histórico para EstadoCuenta y cargo global
    for (const { periodo, inicio, fin, esPeriodoActual } of periodos) {
      console.log(
        `[${new Date().toISOString()}] === Procesando periodo ${periodo} (inicio: ${inicio.toISOString()}, fin: ${fin.toISOString()}) ===`,
      );
      try {
        // Calcular fecha_facturacion y fecha_vencimiento para el periodo en horario de Chile
        const inicioMoment = moment(inicio).tz(TIMEZONE);
        const siguienteMesMoment = moment(inicioMoment).add(1, "month");

        const fecha_facturacion = siguienteMesMoment
          .clone()
          .date(Math.min(diaFacturacion, siguienteMesMoment.daysInMonth()))
          .startOf("day")
          .toDate();

        const fecha_vencimiento = siguienteMesMoment
          .clone()
          .date(Math.min(diaVencimiento, siguienteMesMoment.daysInMonth()))
          .startOf("day")
          .toDate();

        // Buscar todos los tickets del periodo USANDO id_empresa DIRECTO y confirmedAt
        // Se incluyen todas las relaciones necesarias para el snapshot completo
        const tickets = await Ticket.findAll({
          where: {
            id_empresa: empresaId,
            ticketStatus: { [Op.in]: ["Confirmed", "Anulado"] },
            confirmedAt: {
              [Op.gte]: inicio,
              [Op.lte]: fin, // fin = último día del período a las 23:59:59
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
              attributes: [
                "id",
                "nombre",
                "rut",
                "correo",
                "id_centro_costo",
              ],
              include: [
                {
                  model: CentroCosto,
                  attributes: ["id", "nombre"],
                  required: false,
                },
              ],
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
          ],
        });

        console.log(
          `[${new Date().toISOString()}] Tickets en periodo ${periodo}: ${tickets.length}`,
        );

        // Cálculo usando monto_boleto y monto_devolucion directamente de los tickets
        const total_tickets = tickets.length;
        const total_tickets_anulados = tickets.filter(
          (t) => t.ticketStatus === "Anulado",
        ).length;

        // Base de cálculo: solo tickets CONFIRMADOS (sin incluir anulados)
        const monto_confirmados = tickets
          .filter((t) => t.ticketStatus === "Confirmed")
          .reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
        // Devoluciones: solo los montos devueltos de tickets anulados dentro del periodo
        const devoluciones = tickets
          .filter((t) => t.ticketStatus === "Anulado")
          .reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
        // Base neta sobre la que se aplica el descuento: G = confirmados - devoluciones_dentro
        const monto_neto_base = monto_confirmados - devoluciones;

        // Buscar tickets del periodo anterior anulados fuera de periodo
        const ticketsAnuladosFueraPeriodo = await Ticket.findAll({
          where: {
            id_empresa: empresaId,
            ticketStatus: "Anulado",
            confirmedAt: {
              [Op.lt]: inicio,
            },
            updated_at: {
              [Op.between]: [inicio, fin],
            },
          },
        });
        const devoluciones_fuera_periodo = ticketsAnuladosFueraPeriodo.reduce(
          (sum, t) => sum + (Number(t.monto_devolucion) || 0),
          0,
        );

        let porcentajeDescuento = 0;
        let descuento = 0;
        let monto_facturado = 0;

        if (monto_neto_base >= 0) {
          // Descuento por tramos sobre monto_neto_base (G = confirmados - devoluciones_dentro)
          const tramos = await EmpresaTramo.findAll({
            where: { id_empresa: empresaId },
            order: [["monto_desde", "ASC"]],
          });
          for (const tramo of tramos) {
            const desde = Number(tramo.monto_desde);
            const hasta =
              tramo.monto_hasta !== null && tramo.monto_hasta !== undefined
                ? Number(tramo.monto_hasta)
                : null;
            if (
              monto_neto_base >= desde &&
              (hasta === null || monto_neto_base <= hasta)
            ) {
              porcentajeDescuento = Number(tramo.porcentaje_descuento);
            }
          }
          // H = G * porcentaje / 100
          descuento = Math.round(monto_neto_base * (porcentajeDescuento / 100));
          // I = G - H (antes de aplicar E y F)
          monto_facturado = monto_neto_base - descuento;
          if (monto_facturado < 0) monto_facturado = 0;
        }

        console.log(
          `[${new Date().toISOString()}] Periodo ${periodo}: total_tickets=${total_tickets}, total_tickets_anulados=${total_tickets_anulados}, monto_confirmados=${monto_confirmados}, devoluciones=${devoluciones}, monto_neto_base=${monto_neto_base}, porcentaje_descuento=${porcentajeDescuento}%, descuento=${descuento}, monto_facturado(I)=${monto_facturado}`,
        );

        // Detalle por centro de costo - USANDO CENTRO DE COSTO DEL PASAJERO
        const detallePorCC: Record<
          string,
          {
            nombre: string;
            total_tickets: number;
            total_anulados: number;
            monto_facturado: number;
          }
        > = {};

        // Inicializar con centro de costo "Sin asignar"
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
          }
          // Solo acumular monto de tickets CONFIRMADOS en el desglose por CC
          if (ticket.ticketStatus !== "Anulado") {
            detallePorCC[centroCostoNombre].monto_facturado +=
              Number(ticket.monto_boleto) || 0;
          }
        }

        console.log(
          `[${new Date().toISOString()}] Detalle por centro de costo para periodo ${periodo}: ${JSON.stringify(detallePorCC)}`,
        );

        // Buscar si ya existe EstadoCuenta para este periodo y empresa
        let estadoCuenta = await EstadoCuenta.findOne({
          where: {
            empresa_id: empresaId,
            [Op.or]: [
              { periodo },
              { fecha_inicio: formatFecha(inicio) }, // Para detectar los creados por el cron antiguo
            ],
          },
        });

        if (estadoCuenta) {
          console.log(
            `[${new Date().toISOString()}] EstadoCuenta ya existe para empresa ${empresaId}, periodo ${periodo} — omitido`,
          );
        } else {
          if (esPeriodoActual) {
            // Período abierto sin EDP: no crear hasta que cierre
            console.log(
              `[${new Date().toISOString()}] Período ${periodo} aún abierto para empresa ${empresaId} — EDP omitido hasta el día de facturación`,
            );
          } else {
            // Período cerrado sin EDP: verificar si tiene tickets o devoluciones pendientes
            const devolucionFueraPendiente =
              Number(empresa.devolucion_pendiente_edp) || 0;
            const totalDevolucionesFueraDisponibles =
              devoluciones_fuera_periodo + devolucionFueraPendiente;
            const reclamosDisponibles =
              Number(empresa.descuento_pendiente_edp) || 0;

            const tieneMovimiento =
              tickets.length > 0 ||
              totalDevolucionesFueraDisponibles > 0 ||
              reclamosDisponibles > 0;

            if (!tieneMovimiento) {
              console.log(
                `[${new Date().toISOString()}] Período ${periodo} cerrado para empresa ${empresaId} con 0 tickets y 0 devoluciones — EDP omitido`,
              );
              continue;
            }

            let balance = monto_facturado;

            // 1. Aplicar devoluciones fuera de periodo (tickets del mes + saldo acumulado fuera de periodo)
            let devoluciones_fuera_periodo_aplicadas = 0;
            let devoluciones_fuera_periodo_restante = 0;
            if (balance >= totalDevolucionesFueraDisponibles) {
              devoluciones_fuera_periodo_aplicadas =
                totalDevolucionesFueraDisponibles;
              balance -= devoluciones_fuera_periodo_aplicadas;
              devoluciones_fuera_periodo_restante = 0;
            } else {
              devoluciones_fuera_periodo_aplicadas = balance;
              devoluciones_fuera_periodo_restante =
                totalDevolucionesFueraDisponibles -
                devoluciones_fuera_periodo_aplicadas;
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

            const monto_facturado_final = balance;
            const suma_devoluciones_final =
              devoluciones +
              reclamos_aplicados +
              devoluciones_fuera_periodo_aplicadas;

            const estadoCuenta = await EstadoCuenta.create({
              empresa_id: empresaId,
              periodo,
              fecha_generacion: fin,
              total_tickets,
              total_tickets_anulados,
              monto_facturado: monto_facturado_final,
              suma_devoluciones: suma_devoluciones_final,
              reclamos_descuento: reclamos_aplicados,
              devoluciones_fuera_periodo: devoluciones_fuera_periodo_aplicadas,
              porcentaje_descuento: porcentajeDescuento,
              detalle_por_cc: JSON.stringify(detallePorCC),
              pagado: false,
              fecha_facturacion,
              fecha_vencimiento,
              fecha_inicio: formatFecha(inicio),
              fecha_fin: formatFecha(fin),
            });

            // Guardar snapshot de cada ticket en la tabla edp_ticket_snapshots
            if (tickets.length > 0) {
              const snapshotRows = tickets.map((t) => ({
                edp_id: estadoCuenta.id,
                ticket_data: JSON.stringify(t.toJSON()),
              }));
              await EdpTicketSnapshot.bulkCreate(snapshotRows);
            }
            console.log(
              `[${new Date().toISOString()}] EstadoCuenta creado para empresa ${empresaId}, periodo ${periodo}. Monto facturado final: ${monto_facturado_final} (devoluciones fuera: ${devoluciones_fuera_periodo_aplicadas}, reclamos: ${reclamos_aplicados})`,
            );

            // Acumular en cola de email si la empresa es de tipo Masiva
            if (empresa.tipo_facturacion === "Masiva") {
              edpCreatedForEmail.push({
                estadoCuentaId: estadoCuenta.id,
                periodo,
                fechaInicio: inicio,
                fechaFin: fin,
                fechaGeneracion: fin,
                totalTickets: total_tickets,
                totalTicketsAnulados: total_tickets_anulados,
                montoFacturado: monto_facturado_final,
                porcentajeDescuento: porcentajeDescuento,
                montoDescuento: descuento,
                devolucionesDentroDelPeriodo: devoluciones,
                devolucionesFueraPeriodo: devoluciones_fuera_periodo_aplicadas,
                reclamosDescuento: reclamos_aplicados,
                empresa: {
                  id: empresa.id,
                  nombre: empresa.nombre,
                  rut: empresa.rut,
                  cuenta_corriente: empresa.cuenta_corriente,
                  contacto_fact_email: empresa.contacto_fact_email || "",
                  ejecutivo_com_email: empresa.ejecutivo_com_email || "",
                  tipo_facturacion: empresa.tipo_facturacion,
                },
                tickets: tickets.map((t) => (t.toJSON ? t.toJSON() : t)),
                detallePorCC,
              });
            }

            await empresa.update({
              devolucion_pendiente_edp: devoluciones_fuera_periodo_restante,
              descuento_pendiente_edp: reclamos_restante,
            });

            console.log(
              `[${new Date().toISOString()}] descuento_pendiente_edp actualizado a ${reclamos_restante} para empresa ${empresaId}`,
            );

            // Cargo global en CuentaCorriente: solo cuando el período ya cerró y hay monto facturado positivo
            if (monto_facturado_final > 0) {
              const referenciaGlobal = `FACT-${empresaId}-${periodo}`;
              const existeCargoGlobal = await CuentaCorriente.findOne({
                where: {
                  empresa_id: empresaId,
                  referencia: referenciaGlobal,
                },
              });
              if (!existeCargoGlobal) {
                let descripcionCargo = `Cargo automático por facturación periodo ${periodo}.`;
                if (porcentajeDescuento > 0 && reclamos_aplicados > 0) {
                  descripcionCargo = `Cargo automático por facturación periodo ${periodo} (Descuento del ${porcentajeDescuento}% y descuento por reclamos de $${reclamos_aplicados} aplicados).`;
                } else if (porcentajeDescuento > 0) {
                  descripcionCargo = `Cargo automático por facturación periodo ${periodo} (Descuento del ${porcentajeDescuento}% aplicado).`;
                } else if (reclamos_aplicados > 0) {
                  descripcionCargo = `Cargo automático por facturación periodo ${periodo} (Descuento por reclamos de $${reclamos_aplicados} aplicado).`;
                }

                await CuentaCorriente.create({
                  empresa_id: empresaId,
                  tipo_movimiento: "cargo",
                  monto: monto_facturado_final,
                  descripcion: descripcionCargo,
                  saldo: 0, // Se actualizará después en el cálculo general si corresponde
                  referencia: referenciaGlobal,
                });
                console.log(
                  `[${new Date().toISOString()}] Cargo global creado en cuenta corriente para empresa ${empresaId}, periodo ${periodo}, monto: ${monto_facturado_final}`,
                );
              } else {
                console.log(
                  `[${new Date().toISOString()}] Cargo global YA EXISTE en cuenta corriente para empresa ${empresaId}, periodo ${periodo}`,
                );
              }
            } else {
              console.log(
                `[${new Date().toISOString()}] No se crea cargo para empresa ${empresaId}, periodo ${periodo} (monto_facturado_final <= 0)`,
              );
            }
          }
        }
      } catch (err: any) {
        // Si hay un error, simplemente lo registramos y no detenemos el resto del proceso.
        // NO intentamos modificar registros históricos para no alterar datos anteriores a la migración.
        if (err.name === "SequelizeUniqueConstraintError") {
          console.warn(
            `[${new Date().toISOString()}] CONFLICTO unique_empresa_inicio en empresa ${empresaId}, periodo ${periodo} — Omitiendo creación de duplicado histórico.`,
          );
        } else {
          console.error(
            `[${new Date().toISOString()}] Error procesando periodo ${periodo} de empresa ${empresaId}:`,
            err.message,
          );
        }
      }
    }
  }

  console.log(
    `[${new Date().toISOString()}] === FIN generarEstadosPagoEmpresas ===`,
  );

  // Procesar cola de emails de EDP (no bloquea el cron si falla)
  if (edpCreatedForEmail.length > 0) {
    console.log(
      `[${new Date().toISOString()}] Iniciando envio de emails EDP para ${edpCreatedForEmail.length} EDPs...`,
    );
    processEDPMailQueue(edpCreatedForEmail).catch((err) => {
      console.error(
        `[${new Date().toISOString()}] Error en processEDPMailQueue:`,
        err,
      );
    });
  }
};
