// src/cron/cuentasCorrientesForzadas.ts
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

    // Solo estados de cuenta no pagados si se especifica
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
            .map(c => c.referencia?.replace('CARGO-EDC-', ''))
            .filter(id => !isNaN(Number(id)))
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

    /** Verificar si ya existe cuenta corriente para este estado de cuenta */
    const cuentaExistente = await CuentaCorriente.findOne({
        where: {
            empresa_id: empresaId,
            referencia: `CARGO-EDC-${estadoId}`
        }
    });

    if (cuentaExistente) {
        console.log(`⚠️  Estado de cuenta ${estadoId} (${periodo}) ya tiene cuenta corriente asociada. Se omite.`);
        return;
    }

    /** 3️⃣ Obtener último saldo para calcular nuevo */
    const ultimoMovimiento = await CuentaCorriente.findOne({
        where: { empresa_id: empresaId },
        order: [["fecha_movimiento", "DESC"]],
    });

    let saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

    // Calcular monto facturado (cargo disminuye el saldo)
    const montoFacturado = Number(estadoCuenta.monto_facturado);

    if (montoFacturado === 0) {
        console.log(`💰 Estado de cuenta ${estadoId} (${periodo}) tiene monto 0. Se omite.`);
        return;
    }

    saldoActual = saldoActual - montoFacturado;

    /** 4️⃣ Crear movimiento en cuenta corriente */
    const fechaMovimiento = estadoCuenta.fecha_facturacion || estadoCuenta.fecha_generacion || new Date();

    const movimiento = await CuentaCorriente.create({
        empresa_id: empresaId,
        tipo_movimiento: "cargo",
        monto: montoFacturado,
        descripcion: `Cargo por estado de cuenta ${periodo} (${estadoCuenta.fecha_inicio} - ${estadoCuenta.fecha_fin})`,
        saldo: saldoActual,
        referencia: `CARGO-EDC-${estadoId}`,
        pagado: estadoCuenta.pagado || false,
        fecha_movimiento: fechaMovimiento,
    });

    console.log(`✅ Cargo creado para empresa ${nombreEmpresa}`);
    console.log(`   ID estado cuenta: ${estadoId}`);
    console.log(`   Periodo: ${periodo}`);
    console.log(`   Monto: $${montoFacturado}`);
    console.log(`   Saldo anterior: $${ultimoMovimiento ? ultimoMovimiento.saldo : 0}`);
    console.log(`   Nuevo saldo: $${saldoActual}`);
    console.log(`   Referencia: ${movimiento.referencia}`);
    console.log(`   Fecha movimiento: ${fechaMovimiento.toLocaleDateString()}`);
}

/** Función para ejecutar desde terminal con argumentos */
export async function ejecutarDesdeCLI() {
    const args = process.argv.slice(2);
    const opciones: OpcionesForzado = {};

    // Parsear argumentos de línea de comandos
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--empresa" && args[i + 1]) {
            opciones.empresaId = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === "--desde" && args[i + 1]) {
            // Convertir fecha a formato YYYY-MM
            const fecha = new Date(args[i + 1]);
            opciones.periodoDesde = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
            i++;
        } else if (args[i] === "--hasta" && args[i + 1]) {
            // Convertir fecha a formato YYYY-MM
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
  ts-node src/cron/generarCuentasCorrientes.ts --desde 2024-01-01 --hasta 2024-12-31
      `);
            process.exit(0);
        }
    }

    try {
        await generarCuentasCorrientesForzadas(opciones);
        console.log("✨ Proceso completado exitosamente");
        process.exit(0);
    } catch (error) {
        console.error("🔥 ERROR:", error);
        process.exit(1);
    }
}

// Si se ejecuta directamente desde terminal
if (require.main === module) {
    ejecutarDesdeCLI();
}