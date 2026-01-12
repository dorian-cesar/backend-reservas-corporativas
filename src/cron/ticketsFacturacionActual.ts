// src/cron/ticketsFacturacionActual.ts
import "../database";
import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model"; // <-- Añadir esta importación
import { QueryTypes } from "sequelize";

/** Limita día al último del mes si no existe (ej 31 en febrero) */
function clampDay(year: number, monthZeroBased: number, day: number) {
  const last = new Date(year, monthZeroBased + 1, 0).getDate();
  return Math.min(day, last);
}

/** Convierte a SQL local YYYY-MM-DD HH:mm:ss */
function formatSQL(d: Date) {
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const ticketsFacturacionActual = async () => {
  console.log(`[${new Date().toISOString()}] === INICIO FACTURACIÓN ===`);

  const hoy = new Date();
  const diaHoy = hoy.getDate();

  const empresas = await Empresa.findAll({
    where: { estado: true },
  });

  const sequelize = (Ticket as any).sequelize;
  if (!sequelize) throw new Error("Sequelize no inicializado.");

  for (const empresa of empresas) {
    const empresaId = Number(empresa.id ?? empresa.get?.("id"));
    if (!empresaId) {
      console.error("Empresa sin ID válido, se omite");
      continue;
    }

    const nombre = empresa.nombre ?? empresa.get?.("nombre") ?? `#${empresaId}`;
    const diaFacturacion = Number(
      empresa.dia_facturacion ?? empresa.get?.("dia_facturacion")
    );

    console.log(
      `\n--- Empresa ${nombre} (ID ${empresaId}) - día facturación: ${diaFacturacion} ---`
    );

    /** 1️⃣ Validar día */
    if (!diaFacturacion || diaFacturacion !== diaHoy) {
      console.log(
        `Empresa ${nombre}: hoy ${diaHoy}, factura día ${diaFacturacion ?? "N/A"
        }, se omite.`
      );
      continue;
    }

    console.log(`Facturando empresa ${nombre}`);

    /** 2️⃣ Definir período correcto */

    // 👉 Fin: ayer a las 23:59:59
    const finPeriodo = new Date(hoy);
    finPeriodo.setDate(hoy.getDate() - 1);
    finPeriodo.setHours(23, 59, 59, 999);

    // 👉 Inicio: día facturación del mes anterior
    let inicioYear = finPeriodo.getFullYear();
    let inicioMonth = finPeriodo.getMonth();

    // Restamos un mes
    inicioMonth--;
    if (inicioMonth < 0) {
      inicioMonth = 11;
      inicioYear--;
    }

    const inicioPeriodo = new Date(
      inicioYear,
      inicioMonth,
      clampDay(inicioYear, inicioMonth, diaFacturacion),
      0,
      0,
      0
    );

    const inicioStr = formatSQL(inicioPeriodo);
    const finStr = formatSQL(finPeriodo);

    console.log(`Periodo: ${inicioStr} → ${finStr}`);

    /** 3️⃣ Verificar duplicados */
    const existe = await EstadoCuenta.findOne({
      where: {
        empresa_id: empresaId,
        fecha_inicio: inicioStr,
        fecha_fin: finStr,
      },
    });

    if (existe) {
      console.warn(`Estado ya generado para ${nombre}, se omite.`);
      continue;
    }

    /** 5️⃣ SQL Agregado */
    const sql = `
      SELECT
        SUM(CASE WHEN T.ticketStatus='Anulado' THEN 1 ELSE 0 END) AS anulados,
        SUM(CASE WHEN T.ticketStatus='Confirmed' THEN 1 ELSE 0 END) AS confirmados,
        SUM(CASE WHEN T.ticketStatus='Anulado' THEN T.monto_devolucion ELSE 0 END) AS devoluciones,
        COUNT(T.monto_boleto) AS total,
        SUM(T.monto_boleto) AS monto
      FROM tickets T
      
      JOIN pasajeros P ON T.id_pasajero = P.id
      WHERE P.id_empresa = :empresaId

        AND T.confirmedAt BETWEEN :inicio AND :fin
    `;

    const result: any = await sequelize.query(sql, {
      type: QueryTypes.SELECT,
      replacements: { empresaId, inicio: inicioStr, fin: finStr },
    });

    const data = result[0] || {};

    const totalTickets =
      Number(data.confirmados || 0) + Number(data.anulados || 0);

    if (totalTickets === 0) {
      console.log(
        `Empresa ${nombre}: sin tickets en el período, no se genera estado.`
      );
      continue;
    }

    /** 6️⃣ Guardar estado de cuenta */
    const estadoCuenta = await EstadoCuenta.create({
      empresa_id: empresaId,
      periodo: diaFacturacion.toString(),
      fecha_inicio: inicioStr,
      fecha_fin: finStr,
      fecha_generacion: new Date(),
      total_tickets: Number(data.total || 0),
      total_tickets_anulados: Number(data.anulados || 0),
      monto_facturado: Number(data.monto || 0),
      suma_devoluciones: Number(data.devoluciones || 0),
      detalle_por_cc: JSON.stringify({}),
      pagado: false,
    });

    /** 7️⃣ Crear cargo en cuenta corriente */
    if (estadoCuenta && estadoCuenta.id) {
      const ultimoMovimiento = await CuentaCorriente.findOne({
        where: { empresa_id: empresaId },
        order: [["fecha_movimiento", "DESC"]],
      });

      let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

      // Calcular nuevo saldo (cargo disminuye el saldo)
      saldoActual = saldoActual - Number(data.monto || 0);

      await CuentaCorriente.create({
        empresa_id: empresaId,
        tipo_movimiento: "cargo",
        monto: Number(data.monto || 0),
        descripcion: `Cargo por estado de cuenta #${estadoCuenta.id} periodo ${estadoCuenta.periodo}`,
        saldo: saldoActual,
        referencia: `CARGO-EDC-${estadoCuenta.id}`,
        pagado: false,
        fecha_movimiento: new Date()
      });

      console.log(`✅ Estado creado para ${nombre} (ID: ${estadoCuenta.id})`);
      console.log(`✅ Cargo en cuenta corriente creado por $${Number(data.monto || 0)}`);
    } else {
      console.error(`❌ Error al crear estado de cuenta para ${nombre}`);
    }
  }

  console.log(`[${new Date().toISOString()}] === FIN FACTURACIÓN ===`);
};

ticketsFacturacionActual().catch((err) => {
  console.error("🔥 ERROR FACTURACIÓN:", err);
});