import { Request, Response } from "express";
import { Empresa } from "../models/empresa.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { sequelize } from "../database";
import { Op, QueryTypes } from "sequelize";
import moment from "moment-timezone";
import ExcelJS from "exceljs";

const TIMEZONE = "America/Santiago";

// Constantes de inicio del nuevo sistema tras reinicio de cuenta corriente
const PERIODO_INICIAL_NUEVO_SISTEMA = "2026-07";
const FECHA_REINICIO_CUENTA_CORRIENTE = "2026-08-04 00:00:00";

/**
 * Genera la lista de períodos (YYYY-MM) entre inicio y fin (inclusive).
 */
const generarListaPeriodos = (
  periodoInicio: string,
  periodoFin: string,
): string[] => {
  const periodos: string[] = [];
  let current = moment.tz(periodoInicio, "YYYY-MM", TIMEZONE).startOf("month");
  const end = moment.tz(periodoFin, "YYYY-MM", TIMEZONE).startOf("month");

  while (current.isSameOrBefore(end)) {
    periodos.push(current.format("YYYY-MM"));
    current.add(1, "month");
  }
  return periodos;
};

/**
 * Helper ultrarrápido para calcular la matriz multi-empresa desde el nuevo sistema (Periodo 2026-07 y reinicio de CC)
 */
const obtenerEstadoCuentaGlobalPeriodoData = async (
  meses: string = "6",
  periodo_inicio?: string,
  periodo_fin?: string,
  empresa_id?: string,
) => {
  let pFinStr = periodo_fin
    ? String(periodo_fin)
    : moment().tz(TIMEZONE).format("YYYY-MM");

  let pInicioStr = periodo_inicio
    ? String(periodo_inicio)
    : moment(pFinStr, "YYYY-MM")
        .tz(TIMEZONE)
        .subtract(Number(meses) - 1, "months")
        .format("YYYY-MM");

  // Clampear inicio mínimo a 2026-07 (Reinicio del nuevo sistema)
  if (pInicioStr < PERIODO_INICIAL_NUEVO_SISTEMA) {
    pInicioStr = PERIODO_INICIAL_NUEVO_SISTEMA;
  }

  const periodos = generarListaPeriodos(pInicioStr, pFinStr);
  const fechaInicioPeriodo = moment
    .tz(pInicioStr, "YYYY-MM", TIMEZONE)
    .startOf("month")
    .format("YYYY-MM-DD HH:mm:ss");
  const fechaFinPeriodo = moment
    .tz(pFinStr, "YYYY-MM", TIMEZONE)
    .endOf("month")
    .format("YYYY-MM-DD HH:mm:ss");

  const filterEmpresaClause =
    empresa_id && empresa_id !== "todas" ? "AND e.id = :empresaId" : "";
  const filterCcEmpresaClause =
    empresa_id && empresa_id !== "todas" ? "AND empresa_id = :empresaId" : "";

  const replacements: any = {
    periodos,
    empresaId: Number(empresa_id),
    fechaInicio: fechaInicioPeriodo,
    fechaFin: fechaFinPeriodo,
    periodoInicial: PERIODO_INICIAL_NUEVO_SISTEMA,
    fechaReinicioCC: FECHA_REINICIO_CUENTA_CORRIENTE,
  };

  // 1. SQL Bulk: EDPs emitidos en el nuevo sistema (periodo >= '2026-07')
  const edpsQuery = `
    SELECT 
      e.id AS empresa_id,
      e.nombre,
      COALESCE(NULLIF(e.cuenta_corriente, ''), CONCAT('C', LPAD(e.id, 5, '0'), '-1')) AS cuenta_corriente,
      CASE 
        WHEN ec.periodo REGEXP '^[0-9]{4}-[0-9]{2}$' THEN ec.periodo
        ELSE DATE_FORMAT(ec.fecha_generacion, '%Y-%m')
      END AS periodo,
      COALESCE(SUM(ec.monto_facturado), 0) AS monto_facturado
    FROM empresas e
    INNER JOIN estados_cuenta ec 
      ON e.id = ec.empresa_id 
      AND (
        CASE 
          WHEN ec.periodo REGEXP '^[0-9]{4}-[0-9]{2}$' THEN ec.periodo
          ELSE DATE_FORMAT(ec.fecha_generacion, '%Y-%m')
        END
      ) >= :periodoInicial
      AND (
        CASE 
          WHEN ec.periodo REGEXP '^[0-9]{4}-[0-9]{2}$' THEN ec.periodo
          ELSE DATE_FORMAT(ec.fecha_generacion, '%Y-%m')
        END
      ) IN (:periodos)
    WHERE e.estado = 1 ${filterEmpresaClause}
    GROUP BY e.id, e.nombre, e.cuenta_corriente, periodo
    ORDER BY e.nombre ASC;
  `;

  // 2. SQL Bulk: Abonos recibidos en el nuevo sistema (desde reinicio 04 Agosto 2026)
  const abonosQuery = `
    SELECT 
      empresa_id,
      COALESCE(SUM(monto), 0) AS total_abonos
    FROM cuenta_corriente
    WHERE tipo_movimiento = 'abono'
      AND fecha_movimiento >= :fechaReinicioCC
      AND (referencia IS NULL OR referencia NOT LIKE '%REINICIO%')
      AND (descripcion IS NULL OR (descripcion NOT LIKE '%reinicio%' AND descripcion NOT LIKE '%Ajuste por reinicio%'))
      ${filterCcEmpresaClause}
    GROUP BY empresa_id;
  `;

  // 3. SQL Bulk: Último saldo registrado en el nuevo sistema (desde reinicio 04 Agosto 2026)
  const saldosQuery = `
    SELECT cc.empresa_id, cc.saldo
    FROM cuenta_corriente cc
    INNER JOIN (
      SELECT empresa_id, MAX(id) AS max_id
      FROM cuenta_corriente
      WHERE fecha_movimiento >= :fechaReinicioCC
      ${empresa_id && empresa_id !== "todas" ? "AND empresa_id = :empresaId" : ""}
      GROUP BY empresa_id
    ) latest ON cc.id = latest.max_id;
  `;

  // Obtener lista de empresas activas a incluir
  const empresasActivas = await Empresa.findAll({
    where:
      empresa_id && empresa_id !== "todas"
        ? { id: Number(empresa_id), estado: true }
        : { estado: true },
    order: [["nombre", "ASC"]],
  });

  const [edpRows, abonoRows, saldoRows] = await Promise.all([
    sequelize.query<any>(edpsQuery, { replacements, type: QueryTypes.SELECT }),
    sequelize.query<any>(abonosQuery, { replacements, type: QueryTypes.SELECT }),
    sequelize.query<any>(saldosQuery, { replacements, type: QueryTypes.SELECT }),
  ]);

  // Mapas en memoria O(1)
  const abonosMap = new Map<number, number>();
  abonoRows.forEach((r) =>
    abonosMap.set(Number(r.empresa_id), Number(r.total_abonos || 0)),
  );

  const saldosMap = new Map<number, number>();
  saldoRows.forEach((r) =>
    saldosMap.set(Number(r.empresa_id), Number(r.saldo || 0)),
  );

  const edpMap = new Map<string, number>(); // clave: `${empresa_id}_${periodo}`
  edpRows.forEach((row) => {
    const key = `${row.empresa_id}_${row.periodo}`;
    edpMap.set(key, Number(row.monto_facturado || 0));
  });

  const empresasData = empresasActivas.map((emp) => {
    const montosPorPeriodo: Record<string, number> = {};
    let totalEDP = 0;

    periodos.forEach((p) => {
      const key = `${emp.id}_${p}`;
      const monto = edpMap.get(key) || 0;
      montosPorPeriodo[p] = monto;
      totalEDP += monto;
    });

    const totalAbono = abonosMap.get(emp.id) || 0;
    const saldoActual = saldosMap.get(emp.id) || 0;
    const diferencia = totalEDP - totalAbono;

    const ctaCteStr = emp.cuenta_corriente || `C${String(emp.id).padStart(5, "0")}-1`;

    return {
      id: emp.id,
      nombre: emp.nombre,
      cuentaCorriente: ctaCteStr,
      montosPorPeriodo,
      totalEDP,
      totalAbono,
      diferencia,
      saldoActual,
    };
  });

  const totalesPorPeriodo: Record<string, number> = {};
  periodos.forEach((p) => {
    totalesPorPeriodo[p] = empresasData.reduce(
      (acc, emp) => acc + (emp.montosPorPeriodo[p] || 0),
      0,
    );
  });

  const grandTotalEDP = empresasData.reduce(
    (acc, emp) => acc + emp.totalEDP,
    0,
  );
  const grandTotalAbono = empresasData.reduce(
    (acc, emp) => acc + emp.totalAbono,
    0,
  );
  const grandDiferencia = empresasData.reduce(
    (acc, emp) => acc + emp.diferencia,
    0,
  );
  const grandSaldoActual = empresasData.reduce(
    (acc, emp) => acc + emp.saldoActual,
    0,
  );

  return {
    periodoInicio: pInicioStr,
    periodoFin: pFinStr,
    periodos,
    empresas: empresasData,
    totales: {
      totalesPorPeriodo,
      grandTotalEDP,
      grandTotalAbono,
      grandDiferencia,
      grandSaldoActual,
    },
  };
};

/**
 * Helper ultrarrápido para calcular el detalle por empresa desde el nuevo sistema (Periodo 2026-07 y reinicio de CC)
 */
const obtenerEstadoCuentaEmpresaDetalleData = async (
  empresa_id?: string,
  periodo?: string,
  periodo_inicio?: string,
  periodo_fin?: string,
) => {
  const whereEmpresa: any = { estado: true };
  if (empresa_id && empresa_id !== "todas") {
    whereEmpresa.id = Number(empresa_id);
  }

  const empresas = await Empresa.findAll({
    where: whereEmpresa,
    order: [["nombre", "ASC"]],
  });

  let pFinStr = periodo_fin
    ? String(periodo_fin)
    : moment().tz(TIMEZONE).format("YYYY-MM");
  let pInicioStr = periodo_inicio
    ? String(periodo_inicio)
    : moment(pFinStr, "YYYY-MM").subtract(5, "months").format("YYYY-MM");

  if (pInicioStr < PERIODO_INICIAL_NUEVO_SISTEMA) {
    pInicioStr = PERIODO_INICIAL_NUEVO_SISTEMA;
  }

  const companyIds = empresas.map((e) => e.id);

  if (companyIds.length === 0) {
    return {
      periodoInicio: pInicioStr,
      periodoFin: pFinStr,
      empresas: [],
    };
  }

  // Bulk queries filtradas con CASE de normalización de períodos para excluir EDPs antiguos < 2026-07
  const edpsQuery = `
    SELECT *
    FROM estados_cuenta
    WHERE empresa_id IN (:companyIds)
      AND (
        CASE 
          WHEN periodo REGEXP '^[0-9]{4}-[0-9]{2}$' THEN periodo
          ELSE DATE_FORMAT(fecha_generacion, '%Y-%m')
        END
      ) >= :periodoInicial
    ORDER BY fecha_generacion DESC;
  `;

  // Bulk query para movimientos de cuenta corriente del nuevo sistema (excluyendo ajustes de reinicio $0)
  const movsQuery = `
    SELECT *
    FROM cuenta_corriente
    WHERE empresa_id IN (:companyIds)
      AND fecha_movimiento >= :fechaReinicioCC
      AND (referencia IS NULL OR referencia NOT LIKE '%REINICIO%')
      AND (descripcion IS NULL OR (descripcion NOT LIKE '%reinicio%' AND descripcion NOT LIKE '%Ajuste por reinicio%'))
    ORDER BY fecha_movimiento ASC, id ASC;
  `;

  const [allEdpRows, allMovRows] = await Promise.all([
    sequelize.query<any>(edpsQuery, {
      replacements: { companyIds, periodoInicial: PERIODO_INICIAL_NUEVO_SISTEMA },
      type: QueryTypes.SELECT,
    }),
    sequelize.query<any>(movsQuery, {
      replacements: { companyIds, fechaReinicioCC: FECHA_REINICIO_CUENTA_CORRIENTE },
      type: QueryTypes.SELECT,
    }),
  ]);

  // Agrupar en memoria por empresa_id
  const edpsByCompany = new Map<number, any[]>();
  allEdpRows.forEach((edp) => {
    if (!edpsByCompany.has(edp.empresa_id)) {
      edpsByCompany.set(edp.empresa_id, []);
    }
    edpsByCompany.get(edp.empresa_id)!.push(edp);
  });

  const movsByCompany = new Map<number, any[]>();
  allMovRows.forEach((mov) => {
    if (!movsByCompany.has(mov.empresa_id)) {
      movsByCompany.set(mov.empresa_id, []);
    }
    movsByCompany.get(mov.empresa_id)!.push(mov);
  });

  let resultadoEmpresas = empresas.map((emp) => {
    const edps = edpsByCompany.get(emp.id) || [];
    const movimientos = movsByCompany.get(emp.id) || [];

    const totalMontoEDP = edps.reduce(
      (acc, e) => acc + Number(e.monto_facturado || 0),
      0,
    );
    const totalAbonos = movimientos
      .filter((m) => m.tipo_movimiento === "abono")
      .reduce((acc, m) => acc + Number(m.monto || 0), 0);
    const totalCargos = movimientos
      .filter((m) => m.tipo_movimiento === "cargo")
      .reduce((acc, m) => acc + Number(m.monto || 0), 0);

    const ultimoMov =
      movimientos.length > 0 ? movimientos[movimientos.length - 1] : null;
    const saldoFinal = ultimoMov ? Number(ultimoMov.saldo || 0) : 0;

    return {
      empresa: {
        id: emp.id,
        nombre: emp.nombre,
        rut: emp.rut || "-",
        cuentaCorriente:
          emp.cuenta_corriente || `C${String(emp.id).padStart(5, "0")}-1`,
      },
      edps: edps.map((e) => {
        let periodoNorm = e.periodo;
        if (!/^\d{4}-\d{2}$/.test(periodoNorm)) {
          periodoNorm = moment(e.fecha_generacion).tz(TIMEZONE).format("YYYY-MM");
        }
        return {
          id: e.id,
          edpId: `EDP${String(e.id).padStart(4, "0")}`,
          periodo: periodoNorm,
          montoFacturado: Number(e.monto_facturado || 0),
          pagado: Boolean(e.pagado),
          fechaGeneracion: e.fecha_generacion,
          fechaPago: e.fecha_pago,
        };
      }),
      movimientos: movimientos.map((m) => ({
        id: m.id,
        idAbono:
          m.tipo_movimiento === "abono"
            ? `ABON${String(m.id).padStart(4, "0")}`
            : `CARG${String(m.id).padStart(4, "0")}`,
        fechaMovimiento: m.fecha_movimiento,
        tipoMovimiento: m.tipo_movimiento,
        monto: Number(m.monto || 0),
        saldo: Number(m.saldo || 0),
        referencia: m.referencia || "-",
        descripcion: m.descripcion || "",
      })),
      totales: {
        totalMontoEDP,
        totalAbonos,
        totalCargos,
        saldoFinal,
      },
    };
  });

  // Si se consulta "todas las empresas", filtrar solo aquellas con actividad o saldo en el nuevo sistema
  if (!empresa_id || empresa_id === "todas") {
    resultadoEmpresas = resultadoEmpresas.filter(
      (item) =>
        item.edps.length > 0 ||
        item.movimientos.length > 0 ||
        item.totales.saldoFinal !== 0,
    );
  }

  return {
    periodoInicio: pInicioStr,
    periodoFin: pFinStr,
    empresas: resultadoEmpresas,
  };
};

/**
 * 1. Endpoint JSON Estado de Cuenta Global por Período
 */
export const obtenerEstadoCuentaGlobalPeriodo = async (
  req: Request,
  res: Response,
) => {
  try {
    const { meses = "6", periodo_inicio, periodo_fin, empresa_id } = req.query;
    const data = await obtenerEstadoCuentaGlobalPeriodoData(
      String(meses),
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
      empresa_id ? String(empresa_id) : undefined,
    );
    return res.json(data);
  } catch (error: any) {
    console.error("Error en obtenerEstadoCuentaGlobalPeriodo:", error);
    return res.status(500).json({
      message: "Error al generar informe por período",
      error: error.message,
    });
  }
};

/**
 * 2. Exportar Estado de Cuenta Global por Período a Excel (.xlsx)
 */
export const exportarEstadoCuentaGlobalPeriodoExcel = async (
  req: Request,
  res: Response,
) => {
  try {
    const { meses = "6", periodo_inicio, periodo_fin, empresa_id } = req.query;
    const reportData = await obtenerEstadoCuentaGlobalPeriodoData(
      String(meses),
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
      empresa_id ? String(empresa_id) : undefined,
    );

    const { periodos, empresas: empresasData, periodoInicio: pInicioStr, periodoFin: pFinStr } = reportData;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WIT Innovación Tecnológica";
    const sheet = workbook.addWorksheet("Estado de Cuenta x Periodo");

    const totalCols = 3 + periodos.length + 3;

    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = "ESTADO DE CUENTA por Período";
    titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A1A2E" },
    };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(2, 1, 2, totalCols);
    const subtitleCell = sheet.getCell(2, 1);
    subtitleCell.value = `Período [${pInicioStr} a ${pFinStr}]  |  Total Empresas: ${empresasData.length}`;
    subtitleCell.font = { size: 10, italic: true, color: { argb: "FF444444" } };
    subtitleCell.alignment = { horizontal: "right", vertical: "middle" };
    subtitleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF8F9FA" },
    };
    sheet.getRow(2).height = 20;

    sheet.addRow([]);

    const headers = ["ID Empresa", "Empresa", "Cuenta Corriente"];
    periodos.forEach((p) => {
      headers.push(
        `Monto ${moment(p, "YYYY-MM").locale("es").format("MMM YY")}`,
      );
    });
    headers.push("Total EDP", "Total Abono", "Diferencia");

    const headerRow = sheet.getRow(4);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6600" },
      };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE0E0E0" } } };
    });
    headerRow.height = 24;

    empresasData.forEach((emp, rIdx) => {
      const rowVals: any[] = [emp.id, emp.nombre, emp.cuentaCorriente];
      periodos.forEach((p) => {
        rowVals.push(emp.montosPorPeriodo[p] || 0);
      });
      rowVals.push(emp.totalEDP, emp.totalAbono, emp.diferencia);

      const row = sheet.addRow(rowVals);
      row.height = 20;

      const isEven = rIdx % 2 === 0;
      row.eachCell((cell, cIdx) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isEven ? "FFFFFFFF" : "FFFAFAFA" },
        };
        cell.font = { size: 9 };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFE9E9E9" } },
        };

        if (cIdx >= 4) {
          cell.numFmt = '"$"#,##0';
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (cIdx === 1) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }
      });
    });

    const totalesRowVals: any[] = ["TOTALES", "", ""];
    periodos.forEach((p) => {
      const colSum = empresasData.reduce(
        (acc, emp) => acc + (emp.montosPorPeriodo[p] || 0),
        0,
      );
      totalesRowVals.push(colSum);
    });

    totalesRowVals.push(
      reportData.totales.grandTotalEDP,
      reportData.totales.grandTotalAbono,
      reportData.totales.grandDiferencia,
    );

    const totalesRow = sheet.addRow(totalesRowVals);
    sheet.mergeCells(totalesRow.number, 1, totalesRow.number, 3);
    totalesRow.height = 24;

    totalesRow.eachCell((cell, cIdx) => {
      cell.font = { bold: true, size: 10, color: { argb: "FF1A1A2E" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF3E0" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFFF6600" } },
        bottom: { style: "double", color: { argb: "FFFF6600" } },
      };

      if (cIdx >= 4) {
        cell.numFmt = '"$"#,##0';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    });

    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 28;
    sheet.getColumn(3).width = 18;
    for (let i = 4; i <= totalCols; i++) {
      sheet.getColumn(i).width = 16;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Estado_Cuenta_Global_${pInicioStr}_a_${pFinStr}.xlsx`,
    );
    return res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Error al exportar Excel global periodo:", error);
    return res.status(500).json({
      message: "Error al generar archivo Excel",
      error: error.message,
    });
  }
};

/**
 * 3. Endpoint JSON Estado de Cuenta Detallado por Empresa
 */
export const obtenerEstadoCuentaEmpresaDetalle = async (
  req: Request,
  res: Response,
) => {
  try {
    const { empresa_id, periodo, periodo_inicio, periodo_fin } = req.query;
    const data = await obtenerEstadoCuentaEmpresaDetalleData(
      empresa_id ? String(empresa_id) : undefined,
      periodo ? String(periodo) : undefined,
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
    );
    return res.json(data);
  } catch (error: any) {
    console.error("Error en obtenerEstadoCuentaEmpresaDetalle:", error);
    return res.status(500).json({
      message: "Error al consultar detalle por empresa",
      error: error.message,
    });
  }
};

/**
 * 4. Exportar Estado de Cuenta Detallado por Empresa a Excel (.xlsx)
 */
export const exportarEstadoCuentaEmpresaDetalleExcel = async (
  req: Request,
  res: Response,
) => {
  try {
    const { empresa_id, periodo, periodo_inicio, periodo_fin } = req.query;
    const reportData = await obtenerEstadoCuentaEmpresaDetalleData(
      empresa_id ? String(empresa_id) : undefined,
      periodo ? String(periodo) : undefined,
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
    );

    const { empresas, periodoInicio: pInicioStr, periodoFin: pFinStr } = reportData;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WIT Innovación Tecnológica";

    const usedSheetNames = new Set<string>();

    for (const item of empresas) {
      const emp = item.empresa;
      const edps = item.edps;
      const movimientos = item.movimientos;

      const cleanName = emp.nombre.replace(/[*?:/\\\[\]]/g, "").trim();
      let baseName = `${emp.id}-${cleanName}`.substring(0, 31).trim();
      if (!baseName) baseName = `Empresa_${emp.id}`;

      let sheetName = baseName;
      let counter = 1;
      while (usedSheetNames.has(sheetName)) {
        const suffix = `_${counter}`;
        sheetName = `${baseName.substring(0, 31 - suffix.length)}${suffix}`;
        counter++;
      }
      usedSheetNames.add(sheetName);

      const sheet = workbook.addWorksheet(sheetName);

      sheet.mergeCells("A1:G1");
      const titleCell = sheet.getCell("A1");
      titleCell.value = `PULLMAN BUS — ESTADO DE CUENTA DE EMPRESA`;
      titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1A1A2E" },
      };
      sheet.getRow(1).height = 28;

      sheet.mergeCells("A2:G2");
      const subCell = sheet.getCell("A2");
      subCell.value = `Empresa: ${emp.nombre}  |  RUT: ${emp.rut}  |  Cuenta Corriente: ${emp.cuentaCorriente}  |  Período: ${pInicioStr} a ${pFinStr}`;
      subCell.font = { size: 10, color: { argb: "FF444444" } };
      subCell.alignment = { horizontal: "center", vertical: "middle" };
      subCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8F9FA" },
      };
      sheet.getRow(2).height = 20;

      sheet.addRow([]);

      sheet.mergeCells("A4:D4");
      const edpSectionCell = sheet.getCell("A4");
      edpSectionCell.value = "EDP (Estados de Pago Emitidos)";
      edpSectionCell.font = {
        bold: true,
        size: 11,
        color: { argb: "FFFFFFFF" },
      };
      edpSectionCell.alignment = { horizontal: "center", vertical: "middle" };
      edpSectionCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6600" },
      };

      sheet.mergeCells("E4:G4");
      const ccSectionCell = sheet.getCell("E4");
      ccSectionCell.value = "Estado Cuenta Corriente (Movimientos y Abonos)";
      ccSectionCell.font = {
        bold: true,
        size: 11,
        color: { argb: "FFFFFFFF" },
      };
      ccSectionCell.alignment = { horizontal: "center", vertical: "middle" };
      ccSectionCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1A1A2E" },
      };
      sheet.getRow(4).height = 22;

      const hRow = sheet.getRow(5);
      const cols = [
        "EDP ID",
        "Período",
        "Estado",
        "Monto EDP $",
        "ID Mov/Abono",
        "Abono / Cargo $",
        "Saldo $",
      ];
      cols.forEach((colName, cIdx) => {
        const cell = hRow.getCell(cIdx + 1);
        cell.value = colName;
        cell.font = { bold: true, size: 10, color: { argb: "FF333333" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFEEEEEF" },
        };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      });
      hRow.height = 20;

      const maxRows = Math.max(edps.length, movimientos.length, 1);

      let totalEdpMonto = 0;
      let totalAbonoMonto = 0;

      for (let i = 0; i < maxRows; i++) {
        const edp = edps[i];
        const mov = movimientos[i];

        const edpIdStr = edp ? edp.edpId : "-";
        const edpPeriodoStr = edp ? edp.periodo : "-";
        const edpEstadoStr = edp ? (edp.pagado ? "Pagado" : "Pendiente") : "-";
        const edpMonto = edp ? edp.montoFacturado : null;

        if (edpMonto) totalEdpMonto += edpMonto;

        const movIdStr = mov ? mov.idAbono : "-";
        const movMonto = mov ? mov.monto : null;
        const movSaldo = mov ? mov.saldo : null;

        if (mov && mov.tipoMovimiento === "abono" && !mov.referencia?.includes("REINICIO")) {
          totalAbonoMonto += mov.monto;
        }

        const row = sheet.addRow([
          edpIdStr,
          edpPeriodoStr,
          edpEstadoStr,
          edpMonto !== null ? edpMonto : "-",
          movIdStr,
          movMonto !== null ? movMonto : "-",
          movSaldo !== null ? movSaldo : "-",
        ]);
        row.height = 18;

        row.eachCell((cell, cIdx) => {
          cell.font = { size: 9 };
          cell.alignment = { vertical: "middle" };

          if (cIdx === 4 || cIdx === 6 || cIdx === 7) {
            if (typeof cell.value === "number") {
              cell.numFmt = '"$"#,##0';
              cell.alignment = { horizontal: "right", vertical: "middle" };
            }
          } else {
            cell.alignment = { horizontal: "center", vertical: "middle" };
          }
        });
      }

      const totalesRow = sheet.addRow([
        "TOTAL EDPs",
        "",
        "",
        totalEdpMonto,
        "TOTAL ABONOS",
        totalAbonoMonto,
        totalEdpMonto - totalAbonoMonto,
      ]);

      totalesRow.height = 22;
      totalesRow.eachCell((cell, cIdx) => {
        cell.font = { bold: true, size: 10 };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFF3E0" },
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFFF6600" } },
          bottom: { style: "double", color: { argb: "FFFF6600" } },
        };

        if (typeof cell.value === "number") {
          cell.numFmt = '"$"#,##0';
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });

      sheet.getColumn(1).width = 14;
      sheet.getColumn(2).width = 14;
      sheet.getColumn(3).width = 14;
      sheet.getColumn(4).width = 18;
      sheet.getColumn(5).width = 16;
      sheet.getColumn(6).width = 18;
      sheet.getColumn(7).width = 18;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Estado_Cuenta_Empresa_Detalle_${pInicioStr}_a_${pFinStr}.xlsx`,
    );
    return res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error("Error al exportar Excel empresa detalle:", error);
    return res.status(500).json({
      message: "Error al generar archivo Excel",
      error: error.message,
    });
  }
};
