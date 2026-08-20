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

// List of inconsistent EDP IDs (excluding $0 value EDPs to avoid unnecessary processing)
const TARGET_EDP_IDS = [
  7693, 7625, 7648, 7628, 7685, 7692, 7697, 7630, 7626, 7667,
  7629, 7700, 7702, 7637, 7639, 7662, 7658, 7668, 7627, 7650,
  7649, 7695, 7671, 7682, 7684, 7665, 7653, 7680, 7675, 7664,
  7689, 7669, 7687, 7696, 7698, 7656, 7659, 7663, 7674, 7686,
  7660, 7640, 7683, 7677, 7651, 7678, 7652, 7657, 7655, 7679,
  7647, 7644, 7634, 7673, 7688, 7638, 7642, 7670, 7641, 7666,
  7690, 7694, 7676
];

async function fixAllEDPs() {
  console.log(`=== RUNNING MULTI-EDP CORRECTION (${isCommit ? "COMMIT MODE" : "DRY RUN MODE"}) ===`);
  console.log(`🔗 Target Host: ${DB_HOST}`);
  console.log(`📦 Target DB: ${DB_NAME}`);
  
  await sequelize.authenticate();
  console.log("✅ Conexión establecida exitosamente.");

  for (const edpId of TARGET_EDP_IDS) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`🔷 Procesando EDP ID: ${edpId}...`);

    const t = await sequelize.transaction();

    try {
      // 1. Get EDP details
      const [edp]: any[] = await sequelize.query(`
        SELECT * FROM estados_cuenta WHERE id = :edpId
      `, { 
        replacements: { edpId },
        type: QueryTypes.SELECT,
        transaction: t
      });

      if (!edp) {
        console.warn(`⚠️ No se encontró el EDP ${edpId}. Saltando...`);
        await t.rollback();
        continue;
      }

      const idEmpresa = edp.id_empresa;
      console.log(`   Empresa: ${idEmpresa} | Periodo: ${edp.periodo}`);
      console.log(`   Monto Facturado actual en BD: $${edp.monto_facturado}`);
      console.log(`   Suma Devoluciones actual en BD: $${edp.suma_devoluciones}`);

      // 2. Fetch all tickets of the company within the period
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
        WHERE t.id_empresa = :idEmpresa
          AND t.confirmedAt BETWEEN :fechaInicio AND :fechaFin
          AND t.ticketStatus IN ('Confirmed', 'Anulado')
      `;

      const tickets: any[] = await sequelize.query(queryTickets, {
        replacements: {
          idEmpresa,
          fechaInicio: edp.fecha_inicio,
          fechaFin: edp.fecha_fin
        },
        type: QueryTypes.SELECT,
        transaction: t
      });

      console.log(`   Total de tickets encontrados en el periodo: ${tickets.length}`);

      if (tickets.length === 0) {
        console.warn(`   ⚠️ No se encontraron tickets para el periodo. Saltando...`);
        await t.rollback();
        continue;
      }

      // Cutoff Chile time timezone check
      const cutoffChile = moment.tz(`${edp.fecha_fin}`, TIMEZONE);

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

      for (const ticket of tickets) {
        // Determine the status of the ticket at cutoff
        let statusAtCutoff = ticket.ticketStatus;
        let devAtCutoff = Number(ticket.monto_devolucion || 0);

        if (ticket.ticketStatus === "Anulado" && ticket.updated_at) {
          const updatedAtChile = moment(ticket.updated_at).tz(TIMEZONE);
          if (updatedAtChile.isAfter(cutoffChile)) {
            // Annulled after the period closed. So at cutoff it was Confirmed!
            statusAtCutoff = "Confirmed";
            devAtCutoff = 0;
          }
        }

        // Accumulate metrics
        const price = Number(ticket.monto_boleto || 0);
        if (statusAtCutoff === "Confirmed") {
          countConfirmedHistorical++;
          sumBoletoConfirmedHistorical += price;
        } else {
          countAnnulledHistorical++;
          sumDevolucionAnnulledHistorical += devAtCutoff;
        }

        // CC grouping
        const ccName = ticket.cc_nombre || "Sin asignar";
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
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          pnrNumber: ticket.pnrNumber,
          ticketStatus: statusAtCutoff,
          origin: ticket.origin,
          destination: ticket.destination,
          terminal_origen: ticket.terminal_origen,
          terminal_destino: ticket.terminal_destino,
          travelDate: ticket.travelDate ? moment(ticket.travelDate).format("YYYY-MM-DD") : null,
          departureTime: ticket.departureTime,
          seatNumbers: ticket.seatNumbers,
          fare: ticket.fare,
          monto_boleto: ticket.monto_boleto,
          monto_devolucion: devAtCutoff,
          confirmedAt: ticket.confirmedAt ? moment(ticket.confirmedAt).format("YYYY-MM-DD HH:mm:ss") : null,
          created_at: ticket.created_at ? moment(ticket.created_at).format("YYYY-MM-DD HH:mm:ss") : null,
          updated_at: statusAtCutoff === "Confirmed" ? ticket.confirmedAt : ticket.updated_at,
          user: ticket.id_User ? {
            id: ticket.id_User,
            nombre: ticket.user_nombre,
            rut: ticket.user_rut,
            email: ticket.user_email
          } : null,
          pasajero: ticket.id_pasajero ? {
            id: ticket.id_pasajero,
            nombre: ticket.pasajero_nombre,
            rut: ticket.pasajero_rut,
            correo: ticket.pasajero_correo,
            id_centro_costo: ticket.cc_id,
            centroCosto: ticket.cc_id ? {
              id: ticket.cc_id,
              nombre: ticket.cc_nombre
            } : null,
            centro_costo: ticket.cc_id ? {
              id: ticket.cc_id,
              nombre: ticket.cc_nombre
            } : null,
            CentroCosto: ticket.cc_id ? {
              id: ticket.cc_id,
              nombre: ticket.cc_nombre
            } : null
          } : null,
          empresa: ticket.id_empresa ? {
            id: ticket.id_empresa,
            nombre: ticket.emp_nombre,
            rut: ticket.emp_rut,
            cuenta_corriente: ticket.emp_cuenta_corriente
          } : null
        };

        snapshotsToInsert.push({
          edp_id: edpId,
          ticket_data: JSON.stringify(ticketJson),
        });
      }

      // Read original discount from database
      const percentageDiscount = Number(edp.porcentaje_descuento || 0);
      const discountAmount = Math.round(sumBoletoConfirmedHistorical * (percentageDiscount / 100));
      const montoFacturadoFinal = sumBoletoConfirmedHistorical - discountAmount;

      console.log(`   -> Reconstructed Figures:`);
      console.log(`      Confirmados: ${countConfirmedHistorical} | Anulados: ${countAnnulledHistorical}`);
      console.log(`      Suma Bruto Confirmados: $${sumBoletoConfirmedHistorical}`);
      console.log(`      Descuento Aplicado (${percentageDiscount}%): $${discountAmount}`);
      console.log(`      Monto Facturado Final: $${montoFacturadoFinal}`);
      console.log(`      Suma Devoluciones (periodo): $${sumDevolucionAnnulledHistorical}`);

      if (isCommit) {
        // 1. Delete old snapshots
        await sequelize.query(`
          DELETE FROM edp_ticket_snapshots WHERE edp_id = :edpId
        `, { 
          replacements: { edpId },
          transaction: t 
        });

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
        console.log(`   ✅ Snapshots insertados (${snapshotsToInsert.length} tickets).`);

        // 3. Update estados_cuenta record
        await sequelize.query(`
          UPDATE estados_cuenta
          SET 
            monto_facturado = :monto_facturado,
            total_tickets_anulados = :total_tickets_anulados,
            suma_devoluciones = :suma_devoluciones,
            detalle_por_cc = :detalle_por_cc
          WHERE id = :edpId
        `, {
          replacements: {
            monto_facturado: montoFacturadoFinal,
            total_tickets_anulados: countAnnulledHistorical,
            suma_devoluciones: sumDevolucionAnnulledHistorical,
            detalle_por_cc: JSON.stringify(detallePorCC),
            edpId
          },
          type: QueryTypes.UPDATE,
          transaction: t
        });
        console.log(`   ✅ Registro del EDP ${edpId} actualizado en DB.`);

        // 4. Update and synchronize Cuenta Corriente
        const [ccCargo]: any[] = await sequelize.query(`
          SELECT * FROM cuenta_corriente 
          WHERE empresa_id = :idEmpresa
            AND (
              referencia = :refFact
              OR referencia = :refCargo
              OR estado_cuenta_id = :edpId
            )
            AND tipo_movimiento = 'cargo'
          LIMIT 1
        `, {
          replacements: {
            idEmpresa,
            refFact: `FACT-${idEmpresa}-${edp.periodo}`,
            refCargo: `CARGO-EDC-${edpId}`,
            edpId
          },
          type: QueryTypes.SELECT,
          transaction: t
        });

        if (ccCargo) {
          console.log(`   💳 Cargo encontrado en Cuenta Corriente (ID: ${ccCargo.id}). Monto previo: $${ccCargo.monto}`);
          
          await sequelize.query(`
            UPDATE cuenta_corriente SET monto = :monto WHERE id = :id
          `, {
            replacements: { monto: montoFacturadoFinal, id: ccCargo.id },
            type: QueryTypes.UPDATE,
            transaction: t
          });
          console.log(`   ✅ Cargo en Cuenta Corriente actualizado a $${montoFacturadoFinal}.`);

          // Recalculate balances for this company
          const allMovements: any[] = await sequelize.query(`
            SELECT * FROM cuenta_corriente 
            WHERE empresa_id = :idEmpresa 
            ORDER BY id ASC
          `, { 
            replacements: { idEmpresa },
            type: QueryTypes.SELECT, 
            transaction: t 
          });

          console.log(`   🔄 Recalculando saldos para ${allMovements.length} movimientos de cuenta corriente...`);
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
          console.log("   ✅ Saldos de la cuenta corriente recalculados correctamente.");
        } else {
          console.warn(`   ⚠️ No se encontró ningún cargo en la Cuenta Corriente para el EDP ${edpId}.`);
        }

        await t.commit();
        console.log(`🎉 EDP ${edpId} PROCESADO Y GUARDADO EN LA BASE DE DATOS.`);
      } else {
        await t.rollback();
        console.log(`⚠️ SIMULACIÓN COMPLETADA para EDP ${edpId}. Ningún cambio realizado.`);
      }

    } catch (err) {
      await t.rollback();
      console.error(`❌ Error procesando EDP ${edpId}:`, err);
    }
  }

  console.log(`\n============================================================`);
  console.log(`🏁 FIN DEL PROCESO DE CORRECCIÓN.`);
  await sequelize.close();
}

fixAllEDPs().catch(console.error);
