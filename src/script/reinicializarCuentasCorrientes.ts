import { connectDB } from "../database";
import { Empresa } from "../models/empresa.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";

export const reinicializarCuentasCorrientes = async () => {
  console.log(`[${new Date().toISOString()}] === INICIO REINICIALIZACION DE CUENTAS CORRIENTES (PRODUCCION) ===`);
  console.log(`🔌 Conectando a DB: ${process.env.DB_HOST}`);
  await connectDB();

  const empresas = await Empresa.findAll();
  console.log(`📋 Total empresas encontradas: ${empresas.length}`);

  let procesadas = 0;
  let ajustadas = 0;

  const fechaReinicio = new Date();
  const referenciaReinicio = "REINICIO-SISTEMA-2026-08-04";
  const descripcionReinicio = "Ajuste por reinicio de cuenta corriente por sistema";

  for (const empresa of empresas) {
    const empresaId = Number(empresa.id);
    const nombreEmpresa = empresa.nombre || `#${empresaId}`;
    procesadas++;

    // Resetear monto_acumulado en tabla empresas
    const montoAcumuladoAnterior = empresa.monto_acumulado || 0;
    await empresa.update({ monto_acumulado: 0 });

    // Obtener último movimiento
    const ultimoMovimiento = await CuentaCorriente.findOne({
      where: { empresa_id: empresaId },
      order: [["fecha_movimiento", "DESC"], ["id", "DESC"]],
    });

    const saldoActual = ultimoMovimiento ? Number(ultimoMovimiento.saldo) : 0;

    let tipo_movimiento: "abono" | "cargo" = "abono";
    let monto = 0;

    if (saldoActual < 0) {
      // Tiene deuda (ej: -150000). Abono positivo de 150000 para llevar a 0.
      tipo_movimiento = "abono";
      monto = Math.abs(saldoActual);
    } else if (saldoActual > 0) {
      // Saldo a favor (ej: +50000). Cargo de 50000 para llevar a 0.
      tipo_movimiento = "cargo";
      monto = saldoActual;
    } else {
      // Saldo actual es 0, se crea abono de $0 como marcador oficial de reinicio
      tipo_movimiento = "abono";
      monto = 0;
    }

    const nuevoMovimiento = await CuentaCorriente.create({
      empresa_id: empresaId,
      tipo_movimiento,
      monto,
      descripcion: descripcionReinicio,
      saldo: 0,
      referencia: referenciaReinicio,
      pagado: true,
      fecha_movimiento: fechaReinicio,
    });

    ajustadas++;
    console.log(
      `✅ [Empresa ${empresaId} - ${nombreEmpresa}] monto_acumulado: $${montoAcumuladoAnterior.toLocaleString("es-CL")} → $0 | Saldo CC anterior: $${saldoActual.toLocaleString(
        "es-CL"
      )} | Movimiento (${tipo_movimiento.toUpperCase()}) $${monto.toLocaleString(
        "es-CL"
      )} | Nuevo Saldo: $0 | ID Movimiento: ${nuevoMovimiento.id}`
    );
  }

  console.log(`\n==================================================`);
  console.log(`🏁 FIN PROCESO REINICIALIZACION PRODUCCION`);
  console.log(`📊 Empresas procesadas: ${procesadas}`);
  console.log(`📊 Cuentas ajustadas a $0: ${ajustadas}`);
  console.log(`==================================================\n`);
};

if (require.main === module) {
  reinicializarCuentasCorrientes()
    .then(() => {
      console.log("Proceso finalizado con éxito.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error al ejecutar reinicialización:", err);
      process.exit(1);
    });
}
