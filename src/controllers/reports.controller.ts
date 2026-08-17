import { Request, Response } from "express";
import { Empresa } from "../models/empresa.model";
import { sequelize } from "../database";
import { QueryTypes } from "sequelize";
import moment from "moment-timezone";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const TIMEZONE = "America/Santiago";

const PERIODO_NUEVO_SISTEMA = "2026-07";
const FECHA_REINICIO_CC = "2026-07-01 00:00:00";
const REFERENCIA_REINICIO = "REINICIO-SISTEMA-2026-08-04";

const CLP = (n: number) =>
  `$${Math.round(Number(n || 0)).toLocaleString("es-CL")}`;

const generarPeriodos = (ini: string, fin: string): string[] => {
  const list: string[] = [];
  let cur = moment.tz(ini, "YYYY-MM", TIMEZONE).startOf("month");
  const end = moment.tz(fin, "YYYY-MM", TIMEZONE).startOf("month");
  while (cur.isSameOrBefore(end)) {
    list.push(cur.format("YYYY-MM"));
    cur.add(1, "month");
  }
  return list;
};

const getGlobalPeriodoData = async (
  meses: string = "6",
  periodo_inicio?: string,
  periodo_fin?: string,
  empresa_id?: string,
) => {
  let pFin = periodo_fin
    ? String(periodo_fin)
    : moment().tz(TIMEZONE).format("YYYY-MM");
  let pIni = periodo_inicio
    ? String(periodo_inicio)
    : moment(pFin, "YYYY-MM")
        .tz(TIMEZONE)
        .subtract(Number(meses) - 1, "months")
        .format("YYYY-MM");

  if (pIni < PERIODO_NUEVO_SISTEMA) pIni = PERIODO_NUEVO_SISTEMA;

  const periodos = generarPeriodos(pIni, pFin);

  const filterEmpresa =
    empresa_id && empresa_id !== "todas" ? "AND e.id = :empresaId" : "";
  const filterCcEmpresa =
    empresa_id && empresa_id !== "todas" ? "AND empresa_id = :empresaId" : "";

  const replacements: any = {
    periodos,
    empresaId: Number(empresa_id),
    periodoInicial: PERIODO_NUEVO_SISTEMA,
    fechaReinicio: FECHA_REINICIO_CC,
    referenciaReinicio: REFERENCIA_REINICIO,
  };

  const edpsSql = `
    SELECT
      e.id AS empresa_id,
      e.nombre,
      COALESCE(NULLIF(e.cuenta_corriente,''), CONCAT('C', LPAD(e.id,5,'0'), '-1')) AS cuenta_corriente,
      CASE
        WHEN ec.periodo REGEXP '^[0-9]{4}-[0-9]{2}$' THEN ec.periodo
        ELSE DATE_FORMAT(ec.fecha_generacion,'%Y-%m')
      END AS periodo,
      COALESCE(SUM(ec.monto_facturado), 0) AS monto_facturado
    FROM empresas e
    INNER JOIN estados_cuenta ec ON e.id = ec.empresa_id
      AND (
        CASE WHEN ec.periodo REGEXP '^[0-9]{4}-[0-9]{2}$' THEN ec.periodo
             ELSE DATE_FORMAT(ec.fecha_generacion,'%Y-%m') END
      ) >= :periodoInicial
      AND (
        CASE WHEN ec.periodo REGEXP '^[0-9]{4}-[0-9]{2}$' THEN ec.periodo
             ELSE DATE_FORMAT(ec.fecha_generacion,'%Y-%m') END
      ) IN (:periodos)
    WHERE e.estado = 1 ${filterEmpresa}
    GROUP BY e.id, e.nombre, e.cuenta_corriente, periodo
    ORDER BY e.nombre ASC
  `;

  const abonosSql = `
    SELECT empresa_id, COALESCE(SUM(monto), 0) AS total_abonos
    FROM cuenta_corriente
    WHERE tipo_movimiento = 'abono'
      AND fecha_movimiento >= :fechaReinicio
      AND referencia != :referenciaReinicio
      ${filterCcEmpresa}
    GROUP BY empresa_id
  `;

  const cargosSql = `
    SELECT empresa_id, COALESCE(SUM(monto), 0) AS total_cargos
    FROM cuenta_corriente
    WHERE tipo_movimiento = 'cargo'
      AND fecha_movimiento >= :fechaReinicio
      AND referencia != :referenciaReinicio
      ${filterCcEmpresa}
    GROUP BY empresa_id
  `;

  // Obtener el saldo del movimiento de reinicio como punto de partida
  const saldosSql = `
    SELECT empresa_id, COALESCE(saldo, 0) AS saldo
    FROM cuenta_corriente
    WHERE referencia = :referenciaReinicio
      ${filterCcEmpresa}
  `;

  const empresasActivas = await Empresa.findAll({
    where:
      empresa_id && empresa_id !== "todas"
        ? { id: Number(empresa_id), estado: true }
        : { estado: true },
    order: [["nombre", "ASC"]],
  });

  const [edpRows, abonoRows, cargoRows, saldoRows] = await Promise.all([
    sequelize.query<any>(edpsSql, { replacements, type: QueryTypes.SELECT }),
    sequelize.query<any>(abonosSql, { replacements, type: QueryTypes.SELECT }),
    sequelize.query<any>(cargosSql, { replacements, type: QueryTypes.SELECT }),
    sequelize.query<any>(saldosSql, { replacements, type: QueryTypes.SELECT }),
  ]);

  const abonosMap = new Map<number, number>();
  abonoRows.forEach((r) =>
    abonosMap.set(Number(r.empresa_id), Number(r.total_abonos || 0)),
  );

  const cargosMap = new Map<number, number>();
  cargoRows.forEach((r) =>
    cargosMap.set(Number(r.empresa_id), Number(r.total_cargos || 0)),
  );

  const saldosReinicioMap = new Map<number, number>();
  saldoRows.forEach((r) =>
    saldosReinicioMap.set(Number(r.empresa_id), Number(r.saldo || 0)),
  );

  const edpMap = new Map<string, number>();
  edpRows.forEach((row) =>
    edpMap.set(
      `${row.empresa_id}_${row.periodo}`,
      Number(row.monto_facturado || 0),
    ),
  );

  const empresas = empresasActivas.map((emp) => {
    const montosPorPeriodo: Record<string, number> = {};
    let totalEDP = 0;
    periodos.forEach((p) => {
      const m = edpMap.get(`${emp.id}_${p}`) || 0;
      montosPorPeriodo[p] = m;
      totalEDP += m;
    });

    const totalAbono = abonosMap.get(emp.id) || 0;
    const totalCargo = cargosMap.get(emp.id) || 0;

    // Forzado a 0 para no arrastrar ningún saldo histórico de reinicio
    const saldoReinicio = 0;

    // Cálculo matemático contable de saldo actual de la cuenta corriente
    const saldoActual = totalCargo - totalAbono;

    const ctaCte =
      emp.cuenta_corriente || `C${String(emp.id).padStart(5, "0")}-1`;

    return {
      id: emp.id,
      nombre: emp.nombre,
      cuentaCorriente: ctaCte,
      montosPorPeriodo,
      totalEDP,
      totalAbono,
      saldoActual,
    };
  });

  // Filtrar empresas sin actividad en el nuevo sistema
  const empresasFiltradas =
    empresa_id && empresa_id !== "todas"
      ? empresas
      : empresas.filter(
          (e) => e.totalEDP > 0 || e.totalAbono > 0 || e.saldoActual !== 0,
        );

  const totalesPorPeriodo: Record<string, number> = {};
  periodos.forEach((p) => {
    totalesPorPeriodo[p] = empresasFiltradas.reduce(
      (acc, e) => acc + (e.montosPorPeriodo[p] || 0),
      0,
    );
  });

  return {
    periodoInicio: pIni,
    periodoFin: pFin,
    periodos,
    empresas: empresasFiltradas,
    totales: {
      totalesPorPeriodo,
      grandTotalEDP: empresasFiltradas.reduce((a, e) => a + e.totalEDP, 0),
      grandTotalAbono: empresasFiltradas.reduce((a, e) => a + e.totalAbono, 0),
      grandSaldoActual: empresasFiltradas.reduce(
        (a, e) => a + e.saldoActual,
        0,
      ),
      grandDiferencia: empresasFiltradas.reduce((a, e) => a + e.saldoActual, 0),
    },
  };
};

const getEmpresaDetalleData = async (
  empresa_id?: string,
  periodo_inicio?: string,
  periodo_fin?: string,
) => {
  const whereEmpresa: any = { estado: true };
  if (empresa_id && empresa_id !== "todas")
    whereEmpresa.id = Number(empresa_id);

  const empresas = await Empresa.findAll({
    where: whereEmpresa,
    order: [["nombre", "ASC"]],
  });
  if (empresas.length === 0) {
    return {
      periodoInicio: PERIODO_NUEVO_SISTEMA,
      periodoFin: moment().tz(TIMEZONE).format("YYYY-MM"),
      empresas: [],
    };
  }

  let pFin = periodo_fin
    ? String(periodo_fin)
    : moment().tz(TIMEZONE).format("YYYY-MM");
  let pIni = periodo_inicio
    ? String(periodo_inicio)
    : moment(pFin, "YYYY-MM").subtract(5, "months").format("YYYY-MM");
  if (pIni < PERIODO_NUEVO_SISTEMA) pIni = PERIODO_NUEVO_SISTEMA;

  const companyIds = empresas.map((e) => e.id);

  const edpsSql = `
    SELECT *
    FROM estados_cuenta
    WHERE empresa_id IN (:companyIds)
      AND (
        CASE WHEN periodo REGEXP '^[0-9]{4}-[0-9]{2}$' THEN periodo
             ELSE DATE_FORMAT(fecha_generacion,'%Y-%m') END
      ) >= :periodoInicial
    ORDER BY empresa_id ASC, fecha_generacion ASC
  `;

  const movsSql = `
    SELECT *
    FROM cuenta_corriente
    WHERE empresa_id IN (:companyIds)
      AND fecha_movimiento >= :fechaReinicio
    ORDER BY empresa_id ASC, fecha_movimiento ASC, id ASC
  `;

  const [allEdpRows, allMovRows] = await Promise.all([
    sequelize.query<any>(edpsSql, {
      replacements: { companyIds, periodoInicial: PERIODO_NUEVO_SISTEMA },
      type: QueryTypes.SELECT,
    }),
    sequelize.query<any>(movsSql, {
      replacements: { companyIds, fechaReinicio: FECHA_REINICIO_CC },
      type: QueryTypes.SELECT,
    }),
  ]);

  const edpsByCompany = new Map<number, any[]>();
  allEdpRows.forEach((edp) => {
    if (!edpsByCompany.has(edp.empresa_id))
      edpsByCompany.set(edp.empresa_id, []);
    edpsByCompany.get(edp.empresa_id)!.push(edp);
  });

  const movsByCompany = new Map<number, any[]>();
  allMovRows.forEach((mov) => {
    if (!movsByCompany.has(mov.empresa_id))
      movsByCompany.set(mov.empresa_id, []);
    movsByCompany.get(mov.empresa_id)!.push(mov);
  });

  let resultado = empresas.map((emp) => {
    const edps = edpsByCompany.get(emp.id) || [];
    const movimientos = movsByCompany.get(emp.id) || [];

    const movReinicio = movimientos.find(
      (m) => m.referencia === REFERENCIA_REINICIO,
    );
    const movsNormales = movimientos.filter(
      (m) => m.referencia !== REFERENCIA_REINICIO,
    );

    // Forzado a 0 para no arrastrar deudas históricas
    const saldoReinicio = 0;

    const totalEDP = edps.reduce(
      (a, e) => a + Number(e.monto_facturado || 0),
      0,
    );
    const totalAbonos = movsNormales
      .filter((m) => m.tipo_movimiento === "abono")
      .reduce((a, m) => a + Number(m.monto || 0), 0);
    const totalCargos = movsNormales
      .filter((m) => m.tipo_movimiento === "cargo")
      .reduce((a, m) => a + Number(m.monto || 0), 0);

    // Saldo Final se calcula de forma pura basado en cargos y abonos reales en la cuenta corriente
    const saldoFinal = totalCargos - totalAbonos;

    const ctaCte =
      emp.cuenta_corriente || `C${String(emp.id).padStart(5, "0")}-1`;

    // Calcular saldo acumulado en caliente de forma cronológica pura
    let runningBalance = 0;
    const movimientosMapeados = movsNormales.map((m) => {
      const monto = Number(m.monto || 0);
      if (m.tipo_movimiento === "cargo") {
        runningBalance += monto;
      } else if (m.tipo_movimiento === "abono") {
        runningBalance -= monto;
      }
      return {
        id: m.id,
        idMov:
          m.tipo_movimiento === "abono"
            ? `ABON${String(m.id).padStart(4, "0")}`
            : `CARG${String(m.id).padStart(4, "0")}`,
        fechaMovimiento: m.fecha_movimiento,
        tipoMovimiento: m.tipo_movimiento,
        monto,
        saldo: runningBalance,
        referencia: m.referencia || "-",
        descripcion: m.descripcion || "",
      };
    });

    return {
      empresa: {
        id: emp.id,
        nombre: emp.nombre,
        rut: emp.rut || "-",
        cuentaCorriente: ctaCte,
      },
      saldoReinicio,
      edps: edps.map((e) => {
        let periodoNorm = e.periodo;
        if (!/^\d{4}-\d{2}$/.test(periodoNorm)) {
          periodoNorm = moment(e.fecha_generacion)
            .tz(TIMEZONE)
            .format("YYYY-MM");
        }
        return {
          id: e.id,
          edpId: `EDP${String(e.id).padStart(4, "0")}`,
          periodo: periodoNorm,
          montoFacturado: Number(e.monto_facturado || 0),
          pagado: Boolean(e.pagado),
          fechaGeneracion: e.fecha_generacion,
        };
      }),
      movimientos: movimientosMapeados,
      totales: { totalEDP, totalAbonos, totalCargos, saldoFinal },
    };
  });

  if (!empresa_id || empresa_id === "todas") {
    resultado = resultado.filter(
      (r) =>
        r.edps.length > 0 || r.movimientos.length > 0 || r.saldoReinicio !== 0,
    );
  }

  return { periodoInicio: pIni, periodoFin: pFin, empresas: resultado };
};

export const obtenerEstadoCuentaGlobalPeriodo = async (
  req: Request,
  res: Response,
) => {
  try {
    const { meses = "6", periodo_inicio, periodo_fin, empresa_id } = req.query;
    const data = await getGlobalPeriodoData(
      String(meses),
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
      empresa_id ? String(empresa_id) : undefined,
    );
    return res.json(data);
  } catch (err: any) {
    console.error("Error obtenerEstadoCuentaGlobalPeriodo:", err);
    return res.status(500).json({
      message: "Error al generar informe por periodo",
      error: err.message,
    });
  }
};

export const obtenerEstadoCuentaEmpresaDetalle = async (
  req: Request,
  res: Response,
) => {
  try {
    const { empresa_id, periodo_inicio, periodo_fin } = req.query;
    const data = await getEmpresaDetalleData(
      empresa_id ? String(empresa_id) : undefined,
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
    );
    return res.json(data);
  } catch (err: any) {
    console.error("Error obtenerEstadoCuentaEmpresaDetalle:", err);
    return res.status(500).json({
      message: "Error al consultar detalle por empresa",
      error: err.message,
    });
  }
};

export const exportarEstadoCuentaGlobalPeriodoExcel = async (
  req: Request,
  res: Response,
) => {
  try {
    const { meses = "6", periodo_inicio, periodo_fin, empresa_id } = req.query;
    const report = await getGlobalPeriodoData(
      String(meses),
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
      empresa_id ? String(empresa_id) : undefined,
    );
    const {
      periodos,
      empresas,
      periodoInicio: pIni,
      periodoFin: pFin,
      totales,
    } = report;

    const wb = new ExcelJS.Workbook();
    wb.creator = "WIT Innovacion Tecnologica";
    const ws = wb.addWorksheet("Estado Cuenta Global");

    const totalCols = 3 + periodos.length + 3;

    ws.mergeCells(1, 1, 1, totalCols);
    const tCell = ws.getCell(1, 1);
    tCell.value = "ESTADO DE CUENTA GLOBAL — POR PERIODO";
    tCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    tCell.alignment = { horizontal: "center", vertical: "middle" };
    tCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A1A2E" },
    };
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, totalCols);
    const sCell = ws.getCell(2, 1);
    sCell.value = `Periodo: ${pIni} a ${pFin}  |  Empresas: ${empresas.length}  |  Generado: ${moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm")}`;
    sCell.font = { size: 9, italic: true, color: { argb: "FF555555" } };
    sCell.alignment = { horizontal: "right", vertical: "middle" };
    sCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF8F9FA" },
    };
    ws.getRow(2).height = 16;

    ws.addRow([]);

    const headers = ["ID", "Empresa", "Cta. Corriente"];
    periodos.forEach((p) => headers.push(p));
    headers.push("Total EDP", "Total Abono", "Saldo Actual");

    const hRow = ws.getRow(4);
    headers.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6600" },
      };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE0E0E0" } } };
    });
    hRow.height = 22;

    empresas.forEach((emp, rIdx) => {
      const vals: any[] = [emp.id, emp.nombre, emp.cuentaCorriente];
      periodos.forEach((p) => vals.push(emp.montosPorPeriodo[p] || 0));
      vals.push(emp.totalEDP, emp.totalAbono, emp.saldoActual);

      const row = ws.addRow(vals);
      row.height = 18;
      const isEven = rIdx % 2 === 0;

      row.eachCell((cell, cIdx) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isEven ? "FFFFFFFF" : "FFFAFAFA" },
        };
        cell.font = { size: 9 };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFEAEAEA" } },
        };

        if (cIdx >= 4) {
          if (cIdx === totalCols - 1) {
            cell.font = { size: 9, bold: true, color: { argb: "FF1F994D" } };
          } else if (cIdx === totalCols) {
            const val = Number(cell.value);
            cell.font = {
              size: 9,
              bold: true,
              color: {
                argb: val > 0 ? "FFCC6600" : val < 0 ? "FF1F994D" : "FF555555",
              },
            };
          }
          cell.numFmt = '"$"#,##0';
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (cIdx === 1) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }
      });
    });

    const totRow: any[] = ["TOTALES", "", ""];
    periodos.forEach((p) => totRow.push(totales.totalesPorPeriodo[p] || 0));
    totRow.push(
      totales.grandTotalEDP,
      totales.grandTotalAbono,
      totales.grandSaldoActual,
    );

    const tRow = ws.addRow(totRow);
    ws.mergeCells(tRow.number, 1, tRow.number, 3);
    tRow.height = 22;
    tRow.eachCell((cell, cIdx) => {
      let cellColor = "FF1A1A2E";
      if (cIdx === totalCols - 1) {
        cellColor = "FF1F994D";
      } else if (cIdx === totalCols) {
        const val = Number(cell.value);
        cellColor = val > 0 ? "FFCC6600" : val < 0 ? "FF1F994D" : "FF1A1A2E";
      }

      cell.font = { bold: true, size: 10, color: { argb: cellColor } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF3E0" },
      };
      cell.border = {
        top: { style: "medium", color: { argb: "FFFF6600" } },
        bottom: { style: "double", color: { argb: "FFFF6600" } },
      };
      if (cIdx >= 4) {
        cell.numFmt = '"$"#,##0';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    });

    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 18;
    for (let i = 4; i <= totalCols; i++) ws.getColumn(i).width = 15;

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Estado_Cuenta_Global_${pIni}_${pFin}.xlsx`,
    );
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("Error exportarEstadoCuentaGlobalPeriodoExcel:", err);
    return res
      .status(500)
      .json({ message: "Error al generar Excel", error: err.message });
  }
};

export const exportarEstadoCuentaEmpresaDetalleExcel = async (
  req: Request,
  res: Response,
) => {
  try {
    const { empresa_id, periodo_inicio, periodo_fin } = req.query;
    const report = await getEmpresaDetalleData(
      empresa_id ? String(empresa_id) : undefined,
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
    );
    const { empresas, periodoInicio: pIni, periodoFin: pFin } = report;

    const wb = new ExcelJS.Workbook();
    wb.creator = "WIT Innovacion Tecnologica";
    const usedNames = new Set<string>();

    for (const item of empresas) {
      const emp = item.empresa;
      const edps = item.edps;
      const movs = item.movimientos;

      const cleanName = emp.nombre.replace(/[*?:/\\[\]]/g, "").trim();
      let baseName =
        `${emp.id}-${cleanName}`.substring(0, 31).trim() || `Empresa_${emp.id}`;
      let sheetName = baseName;
      let counter = 1;
      while (usedNames.has(sheetName)) {
        const suf = `_${counter++}`;
        sheetName = `${baseName.substring(0, 31 - suf.length)}${suf}`;
      }
      usedNames.add(sheetName);

      const ws = wb.addWorksheet(sheetName);

      // Titulo superior
      ws.mergeCells("A1:G1");
      const t1 = ws.getCell("A1");
      t1.value = `ESTADO DE CUENTA DETALLADO — ${emp.nombre.toUpperCase()}`;
      t1.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
      t1.alignment = { horizontal: "center", vertical: "middle" };
      t1.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1A1A2E" },
      };
      ws.getRow(1).height = 28;

      // Periodo y metadata en fila 2
      ws.mergeCells("A2:G2");
      const t2 = ws.getCell("A2");
      t2.value = `RUT: ${emp.rut}  |  Cuenta Corriente: ${emp.cuentaCorriente}  |  Periodo [${pIni} a ${pFin}]  |  Generado: ${moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm")}`;
      t2.font = { size: 9, italic: true, color: { argb: "FF555555" } };
      t2.alignment = { horizontal: "right", vertical: "middle" };
      t2.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8F9FA" },
      };
      ws.getRow(2).height = 16;

      ws.addRow([]);

      // Headers de Columnas (Fila 4)
      const colHeaders = [
        "EDP ID",
        "Empresa",
        "Cuenta corriente",
        "Monto $",
        "Fecha Abono",
        "Abono $",
        "Saldo$",
      ];
      const hRow = ws.getRow(4);
      colHeaders.forEach((h, idx) => {
        const cell = hRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF6600" },
        };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        };
        if (idx === 3 || idx === 5 || idx === 6) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
      hRow.height = 22;

      // Cargar Filas Apareadas (Fila 5 en adelante)
      const maxRows = Math.max(edps.length, movs.length);
      for (let i = 0; i < maxRows; i++) {
        const edp = edps[i];
        const mov = movs[i];
        const isEven = i % 2 === 0;

        const fechaAbonoStr =
          mov && mov.fechaMovimiento
            ? moment(mov.fechaMovimiento).tz(TIMEZONE).format("DD-MM-YYYY")
            : "";

        const rowValues = [
          edp ? edp.edpId : "",
          edp ? emp.nombre : "",
          edp ? emp.cuentaCorriente : "",
          edp ? edp.montoFacturado : 0,
          fechaAbonoStr,
          mov ? (mov.tipoMovimiento === "abono" ? mov.monto : -mov.monto) : 0,
          mov ? mov.saldo : 0,
        ];

        const r = ws.addRow(rowValues);
        r.height = 18;

        r.eachCell((cell, colIdx) => {
          cell.font = { size: 9 };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: isEven ? "FFFFFFFF" : "FFFAFAFA" },
          };
          cell.border = {
            bottom: { style: "hair", color: { argb: "FFEAEAEA" } },
          };

          if (colIdx === 4 || colIdx === 6 || colIdx === 7) {
            if (cell.value !== null && typeof cell.value === "number") {
              cell.numFmt = '"$"#,##0;[Red]"-$"#,##0';
              cell.alignment = { horizontal: "right", vertical: "middle" };
              if (colIdx === 6) {
                // Abonos en verde esmeralda
                cell.font = {
                  size: 9,
                  bold: true,
                  color: { argb: "FF1F994D" },
                };
              } else if (colIdx === 7) {
                const val = Number(cell.value);
                cell.font = {
                  size: 9,
                  bold: true,
                  color: { argb: val > 0 ? "FFCC6600" : "FF1F994D" },
                };
              }
            }
          } else if (colIdx === 1 || colIdx === 5) {
            cell.alignment = { horizontal: "center", vertical: "middle" };
          } else {
            cell.alignment = { horizontal: "left", vertical: "middle" };
          }
        });
      }

      // Fila de Totales
      const totalEDP = item.totales.totalEDP;
      const totalAbonos = item.totales.totalAbonos;
      const saldoFinal = item.totales.saldoFinal;

      const totRow = ["TOTALES", "", "", totalEDP, "", totalAbonos, saldoFinal];
      const tRow = ws.addRow(totRow);
      ws.mergeCells(tRow.number, 1, tRow.number, 3);
      tRow.height = 22;

      tRow.eachCell((cell, colIdx) => {
        let cellColor = "FF1A1A2E";
        if (colIdx === 6) {
          cellColor = "FF1F994D";
        } else if (colIdx === 7) {
          cellColor = saldoFinal > 0 ? "FFCC6600" : "FF1F994D";
        }

        cell.font = { bold: true, size: 10, color: { argb: cellColor } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFF3E0" },
        };
        cell.border = {
          top: { style: "medium", color: { argb: "FFFF6600" } },
          bottom: { style: "double", color: { argb: "FFFF6600" } },
        };

        if (colIdx === 4 || colIdx === 6 || colIdx === 7) {
          cell.numFmt = '"$"#,##0';
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });

      // Ancho de columnas para la hoja actual
      ws.getColumn(1).width = 12;
      ws.getColumn(2).width = 25;
      ws.getColumn(3).width = 16;
      ws.getColumn(4).width = 15;
      ws.getColumn(5).width = 12;
      ws.getColumn(6).width = 15;
      ws.getColumn(7).width = 15;
    }

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Estado_Cuenta_Empresa_${report.periodoInicio}_${report.periodoFin}.xlsx`,
    );
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("Error exportarEstadoCuentaEmpresaDetalleExcel:", err);
    return res
      .status(500)
      .json({ message: "Error al generar Excel", error: err.message });
  }
};

export const exportarEstadoCuentaGlobalPeriodoPDF = async (
  req: Request,
  res: Response,
) => {
  try {
    const { meses = "6", periodo_inicio, periodo_fin, empresa_id } = req.query;
    const report = await getGlobalPeriodoData(
      String(meses),
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
      empresa_id ? String(empresa_id) : undefined,
    );
    const {
      periodos,
      empresas,
      periodoInicio: pIni,
      periodoFin: pFin,
      totales,
    } = report;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageW = 842,
      pageH = 595,
      margin = 32;
    const cHeader = rgb(0.1, 0.1, 0.18);
    const cAccent = rgb(1, 0.4, 0);
    const cWhite = rgb(1, 1, 1);
    const cGray = rgb(0.45, 0.45, 0.45);
    const cEven = rgb(0.97, 0.97, 0.97);
    const cFoot = rgb(1, 0.95, 0.88);
    const cGreen = rgb(0.12, 0.6, 0.3);
    const cAmber = rgb(0.75, 0.45, 0.05);

    const usable = pageW - margin * 2;
    const colID = 28;
    const colCC = 72;
    const tailW = 100;
    const tailN = 3;

    // Calculamos el ancho de periodos dinámicamente
    // Garantizamos que empresa tenga al menos 120px de espacio libre.
    const spaceForPeriods = usable - colID - colCC - (tailW * tailN) - 120;
    const perW = periodos.length > 0
      ? Math.max(30, Math.min(42, Math.floor(spaceForPeriods / periodos.length)))
      : 42;

    // Tamaño de fuente dinámico según el ancho de columna disponible
    const fSizePeriod = perW < 36 ? 5.2 : 6.5;

    const fixedRest = colID + colCC + (perW * periodos.length) + (tailW * tailN);
    const colEmp = Math.max(120, usable - fixedRest);

    const tableW = usable;
    const rowH = 15,
      headH = 18;

    const rowsPerPage = Math.floor((pageH - margin * 2 - 60 - headH) / rowH);
    const chunks: any[][] = [];
    for (let i = 0; i < empresas.length; i += rowsPerPage)
      chunks.push(empresas.slice(i, i + rowsPerPage));
    if (chunks.length === 0) chunks.push([]);
    const totalPgs = chunks.length;

    for (let pi = 0; pi < totalPgs; pi++) {
      const page = pdfDoc.addPage([pageW, pageH]);
      let y = pageH - margin;

      page.drawRectangle({
        x: margin,
        y: y - 30,
        width: tableW,
        height: 30,
        color: cHeader,
      });
      page.drawText("ESTADO DE CUENTA GLOBAL — POR PERIODO", {
        x: margin + 8,
        y: y - 19,
        size: 11,
        font: fontBold,
        color: cWhite,
      });
      page.drawText(
        `Periodo: ${pIni} a ${pFin}  |  Empresas: ${empresas.length}  |  Pág. ${pi + 1}/${totalPgs}  |  ${moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm")}`,
        { x: margin + 8, y: y - 40, size: 6.5, font, color: cGray },
      );
      const drawH = (text: string, cx: number, cw: number, right = false, customSize = 6.5) => {
        page.drawRectangle({
          x: cx,
          y: y - headH,
          width: cw,
          height: headH,
          color: cAccent,
        });
        page.drawText(text, {
          x: right
            ? cx + cw - fontBold.widthOfTextAtSize(text, customSize) - 2
            : cx + 2,
          y: y - headH + 5,
          size: customSize,
          font: fontBold,
          color: cWhite,
          maxWidth: cw - 4,
        });
      };
      y -= 48;

      let cx = margin;
      drawH("ID", cx, colID);
      cx += colID;
      drawH("Empresa", cx, colEmp);
      cx += colEmp;
      drawH("Cta. Cte.", cx, colCC);
      cx += colCC;
      for (const p of periodos) {
        drawH(
          p,
          cx,
          perW,
          true,
          fSizePeriod
        );
        cx += perW;
      }
      drawH("Total EDP", cx, tailW, true);
      cx += tailW;
      drawH("Total Abono", cx, tailW, true);
      cx += tailW;
      drawH("Saldo Actual", cx, tailW, true);
      y -= headH;

      for (let ri = 0; ri < chunks[pi].length; ri++) {
        const emp = chunks[pi][ri];
        const bg = ri % 2 === 0 ? cWhite : cEven;
        page.drawRectangle({
          x: margin,
          y: y - rowH,
          width: tableW,
          height: rowH,
          color: bg,
        });

        let fx = margin;
        const drawC = (
          text: string,
          fw: number,
          right = false,
          clr = rgb(0.1, 0.1, 0.1),
          customSize = 6.5
        ) => {
          const maxW = fw - 4;
          let renderVal = String(text);
          let textW = font.widthOfTextAtSize(renderVal, customSize);
          if (textW > maxW) {
            while (renderVal.length > 0 && textW > maxW) {
              renderVal = renderVal.slice(0, -1);
              textW = font.widthOfTextAtSize(renderVal + "...", customSize);
            }
            renderVal = renderVal + "...";
          }
          page.drawText(renderVal, {
            x: right ? fx + fw - textW - 2 : fx + 2,
            y: y - rowH + 4,
            size: customSize,
            font,
            color: clr,
          });
          fx += fw;
        };

        drawC(String(emp.id), colID);
        drawC(emp.nombre, colEmp);
        drawC(emp.cuentaCorriente, colCC);
        for (const p of periodos)
          drawC(CLP(emp.montosPorPeriodo[p] || 0), perW, true, rgb(0.1, 0.1, 0.1), fSizePeriod);
        drawC(CLP(emp.totalEDP), tailW, true);
        drawC(CLP(emp.totalAbono), tailW, true, cGreen);
        drawC(
          CLP(emp.saldoActual),
          tailW,
          true,
          emp.saldoActual > 0 ? cAmber : cGreen,
        );
        y -= rowH;
      }

      if (pi === totalPgs - 1) {
        page.drawRectangle({
          x: margin,
          y: y - rowH,
          width: tableW,
          height: rowH,
          color: cFoot,
        });
        page.drawText("TOTALES", {
          x: margin + 2,
          y: y - rowH + 4,
          size: 6.5,
          font: fontBold,
          color: cHeader,
        });
        let tx = margin + colID + colEmp + colCC;
        for (const p of periodos) {
          const v = CLP(totales.totalesPorPeriodo[p] || 0);
          page.drawText(v, {
            x: tx + perW - fontBold.widthOfTextAtSize(v, fSizePeriod) - 2,
            y: y - rowH + 4,
            size: fSizePeriod,
            font: fontBold,
            color: cHeader,
            maxWidth: perW - 4,
          });
          tx += perW;
        }
        const drawTotal = (v: string, w: number, clr: any) => {
          page.drawText(v, {
            x: tx + w - fontBold.widthOfTextAtSize(v, 6.5) - 2,
            y: y - rowH + 4,
            size: 6.5,
            font: fontBold,
            color: clr,
            maxWidth: w - 4,
          });
          tx += w;
        };
        drawTotal(CLP(totales.grandTotalEDP), tailW, cHeader);
        drawTotal(CLP(totales.grandTotalAbono), tailW, cGreen);
        drawTotal(
          CLP(totales.grandSaldoActual),
          tailW,
          totales.grandSaldoActual > 0 ? cAmber : cGreen,
        );
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Estado_Cuenta_Global_${pIni}_${pFin}.pdf`,
    );
    return res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error("Error exportarEstadoCuentaGlobalPeriodoPDF:", err);
    return res
      .status(500)
      .json({ message: "Error al generar PDF", error: err.message });
  }
};

export const exportarEstadoCuentaEmpresaDetallePDF = async (
  req: Request,
  res: Response,
) => {
  try {
    const { empresa_id, periodo_inicio, periodo_fin } = req.query;
    const report = await getEmpresaDetalleData(
      empresa_id ? String(empresa_id) : undefined,
      periodo_inicio ? String(periodo_inicio) : undefined,
      periodo_fin ? String(periodo_fin) : undefined,
    );
    const { empresas, periodoInicio: pIni, periodoFin: pFin } = report;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageW = 842,
      pageH = 595,
      margin = 32;
    const cWhite = rgb(1, 1, 1);
    const cGray = rgb(0.2, 0.2, 0.2);
    const cEven = rgb(0.98, 0.98, 0.98);

    const colW = [60, 180, 110, 95, 80, 95, 100];
    const colX: number[] = [];
    let curX = margin;
    colW.forEach((w) => {
      colX.push(curX);
      curX += w;
    });
    const tableW = curX - margin;

    const rowH = 15;
    const headerH = 20;

    const cHeader = rgb(0.1, 0.1, 0.18);
    const cAccent = rgb(1, 0.4, 0);

    for (const item of empresas) {
      const emp = item.empresa;
      const edps = item.edps;
      const movs = item.movimientos;

      const maxRows = Math.max(edps.length, movs.length, 1);
      const bodyH = pageH - margin * 2 - 50 - headerH - headerH - 10;
      const rowsPerPg = Math.max(1, Math.floor(bodyH / rowH));
      const totalEmpPgs = Math.ceil(maxRows / rowsPerPg);

      for (let ep = 0; ep < totalEmpPgs; ep++) {
        const page = pdfDoc.addPage([pageW, pageH]);
        let y = pageH - margin;

        // Header Superior
        page.drawRectangle({
          x: margin,
          y: y - 24,
          width: tableW,
          height: 24,
          color: cHeader,
        });
        const titleText = `ESTADO DE CUENTA DETALLADO — ${emp.nombre.toUpperCase()}`;
        page.drawText(titleText, {
          x: margin + (tableW - fontBold.widthOfTextAtSize(titleText, 10)) / 2,
          y: y - 16,
          size: 10,
          font: fontBold,
          color: cWhite,
        });
        y -= 24;

        // Metadata de la empresa
        const periodText = `RUT: ${emp.rut}  |  Cta. Cte.: ${emp.cuentaCorriente}  |  Periodo [${pIni} a ${pFin}]  |  Generado: ${moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm")}`;
        page.drawText(periodText, {
          x: margin + tableW - font.widthOfTextAtSize(periodText, 7.5) - 2,
          y: y - 10,
          size: 7.5,
          font,
          color: cGray,
        });
        y -= 14;

        const colHeaders = [
          "EDP ID",
          "Empresa",
          "Cuenta corriente",
          "Monto $",
          "Fecha Abono",
          "Abono $",
          "Saldo$",
        ];
        colHeaders.forEach((h, idx) => {
          const cx = colX[idx];
          const cw = colW[idx];
          page.drawRectangle({
            x: cx,
            y: y - headerH,
            width: cw,
            height: headerH,
            color: cAccent,
          });
          const textW = fontBold.widthOfTextAtSize(h, 7.5);
          const isRight = idx === 3 || idx === 5 || idx === 6;
          page.drawText(h, {
            x: isRight ? cx + cw - textW - 4 : cx + 4,
            y: y - headerH + 6,
            size: 7.5,
            font: fontBold,
            color: cWhite,
          });
        });
        y -= headerH;

        const startR = ep * rowsPerPg;
        const endR = Math.min(startR + rowsPerPg, maxRows);

        for (let i = startR; i < endR; i++) {
          const edp = edps[i];
          const mov = movs[i];
          const bg = i % 2 === 0 ? cWhite : cEven;

          page.drawRectangle({
            x: margin,
            y: y - rowH,
            width: tableW,
            height: rowH,
            color: bg,
          });

          const drawCell = (
            val: string,
            colIdx: number,
            right = false,
            textClr = cGray,
            textFont = font,
          ) => {
            const cx = colX[colIdx];
            const cw = colW[colIdx];
            page.drawRectangle({
              x: cx,
              y: y - rowH,
              width: cw,
              height: rowH,
              borderColor: rgb(0.9, 0.9, 0.9),
              borderWidth: 0.5,
            });
            if (val) {
              const maxW = cw - 8; // Margen de 4px por lado
              let renderVal = val;
              let textW = textFont.widthOfTextAtSize(renderVal, 7.5);
              if (textW > maxW) {
                while (renderVal.length > 0 && textW > maxW) {
                  renderVal = renderVal.slice(0, -1);
                  textW = textFont.widthOfTextAtSize(renderVal + "...", 7.5);
                }
                renderVal = renderVal + "...";
              }
              page.drawText(renderVal, {
                x: right ? cx + cw - textW - 4 : cx + 4,
                y: y - rowH + 4,
                size: 7.5,
                font: textFont,
                color: textClr,
              });
            }
          };

          const cGreen = rgb(0.12, 0.6, 0.3);
          const cAmber = rgb(0.75, 0.45, 0.05);

          const fechaAbonoStr =
            mov && mov.fechaMovimiento
              ? moment(mov.fechaMovimiento).tz(TIMEZONE).format("DD-MM-YYYY")
              : "";

          drawCell(edp ? edp.edpId : "", 0);
          drawCell(edp ? emp.nombre : "", 1);
          drawCell(edp ? emp.cuentaCorriente : "", 2);
          drawCell(CLP(edp ? edp.montoFacturado : 0), 3, true);

          drawCell(fechaAbonoStr, 4);
          drawCell(
            CLP(
              mov
                ? mov.tipoMovimiento === "abono"
                  ? mov.monto
                  : -mov.monto
                : 0,
            ),
            5,
            true,
            cGreen,
            fontBold,
          );
          drawCell(
            CLP(mov ? mov.saldo : 0),
            6,
            true,
            mov && mov.saldo > 0 ? cAmber : cGreen,
            fontBold,
          );

          y -= rowH;
        }

        if (ep === totalEmpPgs - 1) {
          const cFoot = rgb(1, 0.95, 0.88);
          const totalEDP = item.totales.totalEDP;
          const totalAbonos = item.totales.totalAbonos;
          const saldoFinal = item.totales.saldoFinal;

          const cGreen = rgb(0.12, 0.6, 0.3);
          const cAmber = rgb(0.75, 0.45, 0.05);

          page.drawRectangle({
            x: margin,
            y: y - rowH,
            width: tableW,
            height: rowH,
            color: cFoot,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5,
          });

          const drawTotalCell = (
            val: string,
            colIdx: number,
            right = false,
            textClr = cHeader,
          ) => {
            const cx = colX[colIdx];
            const cw = colW[colIdx];
            if (val) {
              const textW = fontBold.widthOfTextAtSize(val, 7.5);
              page.drawText(val, {
                x: right ? cx + cw - textW - 4 : cx + 4,
                y: y - rowH + 4,
                size: 7.5,
                font: fontBold,
                color: textClr,
              });
            }
          };

          drawTotalCell("TOTALES", 0);
          drawTotalCell(CLP(totalEDP), 3, true);
          drawTotalCell(CLP(totalAbonos), 5, true, cGreen);
          drawTotalCell(
            CLP(saldoFinal),
            6,
            true,
            saldoFinal > 0 ? cAmber : cGreen,
          );

          y -= rowH;
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Estado_Cuenta_Empresa_${pIni}_${pFin}.pdf`,
    );
    return res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error("Error exportarEstadoCuentaEmpresaDetallePDF:", err);
    return res
      .status(500)
      .json({ message: "Error al generar PDF", error: err.message });
  }
};
