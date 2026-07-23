import { connectDB } from "../database";
import { Empresa } from "../models/empresa.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Pasajero } from "../models/pasajero.model";
import { Op } from "sequelize";

/**
 * Genera o actualiza automáticamente los estados de pago para las empresas para todos los periodos históricos,
 * desde el primer ticket registrado hasta el mes actual, usando los días de facturación y vencimiento definidos en la base de datos.
 * El estado de cuenta del periodo actual se genera hasta la fecha de hoy.
 * Si detecta más de un periodo a cerrar según el día de facturación, crea o actualiza todos los estados de cuenta necesarios.
 * Genera estados de cuenta vacíos si no hay tickets en el periodo.
 *
 * Se añaden logs detallados para depuración.
 *
 * Ahora incluye fecha_facturacion y fecha_vencimiento calculadas en base a los días configurados en la empresa.
 * USANDO id_empresa DIRECTO de tickets
 */
const formatFecha = (d: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const generarEstadosPagoEmpresas = async () => {
  await connectDB();
  const hoy = new Date();
  const periodoActual = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, "0")}`;

  console.log(
    `[${new Date().toISOString()}] === INICIO generarEstadosPagoEmpresas ===`,
  );

  // Buscar solo empresas con facturación automática (excluir fact_manual = true)
  const empresas = await Empresa.findAll({ where: { fact_manual: false } });
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

    // Buscar el primer y último ticket de la empresa USANDO id_empresa DIRECTO
    const primerTicket = await Ticket.findOne({
      where: { id_empresa: empresaId },
      order: [["created_at", "ASC"]],
    });

    const ultimoTicket = await Ticket.findOne({
      where: { id_empresa: empresaId },
      order: [["created_at", "DESC"]],
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

    // Si no hay tickets, igual debe generar estados de cuenta vacíos desde la fecha de creación de la empresa
    let fechaInicio: Date;
    if (primerTicket && primerTicket.created_at) {
      fechaInicio = new Date(primerTicket.created_at);
    } else {
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0);
    }

    // Ajustar fechaInicio al primer día de facturación posterior o igual
    if (fechaInicio.getDate() > diaFacturacion) {
      fechaInicio.setMonth(fechaInicio.getMonth() + 1);
    }
    fechaInicio.setDate(diaFacturacion);
    fechaInicio.setHours(0, 0, 0, 0);

    const fechaFin = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate(),
      23,
      59,
      59,
    );

    // Generar periodos mensuales desde fechaInicio hasta fechaFin
    const periodos: {
      periodo: string;
      inicio: Date;
      fin: Date;
      esPeriodoActual: boolean;
    }[] = [];
    let fechaIter = new Date(fechaInicio);

    let periodosGenerados = 0;
    while (fechaIter <= fechaFin) {
      const inicioPeriodo = new Date(fechaIter);
      const siguientePeriodo = new Date(inicioPeriodo);
      siguientePeriodo.setMonth(siguientePeriodo.getMonth() + 1);
      // El período cierra el día anterior al día de facturación, al final del día
      const finPeriodo = new Date(siguientePeriodo);
      finPeriodo.setDate(finPeriodo.getDate() - 1);
      finPeriodo.setHours(23, 59, 59, 999);

      const periodo = `${inicioPeriodo.getFullYear()}-${(inicioPeriodo.getMonth() + 1).toString().padStart(2, "0")}`;
      const esPeriodoActual = hoy >= inicioPeriodo && hoy < finPeriodo;

      periodos.push({
        periodo,
        inicio: inicioPeriodo,
        fin: esPeriodoActual ? fechaFin : finPeriodo,
        esPeriodoActual,
      });

      fechaIter = new Date(siguientePeriodo);
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
        fin: esPeriodoActual ? fechaFin : finPeriodo,
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
        // Calcular fecha_facturacion y fecha_vencimiento para el periodo
        let fecha_facturacion: Date | null = null;
        let fecha_vencimiento: Date | null = null;

        const anioSiguiente =
          inicio.getMonth() === 11
            ? inicio.getFullYear() + 1
            : inicio.getFullYear();
        const mesSiguiente = (inicio.getMonth() + 1) % 12;

        fecha_facturacion = new Date(
          anioSiguiente,
          mesSiguiente,
          diaFacturacion,
          0,
          0,
          0,
          0,
        );
        fecha_vencimiento = new Date(
          anioSiguiente,
          mesSiguiente,
          diaVencimiento,
          0,
          0,
          0,
          0,
        );

        // Buscar todos los tickets del periodo USANDO id_empresa DIRECTO y confirmedAt
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
              model: Pasajero,
              include: [
                {
                  model: CentroCosto,
                  attributes: ["id", "nombre"],
                },
              ],
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
        const monto_bruto = tickets.reduce(
          (sum, t) => sum + (Number(t.monto_boleto) || 0),
          0,
        );
        const devoluciones = tickets.reduce(
          (sum, t) => sum + (Number(t.monto_devolucion) || 0),
          0,
        );

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

        const monto_neto_consumo_real = monto_bruto - devoluciones;
        let monto_neto_consumo = 0;
        let porcentajeDescuento = 0;
        let descuento = 0;
        let monto_facturado = 0;

        if (monto_neto_consumo_real >= 0) {
          monto_neto_consumo = monto_neto_consumo_real;
          // Calcular descuento por tramos si aplica (para todas las empresas)
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
              monto_neto_consumo >= desde &&
              (hasta === null || monto_neto_consumo <= hasta)
            ) {
              porcentajeDescuento = Number(tramo.porcentaje_descuento);
            }
          }
          descuento = monto_neto_consumo * (porcentajeDescuento / 100);
          monto_facturado = monto_neto_consumo - descuento;
        }

        console.log(
          `[${new Date().toISOString()}] Periodo ${periodo}: total_tickets=${total_tickets}, total_tickets_anulados=${total_tickets_anulados}, monto_bruto=${monto_bruto}, devoluciones=${devoluciones}, monto_neto_consumo=${monto_neto_consumo}, porcentaje_descuento=${porcentajeDescuento}%, monto_facturado=${monto_facturado}, monto_neto_consumo_real=${monto_neto_consumo_real}`,
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
            pasajero?.centroCosto?.nombre || "Sin asignar";

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
          const boleto = Number(ticket.monto_boleto) || 0;
          const devolucion = Number(ticket.monto_devolucion) || 0;
          detallePorCC[centroCostoNombre].monto_facturado +=
            boleto - devolucion;
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
            // Período cerrado sin EDP: crear definitivo aplicando tramos y reclamos
            const descuentoReclamosDisponibles = Number(empresa.descuento_pendiente_edp) || 0;
            let balance = monto_facturado;

            // 1. Aplicar devoluciones fuera de periodo
            let devoluciones_fuera_periodo_aplicadas = 0;
            let devoluciones_fuera_periodo_restante = 0;
            if (balance >= devoluciones_fuera_periodo) {
              devoluciones_fuera_periodo_aplicadas = devoluciones_fuera_periodo;
              balance -= devoluciones_fuera_periodo_aplicadas;
            } else {
              devoluciones_fuera_periodo_aplicadas = balance;
              devoluciones_fuera_periodo_restante = devoluciones_fuera_periodo - devoluciones_fuera_periodo_aplicadas;
              balance = 0;
            }

            // 2. Aplicar reclamos
            let reclamos_aplicados = 0;
            let reclamos_restante = 0;
            if (balance >= descuentoReclamosDisponibles) {
              reclamos_aplicados = descuentoReclamosDisponibles;
              balance -= reclamos_aplicados;
            } else {
              reclamos_aplicados = balance;
              reclamos_restante = descuentoReclamosDisponibles - reclamos_aplicados;
              balance = 0;
            }

            const monto_facturado_final = balance;
            const nuevo_descuento_pendiente = devoluciones_fuera_periodo_restante + reclamos_restante;
            const suma_devoluciones_final =
              devoluciones + reclamos_aplicados + devoluciones_fuera_periodo_aplicadas;

            await EstadoCuenta.create({
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
            console.log(
              `[${new Date().toISOString()}] EstadoCuenta creado para empresa ${empresaId}, periodo ${periodo}. Monto facturado final: ${monto_facturado_final} (descuento reclamos aplicado: ${reclamos_aplicados})`
            );

            await empresa.update({ descuento_pendiente_edp: nuevo_descuento_pendiente });
            console.log(
              `[${new Date().toISOString()}] descuento_pendiente_edp actualizado a ${nuevo_descuento_pendiente} para empresa ${empresaId}`
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
};
