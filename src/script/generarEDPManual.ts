// src/manual/generarEDCManual.ts
import "../database";
import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { QueryTypes } from "sequelize";
import * as readline from "readline";

/** Convierte a SQL local YYYY-MM-DD HH:mm:ss */
function formatSQL(d: Date) {
    const p = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
        d.getHours()
    )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Parsea fecha en formato DD/MM/YYYY */
function parseFecha(fechaStr: string): Date {
    const [day, month, year] = fechaStr.split('/').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0);
}

/** Genera un período corto para el campo STRING(7) */
function generarPeriodoCorto(fechaDesde: Date, fechaHasta: Date): string {
    // Formato: MMDDHHD (mes, día desde, día hasta)
    const mesDesde = (fechaDesde.getMonth() + 1).toString().padStart(2, '0');
    const diaDesde = fechaDesde.getDate().toString().padStart(2, '0');
    const diaHasta = fechaHasta.getDate().toString().padStart(2, '0');

    // Tomamos solo los últimos 7 caracteres si es necesario
    const periodo = `M${mesDesde}${diaDesde}${diaHasta}`;
    return periodo.length > 7 ? periodo.substring(0, 7) : periodo;
}

async function generarEDCManual() {
    console.log("=== GENERACIÓN MANUAL DE ESTADO DE CUENTA ===");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const pregunta = (query: string): Promise<string> => {
        return new Promise((resolve) => {
            rl.question(query, (answer) => {
                resolve(answer.trim());
            });
        });
    };

    try {
        // 1. Solicitar ID de la empresa
        const empresaIdStr = await pregunta("ID de la empresa: ");
        const empresaId = parseInt(empresaIdStr);

        if (isNaN(empresaId)) {
            console.error("ID inválido. Debe ser un número.");
            rl.close();
            return;
        }

        const empresa = await Empresa.findByPk(empresaId);
        if (!empresa) {
            console.error(`No se encontró empresa con ID ${empresaId}`);
            rl.close();
            return;
        }

        console.log(`Empresa encontrada: ${empresa.nombre}`);

        // 2. Solicitar fecha desde
        const fechaDesdeStr = await pregunta("Fecha desde (DD/MM/YYYY): ");
        const fechaDesde = parseFecha(fechaDesdeStr);

        if (isNaN(fechaDesde.getTime())) {
            console.error("Fecha desde inválida");
            rl.close();
            return;
        }

        // 3. Solicitar fecha hasta
        const fechaHastaStr = await pregunta("Fecha hasta (DD/MM/YYYY): ");
        const fechaHasta = parseFecha(fechaHastaStr);
        fechaHasta.setHours(23, 59, 59, 999); // Fin del día

        if (isNaN(fechaHasta.getTime())) {
            console.error("Fecha hasta inválida");
            rl.close();
            return;
        }

        if (fechaDesde >= fechaHasta) {
            console.error("La fecha desde debe ser anterior a la fecha hasta");
            rl.close();
            return;
        }

        const inicioStr = formatSQL(fechaDesde);
        const finStr = formatSQL(fechaHasta);
        const periodo = generarPeriodoCorto(fechaDesde, fechaHasta);

        console.log(`\nProcesando empresa: ${empresa.nombre}`);
        console.log(`Periodo: ${inicioStr} → ${finStr}`);
        console.log(`Período corto: ${periodo}`);

        const existe = await EstadoCuenta.findOne({
            where: {
                empresa_id: empresaId,
                fecha_inicio: inicioStr,
                fecha_fin: finStr,
            },
        });

        if (existe) {
            console.warn(`Ya existe un Estado de Cuenta para este período (ID: ${existe.id})`);
            const continuar = await pregunta("¿Desea continuar y crear otro? (s/n): ");
            if (continuar.toLowerCase() !== 's') {
                console.log("Operación cancelada");
                rl.close();
                return;
            }
        }

        const sequelize = (Ticket as any).sequelize;
        if (!sequelize) throw new Error("Sequelize no inicializado.");

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
            console.log(`No hay tickets en el período especificado para ${empresa.nombre}`);
            rl.close();
            return;
        }

        console.log(`\nEstadísticas del período:`);
        console.log(`   • Tickets confirmados: ${data.confirmados || 0}`);
        console.log(`   • Tickets anulados: ${data.anulados || 0}`);
        console.log(`   • Monto total: $${Number(data.monto || 0).toLocaleString('es-CL')}`);
        console.log(`   • Devoluciones: $${Number(data.devoluciones || 0).toLocaleString('es-CL')}`);

        const confirmar = await pregunta("\n¿Confirmar creación del Estado de Cuenta? (s/n): ");
        if (confirmar.toLowerCase() !== 's') {
            console.log("Operación cancelada");
            rl.close();
            return;
        }

        const estadoCuenta = await EstadoCuenta.create({
            empresa_id: empresaId,
            periodo: periodo,
            fecha_inicio: inicioStr,
            fecha_fin: finStr,
            fecha_generacion: new Date(),
            total_tickets: Number(data.total || 0),
            total_tickets_anulados: Number(data.anulados || 0),
            monto_facturado: Number(data.monto || 0),
            suma_devoluciones: Number(data.devoluciones || 0),
            detalle_por_cc: JSON.stringify({
                manual: true,
                periodo_personalizado: true,
                fecha_desde: fechaDesdeStr,
                fecha_hasta: fechaHastaStr,
                periodo_completo: `MANUAL-${fechaDesdeStr}-${fechaHastaStr}`
            }),
            pagado: false,
        });

        console.log(`Estado de Cuenta creado con ID: ${estadoCuenta.id}`);

        if (estadoCuenta && estadoCuenta.id) {
            const ultimoMovimiento = await CuentaCorriente.findOne({
                where: { empresa_id: empresaId },
                order: [["fecha_movimiento", "DESC"]],
            });

            let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

            // Calcular monto neto
            const montoNeto = Number(data.monto || 0) - Number(data.devoluciones || 0);

            saldoActual = saldoActual - montoNeto;

            await CuentaCorriente.create({
                empresa_id: empresaId,
                tipo_movimiento: "cargo",
                monto: montoNeto, // Usar el monto neto
                descripcion: `Cargo manual por estado de cuenta #${estadoCuenta.id} (${fechaDesdeStr} al ${fechaHastaStr}) (Neto: $${montoNeto})`,
                saldo: saldoActual,
                referencia: `CARGO-MANUAL-EDC-${estadoCuenta.id}`,
                pagado: false,
                fecha_movimiento: new Date(),
                estado_cuenta_id: estadoCuenta.id
            });

            console.log(`Cargo en cuenta corriente creado por $${montoNeto.toLocaleString('es-CL')} (Neto)`);
            console.log(`   - Monto bruto: $${Number(data.monto || 0).toLocaleString('es-CL')}`);
            console.log(`   - Devoluciones: $${Number(data.devoluciones || 0).toLocaleString('es-CL')}`);
            console.log(`Nuevo saldo: $${saldoActual.toLocaleString('es-CL')}`);
        }

        console.log("\nGeneración manual completada exitosamente!");

    } catch (error) {
        console.error("ERROR durante la generación manual:", error);
    } finally {
        rl.close();
    }
}

// Ejecutar el script
if (require.main === module) {
    generarEDCManual().catch((err) => {
        console.error("🔥 ERROR FATAL:", err);
        process.exit(1);
    });
}

export { generarEDCManual };