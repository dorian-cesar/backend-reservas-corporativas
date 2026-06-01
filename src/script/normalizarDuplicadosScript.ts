import "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Empresa } from "../models/empresa.model";
import { Op } from "sequelize";

export const normalizarDuplicados = async () => {
  console.log(
    `[${new Date().toISOString()}] === INICIO NORMALIZACIÓN DE DUPLICADOS ===`,
  );

  try {
    // 1. Obtener todas las empresas que tienen estados de cuenta
    const empresas = await Empresa.findAll();

    for (const empresa of empresas) {
      const empresaId = empresa.id;

      // 2. Obtener todos los estados de cuenta de la empresa ordenados por fecha_inicio y luego por ID
      const estados = await EstadoCuenta.findAll({
        where: { empresa_id: empresaId },
        order: [
          ["fecha_inicio", "ASC"],
          ["id", "ASC"], // El ID menor es el original, los mayores son los duplicados
        ],
      });

      if (estados.length === 0) continue;

      const fechasVistas = new Set<string>();
      const idsDuplicados: number[] = [];

      // 3. Detectar duplicados basados en fecha_inicio
      for (const estado of estados) {
        // Usamos la fecha_inicio como string (ej. "2026-02-28 00:00:00")
        const fechaClave = estado.fecha_inicio;
        
        if (!fechaClave) continue; // Evita el error de TypeScript y protege contra datos nulos

        if (fechasVistas.has(fechaClave)) {
          // Ya vimos esta fecha de inicio, es un duplicado
          if (estado.id) idsDuplicados.push(estado.id);
        } else {
          // Es el primer registro para este periodo
          fechasVistas.add(fechaClave);
        }
      }

      if (idsDuplicados.length > 0) {
        console.log(`\n--- Empresa ID: ${empresaId} (${empresa.nombre}) ---`);
        console.log(
          `🔍 Se encontraron ${idsDuplicados.length} estados de cuenta duplicados:`,
          idsDuplicados,
        );

        // 4. Identificar las referencias en cuenta corriente a eliminar
        const referenciasAEliminar = idsDuplicados.map(
          (id) => `CARGO-EDC-${id}`,
        );

        // --- ZONA DE ELIMINACIÓN ---
        // a) Eliminar los movimientos de cuenta corriente (Cargos duplicados)
        const deletedCC = await CuentaCorriente.destroy({
          where: {
            empresa_id: empresaId,
            referencia: { [Op.in]: referenciasAEliminar },
          },
        });
        console.log(
          `🗑️  Se eliminaron ${deletedCC} cargos duplicados en cuenta_corriente`,
        );

        // b) Eliminar los estados de cuenta duplicados
        const deletedEC = await EstadoCuenta.destroy({
          where: {
            id: { [Op.in]: idsDuplicados },
          },
        });
        console.log(
          `🗑️  Se eliminaron ${deletedEC} estados de cuenta duplicados`,
        );

        // 5. RECALCULAR SALDOS DE CUENTA CORRIENTE
        // Al eliminar cargos, los saldos posteriores quedan mal matemáticamente, hay que reconstruirlos.
        const movimientosRestantes = await CuentaCorriente.findAll({
          where: { empresa_id: empresaId },
          order: [
            ["fecha_movimiento", "ASC"],
            ["id", "ASC"],
          ],
        });

        let saldoAcumulado = 0;
        let actualizados = 0;

        for (const mov of movimientosRestantes) {
          const monto = Number(mov.monto);

          if (mov.tipo_movimiento === "abono") {
            saldoAcumulado += monto;
          } else if (mov.tipo_movimiento === "cargo") {
            saldoAcumulado -= monto;
          }

          // Si el saldo en BD es distinto al calculado, lo actualizamos
          if (Number(mov.saldo) !== saldoAcumulado) {
            mov.saldo = saldoAcumulado;
            await mov.save();
            actualizados++;
          }
        }

        console.log(
          `✅ Se recalcularon y corrigieron ${actualizados} saldos en cuenta_corriente para la empresa ${empresaId}. Saldo final real: $${saldoAcumulado}`,
        );
      }
    }

    console.log(`\n[${new Date().toISOString()}] === FIN NORMALIZACIÓN ===`);
  } catch (error) {
    console.error("🔥 ERROR:", error);
  }
};

// Ejecutar si se llama directamente
if (require.main === module) {
  normalizarDuplicados()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
