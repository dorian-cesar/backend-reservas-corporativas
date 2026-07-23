// src/cron/ticketsFacturacionActual.ts

// Inicializa DB (ajusta path si tu archivo de conexión está en otro lugar)
import "../database"; // Asegúrate de importar tu inicialización de Sequelize/DB

import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Op } from "sequelize";

function clampDay(year: number, monthZeroBased: number, day: number) {
  // devuelve el día existene en ese mes (1..31) o el último día del mes si day es mayor
  const lastDay = new Date(year, monthZeroBased + 1, 0).getDate();
  return Math.min(day, lastDay);
}

export const ticketsFacturacionActual = async () => {
  console.log(
    `[${new Date().toISOString()}] === INICIO ticketsFacturacionActual ===`
  );

  const hoy = new Date();
  console.log(`Now local: ${hoy.toString()}, ISO: ${hoy.toISOString()}`);

  const empresas = await Empresa.findAll();
  console.log(`Empresas encontradas: ${empresas.length}`);

  for (const empresa of empresas) {
    const empresaId = empresa.id ?? empresa.get?.("id");
    const nombre = empresa.nombre ?? empresa.get?.("nombre") ?? `#${empresaId}`;
    const diaFacturacion = Number(
      empresa.dia_facturacion ?? empresa.get?.("dia_facturacion") ?? 1
    );

    console.log(
      `\n--- Empresa ${nombre} (ID ${empresaId}) - día facturación: ${diaFacturacion} ---`
    );

    // Decidir mes y año del inicio del periodo
    // Si hoy.getDate() > diaFacturacion => inicio = diaFactacion del mes actual
    // Si hoy.getDate() <= diaFacturacion => inicio = diaFacturacion del mes anterior
    //let inicioYear = hoy.getFullYear();
    //let inicioMonth = hoy.getMonth(); // 0-based

    // Día de corte guardado en DB
    const finDia = diaFacturacion;
    const inicioDia = diaFacturacion + 1;

    // Determinar si inicio es mes actual o anterior
    let inicioYear = hoy.getFullYear();
    let inicioMonth = hoy.getMonth(); // 0-based

    if (hoy.getDate() <= finDia) {
      inicioMonth -= 1;
      if (inicioMonth < 0) {
        inicioMonth = 11;
        inicioYear -= 1;
      }
    }

    // Asegurar que el día exista en ese mes
    const inicioDay = clampDay(inicioYear, inicioMonth, inicioDia);

    // Construir fecha inicio
    const inicioPeriodo = new Date(
      inicioYear,
      inicioMonth,
      inicioDay,
      0,
      0,
      0,
      0
    );

    // Calcular fecha fin = finDia del mes siguiente al inicioPeriodo
    let finYear = inicioPeriodo.getFullYear();
    let finMonth = inicioPeriodo.getMonth() + 1;
    if (finMonth > 11) {
      finMonth = 0;
      finYear += 1;
    }

    const finDay = clampDay(finYear, finMonth, finDia);
    const finPeriodo = new Date(finYear, finMonth, finDay, 0, 0, 0, 0);

    console.log(
      `Periodo calculado (local): ${inicioPeriodo.toString()} → ${finPeriodo.toString()}`
    );
    console.log(
      `Periodo calculado (ISO):   ${inicioPeriodo.toISOString()} → ${finPeriodo.toISOString()}`
    );

    // Obtener usuarios de la empresa
    const users = await User.findAll({ where: { empresa_id: empresaId } });
    const userIds = users.map((u) => u.id ?? u.get?.("id")).filter(Boolean);

    if (userIds.length === 0) {
      console.log("Empresa sin usuarios. Saltando.");
      continue;
    }

    // Buscar tickets con confirmedAt dentro del periodo
    const tickets = await Ticket.findAll({
      where: {
        id_User: { [Op.in]: userIds },
        ticketStatus: "Confirmed",
        confirmedAt: {
          [Op.gte]: inicioPeriodo,
          [Op.lt]: finPeriodo,
        },
      },
      order: [["confirmedAt", "ASC"]],
    });

    console.log(`Tickets Confirmed encontrados: ${tickets.length}`);

    // Si quieres ver la estructura completa para debug:
    // if (tickets.length > 0) console.log(JSON.stringify(tickets, null, 2));

    for (const t of tickets) {
      const ticketNumber =
        (t as any).ticketNumber ?? t.get?.("ticketNumber") ?? "N/A";
      const confirmedAt =
        (t as any).confirmedAt ?? t.get?.("confirmedAt") ?? "N/A";
      const origin = (t as any).origin ?? t.get?.("origin") ?? "";
      const destination =
        (t as any).destination ?? t.get?.("destination") ?? "";
      const monto = (t as any).monto_boleto ?? t.get?.("monto_boleto") ?? 0;

      console.log(
        ` - ${ticketNumber} | confirmedAt: ${confirmedAt} | ${origin} → ${destination} | monto: ${monto}`
      );
    }
  }

  console.log(
    `[${new Date().toISOString()}] === FIN ticketsFacturacionActual ===`
  );
};

// Ejecutar inmediatamente (útil para npx ts-node)
ticketsFacturacionActual();
