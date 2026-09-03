import { Request, Response } from "express";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { ICuentaCorrienteCreate } from "../interfaces/cuentaCorriente.interface";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Op } from "sequelize";
import { Empresa } from "../models/empresa.model";
import { sequelize } from "../database";

export const listarMovimientos = async (req: Request, res: Response) => {
  try {
    const { empresa_id } = req.params;
    const {
      tipo,
      pagado,
      desde,
      hasta,
      page = "1",
      limit = "10",
      ente_facturador,
    } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    const where: any = { empresa_id };

    if (tipo && (tipo === "abono" || tipo === "cargo")) {
      where.tipo_movimiento = tipo;
    }

    if (pagado !== undefined) {
      where.pagado = pagado === "true" || pagado === "1";
    }

    // Filtro por fecha (opcional según lo que envíe el usuario en el frontend)
    if (desde || hasta) {
      where.fecha_movimiento = {};

      if (desde) {
        const desdeDate = new Date(desde as string);
        desdeDate.setHours(0, 0, 0, 0);
        where.fecha_movimiento[Op.gte] = desdeDate;
      }

      if (hasta) {
        const hastaDate = new Date(hasta as string);
        hastaDate.setHours(23, 59, 59, 999);
        where.fecha_movimiento[Op.lte] = hastaDate;
      }
    }

    const includeEmpresa: any = {
      model: Empresa,
      as: "empresa",
      attributes: ["id", "nombre", "ente_facturador"],
    };

    if (ente_facturador) {
      includeEmpresa.where = {
        ente_facturador: String(ente_facturador),
      };
      includeEmpresa.required = true;
    }

    // 1. Obtener la cronología COMPLETA de movimientos para calcular el saldo dinámico matemático continuo
    const todosMovimientosEmpresa = await CuentaCorriente.findAll({
      where: { empresa_id },
      order: [
        ["fecha_movimiento", "ASC"],
        ["id", "ASC"],
      ],
      include: ente_facturador ? [includeEmpresa] : undefined,
    });

    // Mapa de saldos dinámicos calculados cronológicamente desde el primer día
    const saldosDinamicosMap = new Map<number, number>();
    let runningBalance = 0;
    for (const m of todosMovimientosEmpresa) {
      const ref = (m.referencia || "").toUpperCase();
      const desc = (m.descripcion || "").toLowerCase();
      const esReinicio =
        ref.includes("REINICIO") ||
        desc.includes("reinicio") ||
        desc.includes("neteo");

      if (esReinicio) {
        runningBalance = 0;
      } else {
        const monto = Number(m.monto || 0);
        if (m.tipo_movimiento === "cargo") {
          runningBalance += monto;
        } else if (m.tipo_movimiento === "abono") {
          runningBalance -= monto;
        }
      }
      saldosDinamicosMap.set(m.id, runningBalance);
    }
    const saldoActualEmpresa = runningBalance;

    // 2. Obtener total de registros con los filtros de búsqueda
    const total = await CuentaCorriente.count({
      where,
      include: ente_facturador ? [includeEmpresa] : undefined,
      distinct: true,
      col: "id",
    });

    // 3. Obtener movimientos paginados para la vista (orden descendente)
    const movimientos = await CuentaCorriente.findAll({
      where,
      order: [
        ["fecha_movimiento", "DESC"],
        ["id", "DESC"],
      ],
      limit: limitNum,
      offset: offset,
      include: [includeEmpresa],
    });

    // 4. Obtener información de estados de cuenta y descuentos para los cargos del lote de forma universal (cualquier empresa)
    const edpIds = new Set<number>();
    const empresaPeriodoKeys = new Set<string>();

    for (const m of movimientos) {
      const mJSON = m.toJSON();
      if (mJSON.tipo_movimiento === "cargo") {
        if (mJSON.estado_cuenta_id) {
          edpIds.add(Number(mJSON.estado_cuenta_id));
        }
        if (mJSON.referencia) {
          const matchId = mJSON.referencia.match(/EDC-(\d+)/i);
          if (matchId) edpIds.add(parseInt(matchId[1], 10));

          const matchPer = mJSON.referencia.match(/(\d{4}-\d{2})/);
          if (matchPer) empresaPeriodoKeys.add(`${mJSON.empresa_id}_${matchPer[1]}`);
        }
        if (mJSON.descripcion) {
          const matchId = mJSON.descripcion.match(/#(\d+)/);
          if (matchId) edpIds.add(parseInt(matchId[1], 10));

          const matchPer = mJSON.descripcion.match(/(\d{4}-\d{2})/);
          if (matchPer) empresaPeriodoKeys.add(`${mJSON.empresa_id}_${matchPer[1]}`);
        }
      }
    }

    const edpMapById = new Map<number, EstadoCuenta>();
    const edpMapByEmpresaPeriodo = new Map<string, EstadoCuenta>();

    const orClauses: any[] = [];
    if (edpIds.size > 0) {
      orClauses.push({ id: Array.from(edpIds) });
    }
    if (empresaPeriodoKeys.size > 0) {
      for (const key of empresaPeriodoKeys) {
        const [empId, per] = key.split("_");
        orClauses.push({ empresa_id: Number(empId), periodo: per });
      }
    }

    if (orClauses.length > 0) {
      const edps = await EstadoCuenta.findAll({
        where: { [Op.or]: orClauses },
      });
      for (const edp of edps) {
        edpMapById.set(edp.id, edp);
        edpMapByEmpresaPeriodo.set(`${edp.empresa_id}_${edp.periodo}`, edp);
      }
    }

    const MESES = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];

    const movimientosConMes = movimientos.map((m) => {
      const mJSON: any = m.toJSON();
      let mesOperacion = "—";
      let periodoOperacion = "";

      if (mJSON.referencia) {
        const match = mJSON.referencia.match(/(\d{4})-(\d{2})/);
        if (match) {
          const year = match[1];
          const monthIndex = parseInt(match[2], 10) - 1;
          if (monthIndex >= 0 && monthIndex < 12) {
            mesOperacion = `${MESES[monthIndex]} ${year}`;
            periodoOperacion = `${year}-${match[2]}`;
          }
        }
      }

      if (mesOperacion === "—" && mJSON.descripcion) {
        const match = mJSON.descripcion.match(/(\d{4})-(\d{2})/);
        if (match) {
          const year = match[1];
          const monthIndex = parseInt(match[2], 10) - 1;
          if (monthIndex >= 0 && monthIndex < 12) {
            mesOperacion = `${MESES[monthIndex]} ${year}`;
            periodoOperacion = `${year}-${match[2]}`;
          }
        }
      }

      if (mesOperacion === "—" && mJSON.fecha_movimiento) {
        const d = new Date(mJSON.fecha_movimiento);
        if (!isNaN(d.getTime())) {
          mesOperacion = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
          periodoOperacion = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }
      }

      mJSON.mes_operacion = mesOperacion;
      mJSON.periodo_operacion = periodoOperacion;
      // Asignar el saldo dinámico continuo exacto
      mJSON.saldo =
        saldosDinamicosMap.get(mJSON.id) ?? Number(mJSON.saldo || 0);

      // Enriquecer con datos de descuento si el cargo proviene de un Estado de Cuenta con descuento
      let descuentoInfo: any = null;
      let montoAPagar = Number(mJSON.monto || 0);

      if (mJSON.tipo_movimiento === "cargo") {
        let edp: EstadoCuenta | undefined;

        // 1. Buscar por ID de EDP si está disponible
        let edpId = mJSON.estado_cuenta_id ? Number(mJSON.estado_cuenta_id) : null;
        if (!edpId && mJSON.referencia) {
          const match = mJSON.referencia.match(/EDC-(\d+)/i);
          if (match) edpId = parseInt(match[1], 10);
        }
        if (!edpId && mJSON.descripcion) {
          const match = mJSON.descripcion.match(/#(\d+)/);
          if (match) edpId = parseInt(match[1], 10);
        }

        if (edpId && edpMapById.has(edpId)) {
          edp = edpMapById.get(edpId);
        }

        // 2. Si no se encontró por ID, buscar por empresa_id + periodo
        if (!edp) {
          let periodo: string | null = null;
          if (mJSON.referencia) {
            const matchPer = mJSON.referencia.match(/(\d{4}-\d{2})/);
            if (matchPer) periodo = matchPer[1];
          }
          if (!periodo && mJSON.descripcion) {
            const matchPer = mJSON.descripcion.match(/(\d{4}-\d{2})/);
            if (matchPer) periodo = matchPer[1];
          }
          if (periodo) {
            edp = edpMapByEmpresaPeriodo.get(`${mJSON.empresa_id}_${periodo}`);
          }
        }

        if (edp && Number(edp.porcentaje_descuento || 0) > 0) {
          const pct = Number(edp.porcentaje_descuento);
          const montoOriginal = Number(mJSON.monto || 0);
          let montoFinal = Number(edp.monto_facturado || 0);
          let montoDescuento = montoOriginal - montoFinal;

          if (montoDescuento <= 0 || montoFinal <= 0) {
            montoDescuento = Math.round(montoOriginal * (pct / 100));
            montoFinal = Math.max(0, montoOriginal - montoDescuento);
          }

          descuentoInfo = {
            porcentaje: pct,
            monto_descuento: montoDescuento,
            monto_original: montoOriginal,
            monto_final: montoFinal,
            estado_cuenta_id: edp.id,
            periodo: edp.periodo,
          };
          montoAPagar = montoFinal;
        }
      }

      mJSON.descuento_aplicado = descuentoInfo;
      mJSON.monto_a_pagar = montoAPagar;

      return mJSON;
    });

    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.json({
      movimientos: movimientosConMes,
      saldo_actual: saldoActualEmpresa,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Error al listar movimientos:", error);
    res.status(500).json({
      message: "Error en servidor",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

// Obtener un movimiento específico
export const obtenerMovimiento = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const movimiento = await CuentaCorriente.findByPk(id);
    if (!movimiento) return res.status(404).json({ message: "No encontrado" });

    const mJSON: any = movimiento.toJSON();
    let descuentoInfo: any = null;
    let montoAPagar = Number(mJSON.monto || 0);

    if (mJSON.tipo_movimiento === "cargo") {
      let edp: EstadoCuenta | null = null;

      let edpId = mJSON.estado_cuenta_id ? Number(mJSON.estado_cuenta_id) : null;
      if (!edpId && mJSON.referencia) {
        const match = mJSON.referencia.match(/EDC-(\d+)/i);
        if (match) edpId = parseInt(match[1], 10);
      }
      if (!edpId && mJSON.descripcion) {
        const match = mJSON.descripcion.match(/#(\d+)/);
        if (match) edpId = parseInt(match[1], 10);
      }

      if (edpId) {
        edp = await EstadoCuenta.findByPk(edpId);
      }

      if (!edp) {
        let periodo: string | null = null;
        if (mJSON.referencia) {
          const matchPer = mJSON.referencia.match(/(\d{4}-\d{2})/);
          if (matchPer) periodo = matchPer[1];
        }
        if (!periodo && mJSON.descripcion) {
          const matchPer = mJSON.descripcion.match(/(\d{4}-\d{2})/);
          if (matchPer) periodo = matchPer[1];
        }
        if (periodo) {
          edp = await EstadoCuenta.findOne({
            where: { empresa_id: mJSON.empresa_id, periodo },
          });
        }
      }

      if (edp && Number(edp.porcentaje_descuento || 0) > 0) {
        const pct = Number(edp.porcentaje_descuento);
        const montoOriginal = Number(mJSON.monto || 0);
        let montoFinal = Number(edp.monto_facturado || 0);
        let montoDescuento = montoOriginal - montoFinal;

        if (montoDescuento <= 0 || montoFinal <= 0) {
          montoDescuento = Math.round(montoOriginal * (pct / 100));
          montoFinal = Math.max(0, montoOriginal - montoDescuento);
        }

        descuentoInfo = {
          porcentaje: pct,
          monto_descuento: montoDescuento,
          monto_original: montoOriginal,
          monto_final: montoFinal,
          estado_cuenta_id: edp.id,
          periodo: edp.periodo,
        };
        montoAPagar = montoFinal;
      }
    }

    mJSON.descuento_aplicado = descuentoInfo;
    mJSON.monto_a_pagar = montoAPagar;

    res.json(mJSON);
  } catch (err) {
    res.status(500).json({ message: "Error en servidor" });
  }
};

// Crear un movimiento (abono o cargo)
export const crearMovimiento = async (
  req: Request<{}, {}, ICuentaCorrienteCreate>,
  res: Response,
) => {
  try {
    const {
      empresa_id,
      tipo_movimiento,
      monto,
      descripcion,
      referencia,
      tipo_pago,
    } = req.body;

    // Obtener último saldo
    const ultimo = await CuentaCorriente.findOne({
      where: { empresa_id },
      order: [
        ["fecha_movimiento", "DESC"],
        ["id", "DESC"],
      ],
    });
    let saldo = ultimo ? Number(ultimo.saldo) : 0;
    saldo =
      tipo_movimiento === "abono"
        ? saldo + Number(monto)
        : saldo - Number(monto);

    const movimiento = await CuentaCorriente.create({
      empresa_id,
      tipo_movimiento,
      monto,
      descripcion,
      saldo,
      referencia,
      tipo_pago,
    });

    res.status(201).json(movimiento);
  } catch (err) {
    res.status(500).json({ message: "Error en servidor" });
  }
};

// Eliminar un movimiento (opcional, según política)
export const eliminarMovimiento = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const movimiento = await CuentaCorriente.findByPk(id);
    if (!movimiento) return res.status(404).json({ message: "No encontrado" });
    await movimiento.destroy();
    res.json({ message: "Movimiento eliminado" });
  } catch (err) {
    res.status(500).json({ message: "Error en servidor" });
  }
};

export const pagarMovimiento = async (req: Request, res: Response) => {
  try {
    const { movimientoId, monto, referenciaPago, tipo_pago } = req.body;

    // Validaciones básicas
    if (!movimientoId || !monto) {
      return res.status(400).json({
        message: "Faltan parámetros: movimientoId y monto",
      });
    }

    // 1. Buscar el cargo
    const movimiento = await CuentaCorriente.findByPk(movimientoId);
    if (!movimiento) {
      return res.status(404).json({ message: "Movimiento no encontrado" });
    }

    // 2. Verificar que sea un cargo (no se pagan abonos)
    if (movimiento.tipo_movimiento !== "cargo") {
      return res.status(400).json({
        message: "Solo se pueden pagar movimientos de tipo 'cargo'",
      });
    }

    // 3. Verificar que no esté ya pagado
    if (movimiento.pagado) {
      return res.status(400).json({
        message: "Este movimiento ya está marcado como pagado",
      });
    }

    // 4. Obtener último saldo para calcular
    const ultimo = await CuentaCorriente.findOne({
      where: { empresa_id: movimiento.empresa_id },
      order: [
        ["fecha_movimiento", "DESC"],
        ["id", "DESC"],
      ],
    });

    let nuevoSaldo = ultimo ? Number(ultimo.saldo) : 0;
    nuevoSaldo = nuevoSaldo + Number(monto); // Abono SUMA al saldo

    // 5. Crear el abono (registro del pago)
    const abono = await CuentaCorriente.create({
      empresa_id: movimiento.empresa_id,
      tipo_movimiento: "abono",
      monto: Number(monto),
      descripcion: referenciaPago
        ? referenciaPago
        : `Pago de ${movimiento.descripcion || `cargo #${movimiento.id}`}`,
      saldo: nuevoSaldo,
      referencia: `ABONO-PAGO-${movimiento.id}`,
      tipo_pago: tipo_pago || null,
      fecha_movimiento: new Date(),
    });

    // 6. Marcar el cargo original como PAGADO
    movimiento.pagado = true;
    if (tipo_pago) {
      movimiento.tipo_pago = tipo_pago;
    }
    await movimiento.save();

    // 7. Si está vinculado a un Estado de Cuenta, marcar también el EDP como pagado
    let edpId = movimiento.estado_cuenta_id ? Number(movimiento.estado_cuenta_id) : null;
    if (!edpId && movimiento.referencia) {
      const match = movimiento.referencia.match(/EDC-(\d+)/i);
      if (match) edpId = parseInt(match[1], 10);
    }
    if (!edpId && movimiento.descripcion) {
      const match = movimiento.descripcion.match(/#(\d+)/);
      if (match) edpId = parseInt(match[1], 10);
    }
    if (edpId) {
      await EstadoCuenta.update(
        { pagado: true, fecha_pago: new Date() },
        { where: { id: edpId } }
      );
    } else {
      let p: string | null = null;
      if (movimiento.referencia) {
        const mPeriod = movimiento.referencia.match(/(\d{4}-\d{2})/);
        if (mPeriod) p = mPeriod[1];
      }
      if (!p && movimiento.descripcion) {
        const mPeriod = movimiento.descripcion.match(/(\d{4}-\d{2})/);
        if (mPeriod) p = mPeriod[1];
      }
      if (p) {
        await EstadoCuenta.update(
          { pagado: true, fecha_pago: new Date() },
          { where: { empresa_id: movimiento.empresa_id, periodo: p } }
        );
      }
    }

    res.json({
      message: "Pago registrado exitosamente",
      pago: abono.toJSON(),
      cargoPagado: {
        id: movimiento.id,
        monto: movimiento.monto,
        montoPagado: Number(monto),
        ahoraPagado: true,
      },
    });
  } catch (error) {
    console.error("Error al pagar movimiento:", error);
    res.status(500).json({
      message: "Error interno del servidor",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};
