import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { Empresa } from "../models/empresa.model";
import { Op } from "sequelize";

function parseDateString(dateStr: string): Date {
    const [datePart, timePart] = dateStr.trim().split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes, seconds] = timePart ? timePart.split(":").map(Number) : [0, 0, 0];
    return new Date(year, month - 1, day, hours, minutes, seconds);
}

async function verificar() {
    await connectDB();
    console.log("=== VERIFICANDO ESTADOS DE PAGO (EDPs) VS TICKETS ===");

    const estados = await EstadoCuenta.findAll({
        include: [{ model: Empresa, attributes: ['nombre'] }]
    });

    console.log(`Se encontraron ${estados.length} estados de cuenta en la base de datos.\n`);

    let discrepanciasCount = 0;

    for (const ec of estados) {
        if (!ec.fecha_inicio || !ec.fecha_fin) {
            console.log(`[EDP ID ${ec.id}] Empresa: ${ec.empresa?.nombre} - Periodo: ${ec.periodo} - Sin fechas de periodo definidas.`);
            continue;
        }

        const inicio = parseDateString(ec.fecha_inicio);
        const fin = parseDateString(ec.fecha_fin);
        fin.setHours(23, 59, 59, 999);

        // Buscar tickets usando confirmedAt
        const tickets = await Ticket.findAll({
            where: {
                id_empresa: ec.empresa_id,
                confirmedAt: {
                    [Op.between]: [inicio, fin]
                },
                ticketStatus: { [Op.in]: ['Confirmed', 'Anulado'] }
            }
        });

        // 1. Formula estándar (utilizada en ejecutarEDPManual, recalcularEstadosCuenta):
        // monto_facturado = monto_bruto - devoluciones (para todos los tickets)
        const totalTickets = tickets.length;
        const anulados = tickets.filter(t => t.ticketStatus === 'Anulado').length;
        const confirmados = tickets.filter(t => t.ticketStatus === 'Confirmed').length;
        const montoBruto = tickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
        const devoluciones = tickets.reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
        const montoFacturadoFormula1 = montoBruto - devoluciones;

        // 2. Formula bugueada (cron generarEstadosPagoEmpresas):
        // monto_facturado = cargos_confirmados - abonos_anulados
        const cargosConfirmados = tickets.filter(t => t.ticketStatus === 'Confirmed').reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
        const abonosAnulados = tickets.filter(t => t.ticketStatus === 'Anulado').reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
        const montoFacturadoFormula2 = cargosConfirmados - abonosAnulados;

        const dbMontoFacturado = Number(ec.monto_facturado);
        const dbTotalTickets = ec.total_tickets;
        const dbAnulados = ec.total_tickets_anulados;

        let tieneDiscrepancia = false;
        let detalle = "";

        if (dbMontoFacturado !== montoFacturadoFormula1) {
            tieneDiscrepancia = true;
            detalle += `\n  - Monto Facturado BD ($${dbMontoFacturado}) != Calculado ($${montoFacturadoFormula1}) [Dif: $${dbMontoFacturado - montoFacturadoFormula1}]`;
            if (dbMontoFacturado === montoFacturadoFormula2) {
                detalle += ` (⚠️ Coincide con la Fórmula 2 con bug del cron!)`;
            }
        }

        if (dbTotalTickets !== totalTickets) {
            tieneDiscrepancia = true;
            detalle += `\n  - Total Tickets BD (${dbTotalTickets}) != Calculado (${totalTickets})`;
        }

        if (dbAnulados !== anulados) {
            tieneDiscrepancia = true;
            detalle += `\n  - Anulados BD (${dbAnulados}) != Calculado (${anulados})`;
        }

        if (tieneDiscrepancia) {
            discrepanciasCount++;
            console.log(`❌ [EDP ID ${ec.id}] Empresa: ${ec.empresa?.nombre} (ID: ${ec.empresa_id}) - Periodo: ${ec.periodo} (${ec.fecha_inicio} a ${ec.fecha_fin})`);
            console.log(`   Tickets BD: ${dbTotalTickets} (${dbAnulados} anulados) | Real: ${totalTickets} (${anulados} anulados)`);
            console.log(`   Monto BD: $${dbMontoFacturado} | Real: $${montoFacturadoFormula1} | Formula2 (con bug): $${montoFacturadoFormula2}`);
            console.log(`   Detalle discrepancia: ${detalle}\n`);
        }
    }

    console.log(`=== FIN VERIFICACIÓN. Total EDPs con discrepancias/errores encontrados: ${discrepanciasCount} ===`);
    process.exit(0);
}

verificar().catch(err => {
    console.error("Error en verificación:", err);
    process.exit(1);
});
