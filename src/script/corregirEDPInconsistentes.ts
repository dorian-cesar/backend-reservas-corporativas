import { connectDB } from "../database";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Empresa } from "../models/empresa.model";
import { Pasajero } from "../models/pasajero.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Op } from "sequelize";

// Helper para recalcular saldos de cuenta corriente posteriores a una modificación
const recalcularSaldosDesde = async (empresaId: number, fechaDesde: Date): Promise<void> => {
    const movimientos = await CuentaCorriente.findAll({
        where: {
            empresa_id: empresaId,
            fecha_movimiento: { [Op.gte]: fechaDesde }
        },
        order: [["fecha_movimiento", "ASC"], ["id", "ASC"]]
    });

    if (movimientos.length === 0) return;

    const saldoAnterior = await CuentaCorriente.findOne({
        where: {
            empresa_id: empresaId,
            fecha_movimiento: { [Op.lt]: fechaDesde }
        },
        order: [["fecha_movimiento", "DESC"]]
    });

    let saldoAcumulado = saldoAnterior ? Number(saldoAnterior.saldo) : 0;

    for (const movimiento of movimientos) {
        if (movimiento.tipo_movimiento === "abono") {
            saldoAcumulado += Number(movimiento.monto);
        } else if (movimiento.tipo_movimiento === "cargo") {
            saldoAcumulado -= Number(movimiento.monto);
        }

        if (Math.abs(Number(movimiento.saldo) - saldoAcumulado) > 0.01) {
            console.log(`      updating CC transaction ID ${movimiento.id}: old saldo=${movimiento.saldo} -> new saldo=${saldoAcumulado}`);
            await movimiento.update({ saldo: saldoAcumulado });
        }
    }
};

async function corregir() {
    await connectDB();
    console.log("=== INICIANDO CORRECCIÓN DE ESTADOS DE PAGO (EDPs) ===");

    const estados = await EstadoCuenta.findAll({
        include: [{ model: Empresa, attributes: ['nombre'] }]
    });

    console.log(`Se encontraron ${estados.length} estados de cuenta para revisar.\n`);

    let corregidosCount = 0;
    const empresasPorRecalcularCC = new Map<number, Date>();

    for (const ec of estados) {
        if (!ec.fecha_inicio || !ec.fecha_fin) {
            continue;
        }

        const inicio = new Date(ec.fecha_inicio);
        const fin = new Date(ec.fecha_fin);
        fin.setHours(23, 59, 59, 999);

        // Fetch tickets with passenger and cost center details
        const tickets = await Ticket.findAll({
            where: {
                id_empresa: ec.empresa_id,
                confirmedAt: {
                    [Op.between]: [inicio, fin]
                },
                ticketStatus: { [Op.in]: ['Confirmed', 'Anulado'] }
            },
            include: [
                {
                    model: Pasajero,
                    include: [{
                        model: CentroCosto,
                        attributes: ['id', 'nombre']
                    }],
                    required: false
                }
            ]
        });

        // Calcular montos reales
        const totalTickets = tickets.length;
        const anulados = tickets.filter(t => t.ticketStatus === 'Anulado').length;
        const montoBruto = tickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
        const devoluciones = tickets.reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
        const montoFacturadoReal = montoBruto - devoluciones;

        const dbMontoFacturado = Number(ec.monto_facturado);
        const dbTotalTickets = ec.total_tickets;
        const dbAnulados = ec.total_tickets_anulados;

        const tieneDiscrepancia = 
            dbMontoFacturado !== montoFacturadoReal || 
            dbTotalTickets !== totalTickets || 
            dbAnulados !== anulados;

        if (tieneDiscrepancia) {
            corregidosCount++;
            console.log(`✏️ Corrigiendo [EDP ID ${ec.id}] Empresa: ${ec.empresa?.nombre} - Periodo: ${ec.periodo}`);
            console.log(`   Tickets - BD: ${dbTotalTickets} (${dbAnulados} anulados) | Real: ${totalTickets} (${anulados} anulados)`);
            console.log(`   Monto   - BD: $${dbMontoFacturado} | Real: $${montoFacturadoReal}`);

            // Recalcular detalle_por_cc
            const detallePorCC: Record<string, {
                nombre: string,
                total_tickets: number,
                total_anulados: number,
                monto_facturado: number
            }> = {};

            detallePorCC["Sin asignar"] = {
                nombre: "Sin asignar",
                total_tickets: 0,
                total_anulados: 0,
                monto_facturado: 0
            };

            for (const ticket of tickets) {
                const pasajero = ticket.pasajero;
                const centroCostoNombre = pasajero?.centroCosto?.nombre || "Sin asignar";

                if (!detallePorCC[centroCostoNombre]) {
                    detallePorCC[centroCostoNombre] = {
                        nombre: centroCostoNombre,
                        total_tickets: 0,
                        total_anulados: 0,
                        monto_facturado: 0
                    };
                }

                detallePorCC[centroCostoNombre].total_tickets += 1;
                if (ticket.ticketStatus === 'Anulado') {
                    detallePorCC[centroCostoNombre].total_anulados += 1;
                }
                const boleto = Number(ticket.monto_boleto) || 0;
                const devolucion = Number(ticket.monto_devolucion) || 0;
                detallePorCC[centroCostoNombre].monto_facturado += (boleto - devolucion);
            }

            // 1. Actualizar EstadoCuenta
            await ec.update({
                total_tickets: totalTickets,
                total_tickets_anulados: anulados,
                monto_facturado: montoFacturadoReal,
                suma_devoluciones: devoluciones,
                detalle_por_cc: JSON.stringify(detallePorCC)
            });
            console.log(`   ✅ Registro de EstadoCuenta ID ${ec.id} actualizado.`);

            // 2. Buscar y actualizar movimiento en CuentaCorriente
            const movimiento = await CuentaCorriente.findOne({
                where: {
                    [Op.or]: [
                        { estado_cuenta_id: ec.id },
                        { referencia: `FACT-${ec.empresa_id}-${ec.periodo}` },
                        { referencia: `CARGO-EDC-${ec.id}` },
                        { referencia: `CARGO-MANUAL-EDC-${ec.id}` }
                    ]
                }
            });

            if (movimiento) {
                console.log(`   🔄 Modificando transacción de CuentaCorriente ID ${movimiento.id}: Monto anterior $${movimiento.monto} -> Nuevo monto $${montoFacturadoReal}`);
                await movimiento.update({
                    monto: montoFacturadoReal,
                    estado_cuenta_id: ec.id // Asegurar que quede vinculado
                });

                // Registrar para recálculo posterior
                const fechaMov = new Date(movimiento.fecha_movimiento);
                const fechaMinReg = empresasPorRecalcularCC.get(ec.empresa_id);
                if (!fechaMinReg || fechaMov < fechaMinReg) {
                    empresasPorRecalcularCC.set(ec.empresa_id, fechaMov);
                }
            } else {
                console.log(`   ⚠️ No se encontró movimiento de CuentaCorriente vinculado al EDP ID ${ec.id}.`);
            }
            console.log("");
        }
    }

    // 3. Recalcular saldos de cuenta corriente para todas las empresas afectadas
    if (empresasPorRecalcularCC.size > 0) {
        console.log("=== RECALCULANDO SALDOS DE CUENTA CORRIENTE ===");
        for (const [empresaId, fechaDesde] of empresasPorRecalcularCC.entries()) {
            console.log(`🔄 Recalculando saldos para empresa ID: ${empresaId} desde la fecha: ${fechaDesde.toISOString()}`);
            await recalcularSaldosDesde(empresaId, fechaDesde);
        }
    }

    console.log(`\n=== PROCESO COMPLETADO. Total EDPs regularizados: ${corregidosCount} ===`);
    process.exit(0);
}

corregir().catch(err => {
    console.error("🔥 Error crítico en corrección:", err);
    process.exit(1);
});
