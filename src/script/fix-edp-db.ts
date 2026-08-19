import { Sequelize, QueryTypes } from "sequelize";
import moment from "moment-timezone";
import * as dotenv from "dotenv";
dotenv.config();

const TIMEZONE = "America/Santiago";

// Connect using .env credentials
const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME || "multiempresa_db";

const sequelize = new Sequelize({
  dialect: "mysql",
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  logging: false,
});

const isCommit = process.argv.includes("--commit");

async function fixEDP() {
  console.log(`=== RUNNING EDP CORRECTION (${isCommit ? "COMMIT MODE" : "DRY RUN MODE"}) ===`);
  console.log(`🔗 Target Host: ${DB_HOST}`);
  console.log(`📦 Target DB: ${DB_NAME}`);
  
  await sequelize.authenticate();
  console.log("✅ Conexión establecida exitosamente.");

  // Get EDP 7648
  const [edp]: any[] = await sequelize.query(`
    SELECT * FROM estados_cuenta WHERE id = 7648
  `, { type: QueryTypes.SELECT });

  if (!edp) {
    console.error("❌ No se encontró el EDP 7648");
    return;
  }
  console.log(`\n📋 EDP 7648 original encontrado:`);
  console.log(`   Periodo: ${edp.periodo} | Fechas: ${edp.fecha_inicio} a ${edp.fecha_fin}`);
  console.log(`   Monto Facturado actual: $${edp.monto_facturado}`);
  console.log(`   Suma Devoluciones actual: $${edp.suma_devoluciones}`);

  // Fetch all tickets of company 55 within the period
  const queryTickets = `
    SELECT 
      t.*,
      u.nombre as user_nombre, u.rut as user_rut, u.email as user_email,
      p.nombre as pasajero_nombre, p.rut as pasajero_rut, p.correo as pasajero_correo,
      cc.id as cc_id, cc.nombre as cc_nombre,
      emp.nombre as emp_nombre, emp.rut as emp_rut, emp.cuenta_corriente as emp_cuenta_corriente
    FROM tickets t
    LEFT JOIN users u ON t.id_User = u.id
    LEFT JOIN pasajeros p ON t.id_pasajero = p.id
    LEFT JOIN centros_costo cc ON p.id_centro_costo = cc.id
    LEFT JOIN empresas emp ON t.id_empresa = emp.id
    WHERE t.id_empresa = 55
      AND t.confirmedAt BETWEEN '${edp.fecha_inicio}' AND '${edp.fecha_fin}'
      AND t.ticketStatus IN ('Confirmed', 'Anulado')
  `;

  const tickets: any[] = await sequelize.query(queryTickets, { type: QueryTypes.SELECT });
  console.log(`\n📊 Total de tickets encontrados del periodo: ${tickets.length}`);

  // The cutoff date is the end of the reservation period in Chile time: 2026-07-20 23:59:59
  // (which is 2026-07-21 03:59:59 UTC)
  const cutoffChile = moment.tz(`${edp.fecha_fin}`, TIMEZONE);
  console.log(`🕒 Fecha de corte (Chile): ${cutoffChile.format("YYYY-MM-DD HH:mm:ss")}`);

  // We will reconstruct the snapshot payload and group by CC
  const snapshotsToInsert: any[] = [];
  const detallePorCC: Record<string, {
    nombre: string;
    total_tickets: number;
    total_anulados: number;
    monto_facturado: number;
  }> = {
    "Sin asignar": {
      nombre: "Sin asignar",
      total_tickets: 0,
      total_anulados: 0,
      monto_facturado: 0
    }
  };

  let countConfirmedHistorical = 0;
  let countAnnulledHistorical = 0;
  let sumBoletoConfirmedHistorical = 0;
  let sumDevolucionAnnulledHistorical = 0;

  for (const t of tickets) {
    // Determine the status of the ticket at cutoff
    let statusAtCutoff = t.ticketStatus;
    let devAtCutoff = Number(t.monto_devolucion || 0);

    if (t.ticketStatus === "Anulado" && t.updated_at) {
      const updatedAtChile = moment(t.updated_at).tz(TIMEZONE);
      if (updatedAtChile.isAfter(cutoffChile)) {
        // Annulled after the period closed. So at cutoff it was Confirmed!
        statusAtCutoff = "Confirmed";
        devAtCutoff = 0;
      }
    }

    // Accumulate metrics
    const price = Number(t.monto_boleto || 0);
    if (statusAtCutoff === "Confirmed") {
      countConfirmedHistorical++;
      sumBoletoConfirmedHistorical += price;
    } else {
      countAnnulledHistorical++;
      sumDevolucionAnnulledHistorical += devAtCutoff;
    }

    // CC grouping
    const ccName = t.cc_nombre || "Sin asignar";
    if (!detallePorCC[ccName]) {
      detallePorCC[ccName] = {
        nombre: ccName,
        total_tickets: 0,
        total_anulados: 0,
        monto_facturado: 0
      };
    }

    detallePorCC[ccName].total_tickets += 1;
    if (statusAtCutoff === "Anulado") {
      detallePorCC[ccName].total_anulados += 1;
    } else {
      detallePorCC[ccName].monto_facturado += price;
    }

    // Build the ticket JSON structure for the snapshot
    const ticketJson = {
      id: t.id,
      ticketNumber: t.ticketNumber,
      pnrNumber: t.pnrNumber,
      ticketStatus: statusAtCutoff,
      origin: t.origin,
      destination: t.destination,
      terminal_origen: t.terminal_origen,
      terminal_destino: t.terminal_destino,
      travelDate: t.travelDate ? moment(t.travelDate).format("YYYY-MM-DD") : null,
      departureTime: t.departureTime,
      seatNumbers: t.seatNumbers,
      fare: t.fare,
      monto_boleto: t.monto_boleto,
      monto_devolucion: devAtCutoff,
      confirmedAt: t.confirmedAt ? moment(t.confirmedAt).format("YYYY-MM-DD HH:mm:ss") : null,
      created_at: t.created_at ? moment(t.created_at).format("YYYY-MM-DD HH:mm:ss") : null,
      updated_at: statusAtCutoff === "Confirmed" ? t.confirmedAt : t.updated_at,
      user: t.id_User ? {
        id: t.id_User,
        nombre: t.user_nombre,
        rut: t.user_rut,
        email: t.user_email
      } : null,
      pasajero: t.id_pasajero ? {
        id: t.id_pasajero,
        nombre: t.pasajero_nombre,
        rut: t.pasajero_rut,
        correo: t.pasajero_correo,
        id_centro_costo: t.cc_id,
        centroCosto: t.cc_id ? {
          id: t.cc_id,
          nombre: t.cc_nombre
        } : null,
        centro_costo: t.cc_id ? {
          id: t.cc_id,
          nombre: t.cc_nombre
        } : null,
        CentroCosto: t.cc_id ? {
          id: t.cc_id,
          nombre: t.cc_nombre
        } : null
      } : null,
      empresa: t.id_empresa ? {
        id: t.id_empresa,
        nombre: t.emp_nombre,
        rut: t.emp_rut,
        cuenta_corriente: t.emp_cuenta_corriente
      } : null
    };

    snapshotsToInsert.push({
      edp_id: 7648,
      ticket_data: JSON.stringify(ticketJson),
    });
  }

  // Calculate the discount
  const percentageDiscount = 5.00;
  const discountAmount = Math.round(sumBoletoConfirmedHistorical * (percentageDiscount / 100));
  const montoFacturadoFinal = sumBoletoConfirmedHistorical - discountAmount;

  console.log("\n📈 Reconstructed Figures:");
  console.log(`   Confirmados Históricos: ${countConfirmedHistorical} tickets (esperados: 833)`);
  console.log(`   Anulados Históricos: ${countAnnulledHistorical} tickets (esperados: 146)`);
  console.log(`   Suma Bruto Confirmados: $${sumBoletoConfirmedHistorical} (esperados: $18.525.195)`);
  console.log(`   Descuento 5%: $${discountAmount} (esperados: $926.260)`);
  console.log(`   Monto Facturado Final (Neto): $${montoFacturadoFinal} (esperados: $17.598.935)`);
  console.log(`   Suma Devoluciones (dentro periodo): $${sumDevolucionAnnulledHistorical} (esperados: $2.995.720)`);

  const t = await sequelize.transaction();
  try {
    if (isCommit) {
      // 1. Delete old snapshots
      await sequelize.query(`
        DELETE FROM edp_ticket_snapshots WHERE edp_id = 7648
      `, { transaction: t });
      console.log("\n🗑️ Antiguos snapshots eliminados.");

      // 2. Insert new snapshots
      for (const snap of snapshotsToInsert) {
        await sequelize.query(`
          INSERT INTO edp_ticket_snapshots (edp_id, ticket_data)
          VALUES (:edp_id, :ticket_data)
        `, {
          replacements: snap,
          type: QueryTypes.INSERT,
          transaction: t
        });
      }
      console.log(`✅ ${snapshotsToInsert.length} snapshots insertados exitosamente.`);

      // 3. Update estados_cuenta record
      await sequelize.query(`
        UPDATE estados_cuenta
        SET 
          monto_facturado = :monto_facturado,
          porcentaje_descuento = :porcentaje_descuento,
          total_tickets_anulados = :total_tickets_anulados,
          suma_devoluciones = :suma_devoluciones,
          detalle_por_cc = :detalle_por_cc
        WHERE id = 7648
      `, {
        replacements: {
          monto_facturado: montoFacturadoFinal,
          porcentaje_descuento: percentageDiscount,
          total_tickets_anulados: countAnnulledHistorical,
          suma_devoluciones: sumDevolucionAnnulledHistorical,
          detalle_por_cc: JSON.stringify(detallePorCC)
        },
        type: QueryTypes.UPDATE,
        transaction: t
      });
      console.log(`✅ Registro del EDP 7648 actualizado.`);

      // 4. Sincronizar cuenta corriente
      const [ccCargo]: any[] = await sequelize.query(`
        SELECT * FROM cuenta_corriente 
        WHERE empresa_id = 55 AND referencia LIKE 'FACT-55-2026-06%'
      `, { type: QueryTypes.SELECT, transaction: t });

      if (ccCargo) {
        console.log(`\n💳 Cargo de cuenta corriente encontrado: ID: ${ccCargo.id}, Referencia: ${ccCargo.referencia}, Monto anterior: $${ccCargo.monto}`);
        
        // Update the cargo's amount
        await sequelize.query(`
          UPDATE cuenta_corriente SET monto = :monto WHERE id = :id
        `, {
          replacements: { monto: montoFacturadoFinal, id: ccCargo.id },
          type: QueryTypes.UPDATE,
          transaction: t
        });
        console.log(`✅ Cargo en cuenta corriente actualizado a $${montoFacturadoFinal}`);

        // Recalculate balances
        const allMovements: any[] = await sequelize.query(`
          SELECT * FROM cuenta_corriente 
          WHERE empresa_id = 55 
          ORDER BY id ASC
        `, { type: QueryTypes.SELECT, transaction: t });

        console.log(`🔄 Recalculando saldos para ${allMovements.length} movimientos de cuenta corriente...`);
        let currentSaldo = 0;
        for (const mov of allMovements) {
          const montoNum = Number(mov.monto);
          if (mov.tipo_movimiento === "cargo") {
            currentSaldo -= montoNum;
          } else {
            currentSaldo += montoNum;
          }

          await sequelize.query(`
            UPDATE cuenta_corriente SET saldo = :saldo WHERE id = :id
          `, {
            replacements: { saldo: currentSaldo, id: mov.id },
            type: QueryTypes.UPDATE,
            transaction: t
          });
        }
        console.log("✅ Saldos recalculados correctamente.");
      } else {
        console.warn("⚠️ No se encontró el cargo en cuenta corriente (FACT-55-2026-06).");
      }

      await t.commit();
      console.log("\n🎉 CAMBIOS CONFIRMADOS Y APLICADOS EN LA BASE DE DATOS.");
    } else {
      console.log("\n🔍 Muestra del desglose por CC recalculado:");
      console.log(JSON.stringify(detallePorCC, null, 2));

      await t.rollback();
      console.log("\n⚠️ SIMULACIÓN COMPLETADA. Ningún cambio fue realizado en la base de datos.");
    }
  } catch (err) {
    await t.rollback();
    console.error("❌ Error en la transacción:", err);
  } finally {
    await sequelize.close();
  }
}

fixEDP().catch(console.error);
