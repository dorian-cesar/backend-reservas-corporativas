// src/services/empresaSaldo.service.ts

import { Empresa } from "../models/empresa.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { Op } from "sequelize";
import moment from "moment-timezone";

const TIMEZONE = "America/Santiago";

export interface IResumenSaldoEmpresa {
  empresa_id: number;
  monto_acumulado: number;
  deuda_cc_impaga: number;
  deuda_total: number;
  monto_maximo: number | null;
  saldo_disponible_libre: number | null;
  morosidad: boolean;
}

export interface IResultadoDisponibilidad {
  disponible: boolean;
  message: string;
  morosidad?: boolean;
  detalles: {
    monto_maximo: number | null;
    monto_acumulado: number;
    deuda_cc_impaga: number;
    deuda_total: number;
    monto_ticket: number;
    monto_nuevo_total: number;
    disponible: number | null;
    porcentaje_disponible?: number;
    excedido?: number;
  };
}

/**
 * Obtiene el resumen de deuda y saldo disponible de una empresa.
 * Deuda Total = monto_acumulado (ventas período activo) + deuda_cc_impaga (cargos impagos en cuenta corriente)
 */
export const obtenerResumenSaldoEmpresa = async (
  empresaId: number
): Promise<IResumenSaldoEmpresa> => {
  const empresa = await Empresa.findByPk(empresaId);
  if (!empresa) {
    throw new Error(`Empresa con ID ${empresaId} no encontrada`);
  }

  // 1. Obtener el último estado de cuenta (EDP) generado para la empresa
  const ultimoEdp = await EstadoCuenta.findOne({
    where: { empresa_id: empresaId },
    order: [["fecha_fin", "DESC"], ["id", "DESC"]],
  });

  let fechaInicioPeriodo: Date | null = null;
  if (ultimoEdp && (ultimoEdp.fecha_fin || ultimoEdp.fecha_generacion)) {
    const fechaFinRef = ultimoEdp.fecha_fin || ultimoEdp.fecha_generacion;
    fechaInicioPeriodo = moment.tz(fechaFinRef, TIMEZONE).add(1, "second").toDate();
  }

  // 2. Sumar las ventas confirmadas en el período activo posterior al último EDP
  const whereTicket: any = {
    id_empresa: empresaId,
    ticketStatus: "Confirmed",
  };
  if (fechaInicioPeriodo) {
    whereTicket.confirmedAt = { [Op.gte]: fechaInicioPeriodo };
  }

  const ticketsPeriodo = await Ticket.findAll({ where: whereTicket });
  const ventasPeriodoActivo = ticketsPeriodo.reduce(
    (sum, t) => sum + Number(t.monto_boleto || t.fare || 0),
    0
  );

  // 3. Obtener la suma de deudas no pagadas en cargos de cuenta corriente
  const cargosImpagos = await CuentaCorriente.findAll({
    where: {
      empresa_id: empresaId,
      tipo_movimiento: "cargo",
      pagado: false,
    },
  });

  const deudaCcImpaga = cargosImpagos.reduce(
    (sum, cargo) => sum + Number(cargo.monto || 0),
    0
  );

  // El monto acumulado representa solo las ventas de tickets en el período activo
  const montoAcumuladoVentas = ventasPeriodoActivo;
  const deudaTotal = montoAcumuladoVentas + deudaCcImpaga;
  const montoMaximo =
    empresa.monto_maximo !== null && empresa.monto_maximo !== undefined
      ? Number(empresa.monto_maximo)
      : null;
  const morosidad = Boolean(empresa.morosidad);

  const saldoDisponibleLibre =
    montoMaximo !== null ? montoMaximo - deudaTotal : null;

  // Sincronizar en la BD de empresas para mantener consistente la columna monto_acumulado
  if (Number(empresa.monto_acumulado) !== montoAcumuladoVentas) {
    await empresa.update({ monto_acumulado: montoAcumuladoVentas });
  }

  return {
    empresa_id: empresaId,
    monto_acumulado: montoAcumuladoVentas,
    deuda_cc_impaga: deudaCcImpaga,
    deuda_total: deudaTotal,
    monto_maximo: montoMaximo,
    saldo_disponible_libre: saldoDisponibleLibre,
    morosidad,
  };
};

/**
 * Verifica si la empresa dispone de cupo suficiente para realizar una compra/reserva.
 */
export const verificarDisponibilidadCupo = async (
  empresaId: number,
  montoBoleto: number
): Promise<IResultadoDisponibilidad> => {
  const resumen = await obtenerResumenSaldoEmpresa(empresaId);

  // 1. Validar Morosidad
  if (resumen.morosidad) {
    return {
      disponible: false,
      message:
        "La empresa se encuentra en estado de Morosidad. No es posible realizar reservas ni compras.",
      morosidad: true,
      detalles: {
        monto_maximo: resumen.monto_maximo,
        monto_acumulado: resumen.monto_acumulado,
        deuda_cc_impaga: resumen.deuda_cc_impaga,
        deuda_total: resumen.deuda_total,
        monto_ticket: montoBoleto,
        monto_nuevo_total: resumen.deuda_total + montoBoleto,
        disponible: resumen.saldo_disponible_libre,
      },
    };
  }

  const montoNuevoTotal = resumen.deuda_total + montoBoleto;

  // 2. Validar Límite de Monto Máximo (Cupo de Crédito)
  if (resumen.monto_maximo !== null) {
    if (montoNuevoTotal > resumen.monto_maximo) {
      const excedido = montoNuevoTotal - resumen.monto_maximo;
      return {
        disponible: false,
        message: `La empresa ha excedido su límite de crédito disponible. Límite: $${resumen.monto_maximo.toLocaleString(
          "es-CL"
        )}, Deuda Total Actual: $${resumen.deuda_total.toLocaleString(
          "es-CL"
        )} (Ventas Activas: $${resumen.monto_acumulado.toLocaleString(
          "es-CL"
        )}, Cargos CC Impagos: $${resumen.deuda_cc_impaga.toLocaleString(
          "es-CL"
        )}), Nuevo Ticket: $${montoBoleto.toLocaleString("es-CL")}`,
        detalles: {
          monto_maximo: resumen.monto_maximo,
          monto_acumulado: resumen.monto_acumulado,
          deuda_cc_impaga: resumen.deuda_cc_impaga,
          deuda_total: resumen.deuda_total,
          monto_ticket: montoBoleto,
          monto_nuevo_total: montoNuevoTotal,
          disponible: resumen.monto_maximo - resumen.deuda_total,
          excedido,
        },
      };
    }

    const disponibleRestante = resumen.monto_maximo - montoNuevoTotal;
    const porcentajeDisponible = Math.round(
      (disponibleRestante / resumen.monto_maximo) * 100
    );

    return {
      disponible: true,
      message: "Disponibilidad verificada correctamente",
      detalles: {
        monto_maximo: resumen.monto_maximo,
        monto_acumulado: resumen.monto_acumulado,
        deuda_cc_impaga: resumen.deuda_cc_impaga,
        deuda_total: resumen.deuda_total,
        monto_ticket: montoBoleto,
        monto_nuevo_total: montoNuevoTotal,
        disponible: disponibleRestante,
        porcentaje_disponible: porcentajeDisponible,
      },
    };
  }

  // 3. Si la empresa no tiene límite de crédito asignado (monto_maximo === null)
  return {
    disponible: true,
    message: "Empresa sin límite de crédito asignado",
    detalles: {
      monto_maximo: null,
      monto_acumulado: resumen.monto_acumulado,
      deuda_cc_impaga: resumen.deuda_cc_impaga,
      deuda_total: resumen.deuda_total,
      monto_ticket: montoBoleto,
      monto_nuevo_total: montoNuevoTotal,
      disponible: null,
    },
  };
};
