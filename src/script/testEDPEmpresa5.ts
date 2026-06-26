import { connectDB } from "../database";
import { Empresa } from "../models/empresa.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Ticket } from "../models/ticket.model";
import { Pasajero } from "../models/pasajero.model";
import { Op } from "sequelize";

/** Convierte Date a string en formato YYYY-MM-DD HH:mm:ss */
function formatDateForDB(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function run() {
    await connectDB();
    console.log("Conectado a la base de datos de desarrollo.");

    const empresaId = 5;

    // 1. Obtener la empresa
    const empresa = await Empresa.findByPk(empresaId);
    if (!empresa) {
        console.error("No se encontró la empresa ID 5.");
        return;
    }
    console.log(`Empresa encontrada: ${empresa.nombre}`);

    // 2. Obtener o crear un pasajero de prueba para la empresa 5
    let pasajero = await Pasajero.findOne({ where: { id_empresa: empresaId } });
    if (!pasajero) {
        console.log("No hay pasajeros para la empresa 5. Creando uno de prueba...");
        pasajero = await Pasajero.create({
            nombre: "Pasajero de Prueba WIT",
            rut: "11111111-1",
            correo: "test_wit@empresa.com",
            id_empresa: empresaId
        });
    }
    
    // Asegurar que el pasajero tenga el centro de costo de Administración (ID 12) para que aparezca en el PDF
    if (pasajero && pasajero.id_centro_costo !== 12) {
        await pasajero.update({ id_centro_costo: 12 });
        console.log("Se actualizó el centro de costo del pasajero de prueba a ID 12 (Administración).");
    }
    
    console.log(`Pasajero de prueba: ${pasajero.nombre} (ID: ${pasajero.id})`);

    // 3. Definir un periodo de prueba aislado: Mayo de 2025 ("2025-05")
    const targetYear: number = 2025;
    const targetMonth: number = 4; // Mayo (0-indexed)
    const diaFacturacion = empresa.dia_facturacion || 1;
    const diaVencimiento = empresa.dia_vencimiento || 15;

    const inicioPeriodo = new Date(targetYear, targetMonth, diaFacturacion, 0, 0, 0);
    const finPeriodo = new Date(targetYear, targetMonth + 1, diaFacturacion, 0, 0, 0);
    const periodo = `${targetYear}-${(targetMonth + 1).toString().padStart(2, '0')}`; // "2025-05"

    const testDate = new Date(targetYear, targetMonth, 10, 12, 0, 0);

    // Limpiar si ya existieran tickets de prueba creados previamente en este periodo aislado (para no duplicar en re-ejecuciones)
    await Ticket.destroy({
        where: {
            id_empresa: empresaId,
            ticketNumber: { [Op.like]: 'TEST-WIT-202505-%' }
        }
    });

    // 4. Crear tickets que sumen $300.000 para el periodo aislado 2025-05 (Prueba A)
    console.log(`Creando 3 tickets de $100.000 en el periodo aislado ${periodo}...`);
    for (let i = 1; i <= 3; i++) {
        await Ticket.create({
            ticketNumber: `TEST-WIT-202505-00${i}`,
            ticketStatus: "Confirmed",
            origin: "Santiago",
            destination: "Valparaíso",
            travelDate: "2025-05-10",
            departureTime: "12:00",
            seatNumbers: `${i}`,
            fare: 100000,
            monto_boleto: 100000,
            monto_devolucion: 0,
            confirmedAt: testDate,
            id_User: 1,
            id_pasajero: pasajero.id,
            id_empresa: empresaId
        });
    }
    console.log("Tickets creados exitosamente.");

    // 5. Ejecutar la lógica de facturación para el periodo aislado
    console.log(`Procesando facturación del periodo ${periodo}...`);
    const anioSiguiente = targetMonth === 11 ? targetYear + 1 : targetYear;
    const mesSiguiente = (targetMonth + 1) % 12;

    const fecha_facturacion = new Date(anioSiguiente, mesSiguiente, diaFacturacion, 0, 0, 0, 0);
    const fecha_vencimiento = new Date(anioSiguiente, mesSiguiente, diaVencimiento, 0, 0, 0, 0);

    // Buscar tickets de este periodo
    const tickets = await Ticket.findAll({
        where: {
            id_empresa: empresaId,
            ticketStatus: { [Op.in]: ['Confirmed', 'Anulado'] },
            confirmedAt: {
                [Op.gte]: inicioPeriodo,
                [Op.lt]: finPeriodo
            }
        }
    });

    const total_tickets = tickets.length;
    const total_tickets_anulados = tickets.filter(t => t.ticketStatus === 'Anulado').length;
    const monto_bruto = tickets.reduce((sum, t) => sum + (Number(t.monto_boleto) || 0), 0);
    const devoluciones = tickets.reduce((sum, t) => sum + (Number(t.monto_devolucion) || 0), 0);
    const monto_neto_consumo = monto_bruto - devoluciones;

    // Calcular descuento por tramos
    let porcentajeDescuento = 0;
    const tramos = await EmpresaTramo.findAll({
        where: { id_empresa: empresaId },
        order: [['monto_desde', 'ASC']]
    });
    for (const tramo of tramos) {
        const desde = Number(tramo.monto_desde);
        const hasta = tramo.monto_hasta !== null && tramo.monto_hasta !== undefined ? Number(tramo.monto_hasta) : null;
        if (monto_neto_consumo >= desde && (hasta === null || monto_neto_consumo <= hasta)) {
            porcentajeDescuento = Number(tramo.porcentaje_descuento);
        }
    }

    const descuento = monto_neto_consumo * (porcentajeDescuento / 100);
    const monto_facturado = monto_neto_consumo - descuento;

    console.log(`[Cálculo]`);
    console.log(`Periodo: ${periodo}`);
    console.log(`Tickets totales considerados: ${total_tickets}`);
    console.log(`Monto Neto Consumo: $${monto_neto_consumo}`);
    console.log(`Porcentaje Descuento Aplicado: ${porcentajeDescuento}%`);
    console.log(`Monto Descuento: $${descuento}`);
    console.log(`Monto Facturado Final: $${monto_facturado}`);

    // Detalle por Centro de Costo
    const detallePorCC: Record<string, any> = {
        "Administración": {
            nombre: "Administración",
            total_tickets: total_tickets,
            total_anulados: total_tickets_anulados,
            monto_facturado: monto_neto_consumo
        }
    };

    // Buscar si ya existe EstadoCuenta para este periodo y empresa
    let estadoCuenta = await EstadoCuenta.findOne({
        where: {
            empresa_id: empresaId,
            periodo
        }
    });

    if (estadoCuenta) {
        // Actualizar EstadoCuenta existente
        await estadoCuenta.update({
            fecha_generacion: testDate,
            fecha_inicio: formatDateForDB(inicioPeriodo),
            fecha_fin: formatDateForDB(finPeriodo),
            total_tickets,
            total_tickets_anulados,
            monto_facturado,
            suma_devoluciones: devoluciones,
            porcentaje_descuento: porcentajeDescuento,
            detalle_por_cc: JSON.stringify(detallePorCC),
            fecha_facturacion,
            fecha_vencimiento
        });
        console.log(`EstadoCuenta actualizado exitosamente con ID: ${estadoCuenta.id}`);
    } else {
        // Crear EstadoCuenta nuevo
        estadoCuenta = await EstadoCuenta.create({
            empresa_id: empresaId,
            periodo,
            fecha_generacion: testDate,
            fecha_inicio: formatDateForDB(inicioPeriodo),
            fecha_fin: formatDateForDB(finPeriodo),
            total_tickets,
            total_tickets_anulados,
            monto_facturado,
            suma_devoluciones: devoluciones,
            porcentaje_descuento: porcentajeDescuento,
            detalle_por_cc: JSON.stringify(detallePorCC),
            pagado: false,
            fecha_facturacion,
            fecha_vencimiento
        });
        console.log(`EstadoCuenta creado exitosamente con ID: ${estadoCuenta.id}`);
    }

    // Crear movimiento en cuenta corriente cargo
    if (monto_facturado > 0) {
        const referenciaGlobal = `FACT-${empresaId}-${periodo}`;
        const existeCargoGlobal = await CuentaCorriente.findOne({
            where: {
                empresa_id: empresaId,
                referencia: referenciaGlobal
            }
        });

        if (!existeCargoGlobal) {
            const ccMov = await CuentaCorriente.create({
                empresa_id: empresaId,
                tipo_movimiento: "cargo",
                monto: monto_facturado,
                descripcion: porcentajeDescuento > 0 
                    ? `Cargo automático por facturación periodo ${periodo} (Descuento del ${porcentajeDescuento}% aplicado).`
                    : `Cargo automático por facturación periodo ${periodo}.`,
                saldo: -monto_facturado,
                referencia: referenciaGlobal,
                fecha_movimiento: testDate
            });
            console.log(`Movimiento de Cuenta Corriente (cargo) creado con ID: ${ccMov.id}, monto: $${ccMov.monto}`);
        } else {
            await existeCargoGlobal.update({
                monto: monto_facturado,
                descripcion: porcentajeDescuento > 0 
                    ? `Cargo automático por facturación periodo ${periodo} (Descuento del ${porcentajeDescuento}% aplicado).`
                    : `Cargo automático por facturación periodo ${periodo}.`,
                saldo: -monto_facturado
            });
            console.log(`Movimiento de Cuenta Corriente (cargo) actualizado con ID: ${existeCargoGlobal.id}, monto: $${monto_facturado}`);
        }
    }

    console.log("¡Prueba configurada y ejecutada exitosamente!");
}

run().catch(console.error);
