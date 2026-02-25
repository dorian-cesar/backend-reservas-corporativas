import "../database";
import { Empresa } from "../models/empresa.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Op } from "sequelize";

interface OpcionesForzado {
    empresaId?: number;
    periodoDesde?: string; // Formato YYYY-MM
    periodoHasta?: string; // Formato YYYY-MM
    soloNoGenerados?: boolean;
}

export const generarCuentasCorrientesForzadas = async (
    opciones?: OpcionesForzado
) => {
    console.log(`[${new Date().toISOString()}] === INICIO CUENTAS CORRIENTES FORZADAS ===`);

    /** Si se especifica una empresa específica */
    if (opciones?.empresaId) {
        const empresa = await Empresa.findByPk(opciones.empresaId);
        if (!empresa) {
            throw new Error(`Empresa con ID ${opciones.empresaId} no encontrada`);
        }

        const empresaId = Number(empresa.id ?? empresa.get?.("id"));
        const nombre = empresa.nombre ?? empresa.get?.("nombre") ?? `#${empresaId}`;

        console.log(
            `\n--- Forzando solo empresa ${nombre} (ID ${empresaId}) ---`
        );

        await procesarEstadosCuentaEmpresa(empresaId, nombre, opciones);
    } else {
        /** Procesar todas las empresas activas */
        const empresas = await Empresa.findAll({
            where: { estado: true },
        });

        console.log(`📊 Empresas activas encontradas: ${empresas.length}`);

        for (const empresa of empresas) {
            const empresaId = Number(empresa.id ?? empresa.get?.("id"));
            if (!empresaId) {
                console.error("Empresa sin ID válido, se omite");
                continue;
            }

            const nombre = empresa.nombre ?? empresa.get?.("nombre") ?? `#${empresaId}`;

            console.log(
                `\n--- Procesando empresa ${nombre} (ID ${empresaId}) ---`
            );

            await procesarEstadosCuentaEmpresa(empresaId, nombre, opciones);
        }
    }

    console.log(`[${new Date().toISOString()}] === FIN CUENTAS CORRIENTES FORZADAS ===`);
};

async function procesarEstadosCuentaEmpresa(
    empresaId: number,
    nombre: string,
    opciones?: OpcionesForzado
) {
    /** 1️⃣ Buscar estados de cuenta de la empresa */
    const whereClause: any = { empresa_id: empresaId };

    // Filtrar por período si se especifica
    if (opciones?.periodoDesde || opciones?.periodoHasta) {
        whereClause.periodo = {};

        if (opciones.periodoDesde) {
            whereClause.periodo[Op.gte] = opciones.periodoDesde;
        }

        if (opciones.periodoHasta) {
            whereClause.periodo[Op.lte] = opciones.periodoHasta;
        }
    }

    // Solo estados de cuenta no generados si se especifica
    if (opciones?.soloNoGenerados) {
        // Buscar estados de cuenta que NO tienen cuenta corriente asociada
        const estadosConCuenta = await CuentaCorriente.findAll({
            where: {
                empresa_id: empresaId,
                referencia: { [Op.like]: 'CARGO-EDC-%' }
            },
            attributes: ['referencia'],
            raw: true
        });

        const idsGenerados = estadosConCuenta
            .map(c => {
                const ref = c.referencia as string;
                return ref?.replace('CARGO-EDC-', '');
            })
            .filter(id => id && !isNaN(Number(id)))
            .map(id => Number(id));

        if (idsGenerados.length > 0) {
            whereClause.id = { [Op.notIn]: idsGenerados };
        }
    }

    const estadosCuenta = await EstadoCuenta.findAll({
        where: whereClause,
        order: [["periodo", "ASC"]],
    });

    console.log(`📄 Estados de cuenta encontrados: ${estadosCuenta.length}`);

    if (estadosCuenta.length === 0) {
        console.log(`📭 Empresa ${nombre}: sin estados de cuenta para procesar.`);
        return;
    }

    /** 2️⃣ Procesar cada estado de cuenta */
    for (const estadoCuenta of estadosCuenta) {
        await procesarEstadoCuenta(estadoCuenta, nombre);
    }
}

async function procesarEstadoCuenta(estadoCuenta: EstadoCuenta, nombreEmpresa: string) {
    const estadoId = estadoCuenta.id;
    const empresaId = estadoCuenta.empresa_id;
    const periodo = estadoCuenta.periodo;

    /** Verificar si ya existe cargo en cuenta corriente para este estado de cuenta */
    const cargoExistente = await CuentaCorriente.findOne({
        where: {
            empresa_id: empresaId,
            referencia: `CARGO-EDC-${estadoId}`
        }
    });

    if (cargoExistente) {
        console.log(`⚠️  Estado de cuenta ${estadoId} (${periodo}) ya tiene cargo asociado. Se omite.`);
        return;
    }

    /** 3️⃣ Obtener último saldo para calcular nuevo */
    const ultimoMovimiento = await CuentaCorriente.findOne({
        where: { empresa_id: empresaId },
        order: [["fecha_movimiento", "DESC"], ["id", "DESC"]],
    });

    let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

    // Monto facturado (cargo disminuye el saldo)
    const montoFacturadoBruto = Number(estadoCuenta.monto_facturado || 0);
    const sumaDevoluciones = Number(estadoCuenta.suma_devoluciones || 0);
    const montoNeto = montoFacturadoBruto; // Ya debería ser neto (verificar según tu lógica)

    if (montoNeto === 0) {
        console.log(`💰 Estado de cuenta ${estadoId} (${periodo}) tiene monto neto 0. Se omite.`);
        console.log(`   - Monto: $${montoFacturadoBruto}, Devoluciones: $${sumaDevoluciones}`);
        return;
    }

    const nuevoSaldo = saldoActual - montoNeto;

    /** 4️⃣ Crear movimiento en cuenta corriente */
    const fechaMovimiento = new Date(); // Usar fecha actual

    try {
        const movimiento = await CuentaCorriente.create({
            empresa_id: empresaId,
            tipo_movimiento: "cargo",
            monto: montoNeto,
            descripcion: `Cargo por estado de cuenta ${periodo} (${estadoCuenta.fecha_inicio} - ${estadoCuenta.fecha_fin}) - Neto: $${montoNeto.toFixed(2)}`,
            saldo: nuevoSaldo,
            referencia: `CARGO-EDC-${estadoId}`,
            pagado: estadoCuenta.pagado || false,
            fecha_movimiento: fechaMovimiento,
            estado_cuenta_id: estadoId
        });

        console.log(`✅ Cargo creado para empresa ${nombreEmpresa}`);
        console.log(`   ID estado cuenta: ${estadoId}`);
        console.log(`   Periodo: ${periodo}`);
        console.log(`   Monto: $${montoNeto.toLocaleString('es-CL')}`);
        console.log(`   Saldo anterior: $${saldoActual.toLocaleString('es-CL')}`);
        console.log(`   Nuevo saldo: $${nuevoSaldo.toLocaleString('es-CL')}`);
        console.log(`   Referencia: ${movimiento.referencia}`);

        /** 5️⃣ Si el estado de cuenta tiene descuento aplicado, generar el abono correspondiente */
        if (estadoCuenta.porcentaje_descuento && Number(estadoCuenta.porcentaje_descuento) > 0) {
            await generarDescuentoParaEstadoCuenta(estadoCuenta, fechaMovimiento, nuevoSaldo);
        }
    } catch (error) {
        console.error(`❌ Error al crear cargo para estado de cuenta ${estadoId}:`, error);
    }
}

/**
 * Generar abono de descuento para un estado de cuenta ya creado
 */
async function generarDescuentoParaEstadoCuenta(estadoCuenta: EstadoCuenta, fechaOriginal: Date, saldoDespuesCargo: number) {
    const estadoId = estadoCuenta.id;
    const empresaId = estadoCuenta.empresa_id;
    const porcentaje = Number(estadoCuenta.porcentaje_descuento || 0);

    // Verificar si ya existe descuento para este estado de cuenta
    const descuentoExistente = await CuentaCorriente.findOne({
        where: {
            empresa_id: empresaId,
            referencia: `DESCUENTO-EDC-${estadoId}`
        }
    });

    if (descuentoExistente) {
        console.log(`⚠️  Estado de cuenta ${estadoId} ya tiene descuento aplicado. Se omite.`);
        return;
    }

    // Calcular monto del descuento
    const montoFacturado = Number(estadoCuenta.monto_facturado || 0);
    const montoDescuento = montoFacturado * (porcentaje / 100);

    // El descuento es un ABONO (suma al saldo)
    const nuevoSaldo = saldoDespuesCargo + montoDescuento;

    // Crear abono por descuento (1 segundo después del cargo)
    const fechaDescuento = new Date(fechaOriginal);
    fechaDescuento.setSeconds(fechaDescuento.getSeconds() + 1);

    try {
        const abonoDescuento = await CuentaCorriente.create({
            empresa_id: empresaId,
            tipo_movimiento: "abono",
            monto: montoDescuento,
            descripcion: `Descuento del ${porcentaje}% aplicado al estado de cuenta ${estadoCuenta.periodo}`,
            saldo: nuevoSaldo,
            referencia: `DESCUENTO-EDC-${estadoId}`,
            fecha_movimiento: fechaDescuento,
            estado_cuenta_id: estadoId
        });

        console.log(`   📉 Descuento aplicado: ${porcentaje}% ($${montoDescuento.toLocaleString('es-CL')})`);
        console.log(`   Nuevo saldo con descuento: $${nuevoSaldo.toLocaleString('es-CL')}`);

        // Recalcular saldos de movimientos posteriores
        await recalcularSaldosPosteriores(empresaId, fechaDescuento);
    } catch (error) {
        console.error(`❌ Error al aplicar descuento para estado de cuenta ${estadoId}:`, error);
    }
}

/**
 * Recalcular saldos de movimientos posteriores
 */
async function recalcularSaldosPosteriores(empresaId: number, fechaDesde: Date): Promise<void> {
    const movimientosPosteriores = await CuentaCorriente.findAll({
        where: {
            empresa_id: empresaId,
            fecha_movimiento: { [Op.gt]: fechaDesde }
        },
        order: [["fecha_movimiento", "ASC"], ["id", "ASC"]]
    });

    if (movimientosPosteriores.length === 0) return;

    // Obtener saldo justo antes del primer movimiento a recalcular
    const movimientoAnterior = await CuentaCorriente.findOne({
        where: {
            empresa_id: empresaId,
            fecha_movimiento: { [Op.lte]: fechaDesde }
        },
        order: [["fecha_movimiento", "DESC"], ["id", "DESC"]]
    });

    let saldoAcumulado = movimientoAnterior ? Number(movimientoAnterior.saldo) : 0;

    for (const movimiento of movimientosPosteriores) {
        const monto = Number(movimiento.monto);

        if (movimiento.tipo_movimiento === "abono") {
            saldoAcumulado += monto;
        } else if (movimiento.tipo_movimiento === "cargo") {
            saldoAcumulado -= monto;
        }

        // Actualizar si el saldo cambió
        const saldoActual = Number(movimiento.saldo);
        if (Math.abs(saldoActual - saldoAcumulado) > 0.01) {
            await movimiento.update({ saldo: saldoAcumulado });
            console.log(`   🔄 Saldo recalculado para movimiento ID ${movimiento.id}: $${saldoAcumulado.toLocaleString('es-CL')}`);
        }
    }
}

/** Función para ejecutar desde terminal */
export async function ejecutarDesdeCLI() {
    const args = process.argv.slice(2);
    const opciones: OpcionesForzado = {};

    // Parsear argumentos de línea de comandos
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--empresa" && args[i + 1]) {
            opciones.empresaId = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === "--desde" && args[i + 1]) {
            const fecha = new Date(args[i + 1]);
            opciones.periodoDesde = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
            i++;
        } else if (args[i] === "--hasta" && args[i + 1]) {
            const fecha = new Date(args[i + 1]);
            opciones.periodoHasta = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
            i++;
        } else if (args[i] === "--solo-no-generados") {
            opciones.soloNoGenerados = true;
        } else if (args[i] === "--help") {
            console.log(`
Uso: ts-node src/cron/generarCuentasCorrientes.ts [opciones]

Opciones:
  --empresa ID            Forzar solo para esta empresa
  --desde FECHA          Fecha inicio (YYYY-MM-DD) -> filtrar por período desde
  --hasta FECHA          Fecha fin (YYYY-MM-DD) -> filtrar por período hasta
  --solo-no-generados    Solo procesar estados de cuenta sin cuenta corriente asociada
  --help                 Mostrar esta ayuda

Ejemplos:
  ts-node src/cron/generarCuentasCorrientes.ts                          # Todas las empresas
  ts-node src/cron/generarCuentasCorrientes.ts --empresa 1              # Solo empresa ID 1
  ts-node src/cron/generarCuentasCorrientes.ts --solo-no-generados      # Solo los no generados
      `);
            process.exit(0);
        }
    }

    try {
        await generarCuentasCorrientesForzadas(opciones);
        console.log("\n✨ Proceso completado exitosamente");
        process.exit(0);
    } catch (error) {
        console.error("\n🔥 ERROR:", error);
        process.exit(1);
    }
}

// Si se ejecuta directamente desde terminal
if (require.main === module) {
    ejecutarDesdeCLI();
}