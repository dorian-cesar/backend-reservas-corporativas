import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Pasajero } from "../models/pasajero.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Reclamo } from "../models/reclamo.model";
import { Empresa } from "../models/empresa.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { Op } from "sequelize";
import moment from "moment-timezone";

const TIMEZONE = "America/Santiago";

export async function regenerarSnapshotsEDP(edpId?: number, empresaId?: number) {
  await connectDB();

  const whereCondition: any = {};
  if (edpId) whereCondition.id = edpId;
  if (empresaId) whereCondition.empresa_id = empresaId;

  const edps = await EstadoCuenta.findAll({ where: whereCondition });
  console.log(`📌 Encontrados ${edps.length} EDPs para actualizar snapshots.`);

  for (const edp of edps) {
    const inicio = moment.tz(edp.fecha_inicio, TIMEZONE).toDate();
    const fin = moment.tz(edp.fecha_fin, TIMEZONE).toDate();

    const tickets = await Ticket.findAll({
      where: {
        id_empresa: edp.empresa_id,
        ticketStatus: { [Op.in]: ["Confirmed", "Anulado"] },
        confirmedAt: { [Op.between]: [inicio, fin] },
      },
      include: [
        {
          model: User,
          attributes: ["id", "nombre", "rut", "email"],
          required: false,
        },
        {
          model: Pasajero,
          attributes: ["id", "nombre", "rut", "correo", "telefono", "id_centro_costo"],
          include: [{ model: CentroCosto, required: false }],
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

    if (tickets.length === 0) {
      console.log(`⚠️ EDP ID ${edp.id} (Empresa ${edp.empresa_id}) no tiene tickets en rango ${edp.fecha_inicio} a ${edp.fecha_fin}.`);
      continue;
    }

    const snapshotRows = tickets.map((t) => {
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
        edp_id: edp.id,
        ticket_data: JSON.stringify(json),
      };
    });

    // Reemplazar snapshots del EDP
    await EdpTicketSnapshot.destroy({ where: { edp_id: edp.id } });
    await EdpTicketSnapshot.bulkCreate(snapshotRows);
    console.log(`✅ Snapshots regenerados exitosamente para EDP ID ${edp.id} (${snapshotRows.length} tickets).`);
  }
}

if (require.main === module) {
  const targetEdpId = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  const targetEmpresaId = process.argv[3] ? parseInt(process.argv[3]) : undefined;

  regenerarSnapshotsEDP(targetEdpId, targetEmpresaId)
    .then(() => {
      console.log("🎉 Proceso finalizado.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Error al regenerar snapshots:", err);
      process.exit(1);
    });
}
