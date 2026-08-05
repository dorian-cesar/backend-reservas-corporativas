import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { Op } from "sequelize";

export async function corregirSnapshotsExistentesEDP(edpId?: number, empresaId?: number) {
  await connectDB();

  // 1. Obtener los IDs de EDPs que realmente TIENEN snapshots guardados
  const snapshotEdpIdsRows = await EdpTicketSnapshot.findAll({
    attributes: ["edp_id"],
    group: ["edp_id"],
    order: [["edp_id", "ASC"]],
  });

  const availableEdpIds = snapshotEdpIdsRows.map((s) => s.edp_id);

  if (availableEdpIds.length === 0) {
    console.log("ℹ️ No se encontraron EDPs con snapshots en la base de datos.");
    return;
  }

  // 2. Filtrar EstadoCuenta solo sobre los EDPs que tienen snapshots
  const whereCondition: any = {
    id: { [Op.in]: availableEdpIds },
  };

  if (edpId) whereCondition.id = edpId;
  if (empresaId) whereCondition.empresa_id = empresaId;

  const edps = await EstadoCuenta.findAll({
    where: whereCondition,
    order: [["id", "ASC"]],
  });

  console.log(`📌 Encontrados ${edps.length} EDPs CON SNAPSHOTS para procesar.`);

  let edpsProcesados = 0;

  for (const edp of edps) {
    const snapshots = await EdpTicketSnapshot.findAll({
      where: { edp_id: edp.id },
      order: [["id", "ASC"]],
    });

    if (snapshots.length === 0) continue;

    const detallePorCC: Record<
      string,
      {
        nombre: string;
        total_tickets: number;
        total_anulados: number;
        monto_facturado: number;
      }
    > = {};

    detallePorCC["Sin asignar"] = {
      nombre: "Sin asignar",
      total_tickets: 0,
      total_anulados: 0,
      monto_facturado: 0,
    };

    let snapshotActualizados = 0;
    const updatesToRun: { snap: EdpTicketSnapshot; nuevoTicketData: string }[] = [];

    for (const snap of snapshots) {
      let json: any = null;
      try {
        json = JSON.parse(snap.ticket_data);
      } catch {
        continue;
      }

      // Normalizar relaciones de Centro de Costos en el JSON congelado
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

      // Preparar actualización si hubo cambios en la clave
      const nuevoTicketData = JSON.stringify(json);
      if (snap.ticket_data !== nuevoTicketData) {
        updatesToRun.push({ snap, nuevoTicketData });
        snapshotActualizados++;
      }

      // Reconstruir el detalle_por_cc exclusivamente desde el snapshot congelado
      const ccNombre =
        json.pasajero?.centroCosto?.nombre ||
        json.pasajero?.centro_costo?.nombre ||
        json.pasajero?.CentroCosto?.nombre ||
        "Sin asignar";

      const esAnulado = json.ticketStatus === "Anulado";
      const montoTicket = Number(json.monto_boleto || 0);

      if (!detallePorCC[ccNombre]) {
        detallePorCC[ccNombre] = {
          nombre: ccNombre,
          total_tickets: 0,
          total_anulados: 0,
          monto_facturado: 0,
        };
      }

      detallePorCC[ccNombre].total_tickets += 1;
      if (esAnulado) {
        detallePorCC[ccNombre].total_anulados += 1;
      } else {
        detallePorCC[ccNombre].monto_facturado += montoTicket;
      }
    }

    // Ejecutar actualizaciones en lotes paralelos de 50 registros para velocidad optima
    const BATCH_SIZE = 50;
    for (let i = 0; i < updatesToRun.length; i += BATCH_SIZE) {
      const chunk = updatesToRun.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map((item) => item.snap.update({ ticket_data: item.nuevoTicketData }))
      );
    }

    // Actualizar unicamente la estructura de detalle_por_cc en la cabecera del Estado de Cuenta
    await edp.update({
      detalle_por_cc: JSON.stringify(detallePorCC),
    });

    edpsProcesados++;
    console.log(`✅ EDP ID ${edp.id} (Empresa ${edp.empresa_id}, Período ${edp.periodo}):`);
    console.log(`   - Snapshots congelados procesados: ${snapshots.length}`);
    console.log(`   - Snapshots corregidos con CC normalizado: ${snapshotActualizados}`);
    console.log(`   - Resumen detalle_por_cc actualizado en DB.\n`);
  }

  console.log(`=======================================================`);
  console.log(` 📊 RESUMEN DE PROCESAMIENTO DE SNAPSHOTS`);
  console.log(` - EDPs corregidos con snapshots congelados: ${edpsProcesados}`);
  console.log(`=======================================================\n`);
}

if (require.main === module) {
  const targetEdpId = process.argv[2] ? parseInt(process.argv[2]) : undefined;
  const targetEmpresaId = process.argv[3] ? parseInt(process.argv[3]) : undefined;

  corregirSnapshotsExistentesEDP(targetEdpId, targetEmpresaId)
    .then(() => {
      console.log("🎉 Proceso finalizado.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Error al corregir snapshots:", err);
      process.exit(1);
    });
}
