// src/manual/generarEDCManual.ts
import "../database";
import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { Pasajero } from "../models/pasajero.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Op } from "sequelize";
import * as readline from "readline";

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

/** Parsea fecha en formato DD/MM/YYYY */
function parseFecha(fechaStr: string): Date {
    const [day, month, year] = fechaStr.split('/').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0); // Usar medio día para evitar problemas de zona horaria
    return date;
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

        // Convertir a strings para la base de datos (campos que esperan string)
        const inicioStr = formatDateForDB(fechaDesde);
        const finStr = formatDateForDB(fechaHasta);
        const periodo = generarPeriodoCorto(fechaDesde, fechaHasta);

        console.log(`\nProcesando empresa: ${empresa.nombre}`);
        console.log(`Periodo: ${inicioStr} → ${finStr}`);
        console.log(`Período corto: ${periodo}`);

        // Verificar duplicados usando strings
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

        // Obtener tickets usando objetos Date (como en la API)
        const whereCondition: any = {
            confirmedAt: {
                [Op.between]: [fechaDesde, fechaHasta] // Usamos los objetos Date aquí
            }
        };

        // Filtrar por empresa
        whereCondition.id_empresa = empresaId;

        // Obtener todos los tickets del período
        const tickets = await Ticket.findAll({
            where: whereCondition,
            include: [
                {
                    model: Pasajero,
                    required: true,
                    attributes: ['id', 'nombre', 'rut', 'id_empresa']
                }
            ]
        });

        // Calcular estadísticas
        const total_confirmados = tickets.filter(t => t.ticketStatus === 'Confirmed').length;
        const total_anulados = tickets.filter(t => t.ticketStatus === 'Anulado').length;

        // Sumar montos
        const monto_bruto = tickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
        const devoluciones = tickets.reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
        const monto_neto = monto_bruto - devoluciones;

        if (tickets.length === 0) {
            console.log(`No hay tickets en el período especificado para ${empresa.nombre}`);
            rl.close();
            return;
        }

        console.log(`\nEstadísticas del período:`);
        console.log(`   • Tickets confirmados: ${total_confirmados}`);
        console.log(`   • Tickets anulados: ${total_anulados}`);
        console.log(`   • Monto bruto: $${monto_bruto.toLocaleString('es-CL')}`);
        console.log(`   • Devoluciones: $${devoluciones.toLocaleString('es-CL')}`);
        console.log(`   • Monto neto: $${monto_neto.toLocaleString('es-CL')}`);

        const confirmar = await pregunta("\n¿Confirmar creación del Estado de Cuenta? (s/n): ");
        if (confirmar.toLowerCase() !== 's') {
            console.log("Operación cancelada");
            rl.close();
            return;
        }

        // Crear estado de cuenta (usando strings para fecha_inicio/fecha_fin, Date para fecha_generacion)
        const estadoCuenta = await EstadoCuenta.create({
            empresa_id: empresaId,
            periodo: periodo,
            fecha_inicio: inicioStr, // string
            fecha_fin: finStr, // string
            fecha_generacion: new Date(), // Date
            total_tickets: tickets.length,
            total_tickets_anulados: total_anulados,
            monto_facturado: monto_neto, // Usamos monto neto
            suma_devoluciones: devoluciones,
            detalle_por_cc: JSON.stringify({}),
            pagado: false,
        });

        console.log(`Estado de Cuenta creado con ID: ${estadoCuenta.id}`);

        // Crear cargo en cuenta corriente
        if (estadoCuenta && estadoCuenta.id) {
            const ultimoMovimiento = await CuentaCorriente.findOne({
                where: { empresa_id: empresaId },
                order: [["fecha_movimiento", "DESC"]],
            });

            let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;
            saldoActual = saldoActual - monto_neto;

            await CuentaCorriente.create({
                empresa_id: empresaId,
                tipo_movimiento: "cargo",
                monto: monto_neto,
                descripcion: `Cargo manual por estado de cuenta #${estadoCuenta.id} (${fechaDesdeStr} al ${fechaHastaStr})`,
                saldo: saldoActual,
                referencia: `CARGO-MANUAL-EDC-${estadoCuenta.id}`,
                pagado: false,
                fecha_movimiento: new Date(), // Date
                estado_cuenta_id: estadoCuenta.id
            });

            console.log(`\nCargo en cuenta corriente creado:`);
            console.log(`   • Monto neto: $${monto_neto.toLocaleString('es-CL')}`);
            console.log(`   • Saldo anterior: $${(saldoActual + monto_neto).toLocaleString('es-CL')}`);
            console.log(`   • Nuevo saldo: $${saldoActual.toLocaleString('es-CL')}`);
        }

        console.log("\n✅ Generación manual completada exitosamente!");

    } catch (error) {
        console.error("❌ ERROR durante la generación manual:", error);
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