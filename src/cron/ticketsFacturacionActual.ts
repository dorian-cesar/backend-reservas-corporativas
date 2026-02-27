// src/cron/ticketsFacturacionActual.ts
import "../database";
import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Pasajero } from "../models/pasajero.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Op } from "sequelize";
import { CentroCosto } from "../models/centro_costo.model";

/** Limita día al último del mes si no existe (ej 31 en febrero) */
function clampDay(year: number, monthZeroBased: number, day: number) {
  const last = new Date(year, monthZeroBased + 1, 0).getDate();
  return Math.min(day, last);
}

/** Convierte Date a string en formato YYYY-MM-DD HH:mm:ss para campos que esperan string */
function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export const ticketsFacturacionActual = async () => {
  console.log(`[${new Date().toISOString()}] === INICIO FACTURACIÓN ===`);

  const hoy = new Date();
  const diaHoy = hoy.getDate();

  const empresas = await Empresa.findAll({
    where: {
      estado: true,
      fact_manual: false
    },

  });

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

    /** 2️⃣ Definir período correcto usando objetos Date (como en la API) */

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

    // Convertir a strings SOLO para los campos que lo requieren
    const inicioPeriodoStr = formatDateForDB(inicioPeriodo);
    const finPeriodoStr = formatDateForDB(finPeriodo);

    console.log(`Periodo: ${inicioPeriodoStr} → ${finPeriodoStr}`);

    /** 3️⃣ Verificar duplicados */
    const existe = await EstadoCuenta.findOne({
      where: {
        empresa_id: empresaId,
        fecha_inicio: inicioPeriodoStr,
        fecha_fin: finPeriodoStr
      },
    });

    if (existe) {
      console.warn(`Estado ya generado para ${nombre}, se omite.`);
      continue;
    }

    /** 4️⃣ Obtener tickets del período usando Sequelize (como en la API) */
    const whereCondition: any = {
      confirmedAt: {
        [Op.between]: [inicioPeriodo, finPeriodo] // Aquí usamos los objetos Date para la consulta
      }
    };

    // Si la empresa tiene ID, filtrar por ella
    whereCondition.id_empresa = empresaId;

    // Obtener todos los tickets del período
    const tickets = await Ticket.findAll({
      where: whereCondition,
      include: [
        {
          model: User,
          attributes: ['id', 'nombre', 'rut', 'email'],
          required: false
        },
        {
          model: Empresa,
          attributes: ['id', 'nombre', 'rut', 'cuenta_corriente'],
          required: true
        },
        {
          model: Pasajero,
          required: false,
          attributes: ['id', 'nombre', 'rut', 'correo', 'telefono', 'id_centro_costo'],
          include: [{ model: CentroCosto, required: false }]
        }
      ]
    });

    // Calcular totales
    const total_confirmados = tickets.filter(t => t.ticketStatus === 'Confirmed').length;
    const total_anulados = tickets.filter(t => t.ticketStatus === 'Anulado').length;

    // Sumar montos (convertir a número para evitar problemas)
    const monto_bruto = tickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
    const devoluciones = tickets.reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
    const monto_facturado = monto_bruto - devoluciones;

    console.log(`Resultados para ${nombre}:`);
    console.log(`- Tickets confirmados: ${total_confirmados}`);
    console.log(`- Tickets anulados: ${total_anulados}`);
    console.log(`- Monto bruto: $${monto_bruto}`);
    console.log(`- Devoluciones: $${devoluciones}`);
    console.log(`- Monto facturado: $${monto_facturado}`);

    /** 5️⃣ Crear estado de cuenta */
    const estadoCuenta = await EstadoCuenta.create({
      empresa_id: empresaId,
      periodo: diaFacturacion.toString(),
      fecha_inicio: inicioPeriodoStr, // string - el modelo espera string
      fecha_fin: finPeriodoStr, // string - el modelo espera string
      fecha_generacion: new Date(), // Date - el modelo espera Date
      total_tickets: tickets.length,
      total_tickets_anulados: total_anulados,
      monto_facturado: monto_facturado,
      suma_devoluciones: devoluciones,
      detalle_por_cc: JSON.stringify({}),
      pagado: false,
    });

    /** 6️⃣ Crear cargo en cuenta corriente */
    if (estadoCuenta && estadoCuenta.id) {
      const ultimoMovimiento = await CuentaCorriente.findOne({
        where: { empresa_id: empresaId },
        order: [["fecha_movimiento", "DESC"]],
      });

      let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;
      saldoActual = saldoActual - monto_facturado;

      await CuentaCorriente.create({
        empresa_id: empresaId,
        tipo_movimiento: "cargo",
        monto: monto_facturado,
        descripcion: `Cargo por estado de cuenta #${estadoCuenta.id} periodo ${estadoCuenta.periodo}`,
        saldo: saldoActual,
        referencia: `CARGO-EDC-${estadoCuenta.id}`,
        pagado: false,
        fecha_movimiento: new Date() // Date - el modelo espera Date
      });

      console.log(`✅ Estado creado para ${nombre} (ID: ${estadoCuenta.id})`);
      console.log(`✅ Cargo en cuenta corriente creado por $${monto_facturado}`);
    } else {
      console.error(`❌ Error al crear estado de cuenta para ${nombre}`);
    }
  }

  console.log(`[${new Date().toISOString()}] === FIN FACTURACIÓN ===`);
};

ticketsFacturacionActual().catch((err) => {
  console.error("🔥 ERROR FACTURACIÓN:", err);
});