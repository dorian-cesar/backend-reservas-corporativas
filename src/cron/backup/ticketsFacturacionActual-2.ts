// src/cron/ticketsFacturacionActual.ts
import "../database"; // inicializa sequelize y addModels

import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Op, QueryTypes } from "sequelize";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Console } from "console";

/** Ajusta día si el mes no tiene ese número (ej. 31 en febrero) */
function clampDay(year: number, monthZeroBased: number, day: number) {
  const lastDay = new Date(year, monthZeroBased + 1, 0).getDate();
  return Math.min(day, lastDay);
}

/** Formatea fecha en YYYY-MM-DD HH:mm:ss en hora LOCAL (para usar en SQL) */
function formatLocalSQLDate(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    " " +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

export const ticketsFacturacionActual = async () => {
  console.log(
    `[${new Date().toISOString()}] === INICIO ticketsFacturacionActual ===`
  );

  const hoy = new Date();
  const empresas = await Empresa.findAll();
  console.log(`Empresas encontradas: ${empresas.length}`);

  const resultados: any[] = [];

  // instancia de sequelize (ya inicializada por ../database)
  const sequelize = (Ticket as any).sequelize;
  if (!sequelize)
    throw new Error("Sequelize no está inicializado en Ticket.sequelize");

  for (const empresa of empresas) {
    const empresaId = empresa.id ?? empresa.get?.("id");
    const nombre = empresa.nombre ?? empresa.get?.("nombre") ?? `#${empresaId}`;
    const diaFacturacion = Number(
      empresa.dia_facturacion ?? empresa.get?.("dia_facturacion") ?? 1
    );

    console.log(
      `\n--- Empresa ${nombre} (ID ${empresaId}) - día facturación: ${diaFacturacion} ---`
    );

    // finDia = dia_facturacion; inicioDia = dia_facturacion + 1
    const finDia = diaFacturacion - 1;
    const inicioDia = diaFacturacion;

    // determinar mes de inicio
    let inicioYear = hoy.getFullYear();
    let inicioMonth = hoy.getMonth(); // 0-based
    if (hoy.getDate() <= finDia) {
      inicioMonth -= 1;
      if (inicioMonth < 0) {
        inicioMonth = 11;
        inicioYear -= 1;
      }
    }

    const inicioDay = clampDay(inicioYear, inicioMonth, inicioDia);
    const inicioPeriodo = new Date(
      inicioYear,
      inicioMonth,
      inicioDay,
      0,
      0,
      0,
      0
    );

    // finPeriodo = finDia del mes siguiente (hasta 23:59:59)
    let finYear = inicioPeriodo.getFullYear();
    let finMonth = inicioPeriodo.getMonth() + 1;
    if (finMonth > 11) {
      finMonth = 0;
      finYear += 1;
    }
    const finDay = clampDay(finYear, finMonth, finDia);
    const finPeriodoStart = new Date(finYear, finMonth, finDay, 0, 0, 0, 0);
    const finPeriodo = new Date(finPeriodoStart);
    finPeriodo.setHours(23, 59, 59, 999);

    console.log(
      `Periodo facturación (local): ${inicioPeriodo.toString()} → ${finPeriodo.toString()}`
    );
    console.log(
      `Periodo facturación (ISO):   ${inicioPeriodo.toISOString()} → ${finPeriodo.toISOString()}`
    );

    // Si no hay usuarios, saltar
    const users = await User.findAll({ where: { empresa_id: empresaId } });
    const userIds = users.map((u) => u.id ?? u.get?.("id")).filter(Boolean);
    if (userIds.length === 0) {
      console.log("Empresa sin usuarios. Saltando.");
      continue;
    }

    // Formatear fechas en local para la query raw (igual a tu SQL de ejemplo)
    const inicioStr = formatLocalSQLDate(inicioPeriodo);
    const finStr = formatLocalSQLDate(finPeriodo);

    // Query raw que replica exactamente tu SQL (CASE WHEN aggregates)
    const sql = `
      SELECT
        :empresaId AS empresa_id,
        SUM(CASE WHEN T.ticketStatus = 'Anulado' THEN 1 ELSE 0 END) AS total_anulados,
        SUM(CASE WHEN T.ticketStatus = 'Confirmed' THEN 1 ELSE 0 END) AS total_confirmados,
        SUM(CASE WHEN T.ticketStatus = 'Anulado' THEN T.monto_devolucion ELSE 0 END) AS suma_devolucion_anulados,
        COUNT(T.monto_boleto) AS total_boletos_contados,
        SUM(T.monto_boleto) AS suma_montos
      FROM tickets T
      JOIN users U ON T.id_User = U.id
      WHERE U.empresa_id = :empresaId
        AND T.confirmedAt BETWEEN :inicio AND :fin;
    `;

    const replacements = {
      empresaId,
      inicio: inicioStr,
      fin: finStr,
    };

    const rows: any[] = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });

    const row = rows && rows[0] ? rows[0] : null;

    // Si la consulta devuelve null (no filas), normalizamos a ceros
    const totalAnulados = Number(row?.total_anulados ?? 0);
    const totalConfirmados = Number(row?.total_confirmados ?? 0);
    const sumaDevolucionAnulados = Number(row?.suma_devolucion_anulados ?? 0);
    const totalBoletosContados = Number(row?.total_boletos_contados ?? 0);
    const sumaMontos = Number(row?.suma_montos ?? 0);

    resultados.push({
      empresa_id: empresaId,
      empresa_nombre: nombre,
      periodo_inicio: inicioPeriodo.toISOString(),
      periodo_fin: finPeriodo.toISOString(),
      cantidad_tickets_confirmados: totalConfirmados,
      cantidad_tickets_anulados: totalAnulados,
      cantidad_tickets_total: totalBoletosContados,
      suma_montos: sumaMontos,
      suma_devoluciones: sumaDevolucionAnulados,
    });
    await EstadoCuenta.upsert({
      empresa_id: empresaId,
      periodo: inicioDay.toString(),
      fecha_generacion: new Date(),

      fecha_fin: finStr,
      fecha_inicio: inicioStr,
      total_tickets: totalBoletosContados,
      total_tickets_anulados: totalAnulados,
      monto_facturado: sumaMontos,
      detalle_por_cc: JSON.stringify({}),
      pagado: false,
      suma_devoluciones: sumaDevolucionAnulados,
    });
    console.log(replacements);
    console.log(
      `SQL agregados -> Confirmados: ${totalConfirmados}, Anulados: ${totalAnulados}, SumaMontos: ${sumaMontos}, SumaDevoluciones: ${sumaDevolucionAnulados}`
    );
  }

  console.log(
    `\n=== RESULTADO FINAL JSON ===\n${JSON.stringify(resultados, null, 2)}\n`
  );
  console.log(
    `[${new Date().toISOString()}] === FIN ticketsFacturacionActual ===`
  );
};

ticketsFacturacionActual();
