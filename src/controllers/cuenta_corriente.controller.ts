import { Request, Response } from "express";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { ICuentaCorrienteCreate } from "../interfaces/cuentaCorriente.interface";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Op } from "sequelize";
import { sequelize } from "../database";
import { Empresa } from "../models/empresa.model";

export const listarMovimientos = async (req: Request, res: Response) => {
  try {
    const { empresa_id } = req.params;
    const { tipo, pagado, desde, hasta, page = "1", limit = "10", ente_facturador } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    // Buscar movimiento de reinicio por sistema más reciente para esta empresa
    const movimientoReinicio = await CuentaCorriente.findOne({
      where: {
        empresa_id,
        referencia: { [Op.like]: "REINICIO-SISTEMA%" },
      },
      order: [["id", "DESC"]],
    });

    const where: any = { empresa_id };

    if (movimientoReinicio) {
      where.id = { [Op.gt]: movimientoReinicio.id };
      
      // Excluir cargos automáticos retroactivos cuyo periodo de facturación (YYYY-MM) sea anterior a Julio 2026 (2026-07)
      // La referencia tiene el formato FACT-{empresaId}-YYYY-MM (ej: FACT-485-2026-05)
      // Los periodos que queremos excluir son de Junio 2026 hacia atrás (2026-01 a 2026-06)
      where[Op.and] = [
        {
          [Op.or]: [
            { referencia: { [Op.notLike]: "FACT-%" } },
            {
              [Op.and]: [
                { referencia: { [Op.like]: "FACT-%" } },
                sequelize.literal(`STR_TO_DATE(CONCAT(SUBSTRING_INDEX(referencia, '-', -2), '-01'), '%Y-%m-%d') >= '2026-07-01'`)
              ]
            }
          ]
        }
      ];
    }

    if (tipo && (tipo === "abono" || tipo === "cargo")) {
      where.tipo_movimiento = tipo;
    }

    if (pagado !== undefined) {
      where.pagado = pagado === "true" || pagado === "1";
    }

    // Filtro por fecha
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

    // Obtener total de registros
    const total = await CuentaCorriente.count({
      where,
      include: ente_facturador ? [includeEmpresa] : undefined,
      distinct: true,
      col: "id",
    });

    // Obtener movimientos con paginación
    const movimientos = await CuentaCorriente.findAll({
      where,
      order: [["fecha_movimiento", "DESC"]],
      limit: limitNum,
      offset: offset,
      include: [includeEmpresa],
    });

    const MESES = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
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
      return mJSON;
    });

    const totalPages = Math.ceil(total / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.json({
      movimientos: movimientosConMes,
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
    res.json(movimiento);
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
    const { empresa_id, tipo_movimiento, monto, descripcion, referencia, tipo_pago } =
      req.body;

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

    // 3. Verificar que no esté ya pagado (opcional, pero buena práctica)
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

    res.json({
      message: "Pago registrado exitosamente",
      pago: abono.toJSON(),
      cargoPagado: {
        id: movimiento.id,
        monto: movimiento.monto,
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
