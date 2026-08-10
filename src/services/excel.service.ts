import ExcelJS from "exceljs";
import moment from "moment-timezone";

const TIMEZONE = "America/Santiago";

export interface EDPExcelTicket {
  ticketNumber?: string;
  pnrNumber?: string;
  ticketStatus: string;
  confirmedAt?: string;
  origin?: string;
  terminal_origen?: string;
  destination?: string;
  terminal_destino?: string;
  travelDate?: string;
  departureTime?: string;
  monto_boleto: number;
  monto_devolucion?: number;
  reclamos?: { estado: string }[];
  pasajero?: {
    rut?: string;
    nombre?: string;
    centroCosto?: { nombre?: string };
    centro_costo?: { nombre?: string };
    CentroCosto?: { nombre?: string };
    id_centro_costo?: number;
  };
  empresa?: { cuenta_corriente?: string };
  user?: { rut?: string; nombre?: string };
}

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return "-";
  try {
    return moment(dateStr).tz(TIMEZONE).format("DD/MM/YYYY");
  } catch {
    return dateStr;
  }
};

const formatCLP = (monto: number): string =>
  `$${Number(monto || 0).toLocaleString("es-CL")}`;

/**
 * Genera un buffer de Excel con el detalle de tickets de un EDP.
 * Replica exactamente las columnas del exportador XLSX del panel frontend
 * e incluye el resumen explícito de Totales (Confirmados, Anulados, Reclamados).
 */
export const generateEDPExcelBuffer = async (
  tickets: EDPExcelTicket[],
  empresaNombre: string,
  rutEmpresa: string,
  cuentaCorriente: string,
  periodo: string,
  periodoReservas: string,
  devolucionesFueraPeriodo?: number,
  montoFinal?: number,
  porcentajeDescuento?: number,
  montoDescuento?: number,
  reclamosDescuento?: number,
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WIT Innovación Tecnológica";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Tickets", {
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
  });

  // ─── Encabezado institucional ─────────────────────────────────
  sheet.mergeCells("A1:O1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `PULLMAN BUS — ESTADO DE PAGO (EDP)`;
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1A1A2E" },
  };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:O2");
  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = `Empresa: ${empresaNombre}  |  RUT: ${rutEmpresa}  |  Cta. Cte.: ${cuentaCorriente}  |  Período: ${periodoReservas}`;
  subtitleCell.font = { size: 10, color: { argb: "FF444444" } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
  subtitleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8F9FA" },
  };
  sheet.getRow(2).height = 18;

  sheet.addRow([]); // fila 3 vacía

  // ─── Encabezados de columna (fila 4) ──────────────────────────
  const COLUMNS = [
    { header: "Ticket #", key: "ticketNumber", width: 16 },
    { header: "Fecha Compra", key: "fechaCompra", width: 14 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Origen", key: "origin", width: 18 },
    { header: "Destino", key: "destination", width: 18 },
    { header: "Fecha Viaje", key: "fechaViaje", width: 18 },
    { header: "RUT Pasajero", key: "rutPasajero", width: 14 },
    { header: "Nombre Pasajero", key: "nombrePasajero", width: 22 },
    { header: "Monto Original", key: "montoOriginal", width: 14 },
    { header: "Devolución", key: "devolucion", width: 14 },
    { header: "Monto Neto", key: "montoNeto", width: 14 },
    { header: "Centro De Costo", key: "centroCosto", width: 22 },
    { header: "Cta. Cte.", key: "ctaCte", width: 14 },
    { header: "RUT Comprador", key: "rutComprador", width: 14 },
    { header: "Nombre Comprador", key: "nombreComprador", width: 22 },
  ];

  sheet.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  const headerRow = sheet.getRow(4);
  COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFF6600" },
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
    };
  });
  headerRow.height = 22;

  // ─── Filas de datos y acumulación de totales ───────────────────
  let totalMontoOriginal = 0;
  let totalDevolucion = 0;
  let totalMontoNeto = 0;

  let countConfirmados = 0;
  let countAnulados = 0;
  let countReclamados = 0;

  let montoConfirmados = 0;
  let montoAnuladosDevolucion = 0;
  let montoReclamadosDescuento = 0;

  tickets.forEach((ticket, idx) => {
    const esAnulado = ticket.ticketStatus === "Anulado";
    const tieneReclamoAceptado =
      ticket.reclamos && ticket.reclamos.some((r) => r.estado === "Aceptado");

    const estadoLabel =
      tieneReclamoAceptado && !esAnulado ? "Reclamado" : ticket.ticketStatus;

    const montoOriginal = Number(ticket.monto_boleto || 0);
    const devolucion = esAnulado
      ? Number(ticket.monto_devolucion || ticket.monto_boleto || 0)
      : Number(ticket.monto_devolucion || 0);
    const montoNeto = montoOriginal - devolucion;

    totalMontoOriginal += montoOriginal;
    totalDevolucion += devolucion;
    totalMontoNeto += montoNeto;

    if (esAnulado) {
      countAnulados++;
      montoAnuladosDevolucion += devolucion;
    } else if (tieneReclamoAceptado) {
      countReclamados++;
      montoReclamadosDescuento += devolucion;
      countConfirmados++;
      montoConfirmados += montoOriginal;
    } else {
      countConfirmados++;
      montoConfirmados += montoOriginal;
    }

    const centroCostoNombre =
      ticket.pasajero?.centroCosto?.nombre ||
      ticket.pasajero?.centro_costo?.nombre ||
      ticket.pasajero?.CentroCosto?.nombre ||
      "Sin asignar";

    const rutComprador = ticket.user?.rut || (ticket as any).usuario?.rut || "";
    const nombreComprador =
      ticket.user?.nombre || (ticket as any).usuario?.nombre || "";

    const row = sheet.addRow({
      ticketNumber: ticket.ticketNumber || ticket.pnrNumber || "",
      fechaCompra: formatDate(ticket.confirmedAt),
      estado: estadoLabel,
      origin: ticket.origin || ticket.terminal_origen || "",
      destination: ticket.destination || ticket.terminal_destino || "",
      fechaViaje:
        `${formatDate(ticket.travelDate)} ${ticket.departureTime || ""}`.trim(),
      rutPasajero: ticket.pasajero?.rut || "",
      nombrePasajero: ticket.pasajero?.nombre || "",
      montoOriginal: formatCLP(montoOriginal),
      devolucion: formatCLP(devolucion),
      montoNeto: formatCLP(montoNeto),
      centroCosto: centroCostoNombre,
      ctaCte: ticket.empresa?.cuenta_corriente || cuentaCorriente,
      rutComprador,
      nombreComprador,
    });

    const isEven = idx % 2 === 0;
    const rowFill: ExcelJS.FillPattern = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isEven ? "FFFFFFFF" : "FFFAFAFA" },
    };

    row.eachCell((cell) => {
      cell.fill = rowFill;
      cell.font = { size: 9 };
      cell.alignment = { vertical: "middle" };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE9E9E9" } },
      };
    });
    row.height = 18;
  });

  // ─── Fila de Totales de Tabla ───────────────────────────────────
  const totalRow = sheet.addRow({
    ticketNumber: `TOTALES (${tickets.length} tickets)`,
    montoOriginal: formatCLP(totalMontoOriginal),
    devolucion: formatCLP(totalDevolucion),
    montoNeto: formatCLP(totalMontoNeto),
  });

  totalRow.eachCell((cell) => {
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
  });
  totalRow.height = 22;

  // ─── Fila Vacía ───────────────────────────────────────────────
  sheet.addRow([]);

  // ─── Resumen Explicativo de Montos y Conteo de Estados ──────────
  const summaryTitleRow = sheet.addRow([
    "RESUMEN OPERACIONAL DE ESTADOS Y MONTOS DE PLANILLA",
  ]);
  sheet.mergeCells(`A${summaryTitleRow.number}:O${summaryTitleRow.number}`);
  const summaryTitleCell = summaryTitleRow.getCell(1);
  summaryTitleCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  summaryTitleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1A1A2E" },
  };
  summaryTitleCell.alignment = { horizontal: "center", vertical: "middle" };
  summaryTitleRow.height = 24;

  const pctTramos = Number(porcentajeDescuento || 0);
  const mDescuentoTramos =
    montoDescuento !== undefined && montoDescuento !== null
      ? Number(montoDescuento)
      : Math.round(montoConfirmados * (pctTramos / 100));

  const montoTotalEDP = Math.max(0, montoConfirmados - mDescuentoTramos);
  const devFueraVal = Number(devolucionesFueraPeriodo || 0);
  const reclamosVal =
    reclamosDescuento !== undefined && reclamosDescuento !== null
      ? Number(reclamosDescuento)
      : Number(montoReclamadosDescuento || 0);

  const edpFinalVal =
    montoFinal !== undefined && montoFinal !== null
      ? Number(montoFinal)
      : Math.max(0, montoTotalEDP - devFueraVal - reclamosVal);

  const legendRows = [
    {
      concepto: "A. Total Tickets Generados",
      conteo: `${tickets.length} tickets`,
      monto: formatCLP(totalMontoOriginal),
      descripcion: "Total de pasajes emitidos en el período de reservas.",
      isHighlighted: false,
    },
    {
      concepto: "B. Total Tickets Anulados",
      conteo: `${countAnulados} tickets`,
      monto: formatCLP(montoAnuladosDevolucion || totalDevolucion),
      descripcion: "Devoluciones por anulación de pasajes dentro del período.",
      isHighlighted: false,
    },
    {
      concepto: "C. Tickets Confirmados (A - B)",
      conteo: `${countConfirmados} tickets`,
      monto: formatCLP(montoConfirmados),
      descripcion: "Cantidad de pasajes vigentes del período.",
      isHighlighted: false,
    },
    {
      concepto: "D. Devoluciones por anulación dentro del período",
      conteo: `${countAnulados} anulados`,
      monto: formatCLP(montoAnuladosDevolucion || totalDevolucion),
      descripcion:
        "Monto acumulado por devoluciones de pasajes anulados en el mes.",
      isHighlighted: false,
    },
    {
      concepto: "E. Devoluciones por anulación de período anterior",
      conteo: "-",
      monto: formatCLP(devFueraVal),
      descripcion:
        "Devoluciones acumuladas por pasajes de meses anteriores anulados en este período.",
      isHighlighted: false,
    },
    {
      concepto: "F. Descuentos por Reclamos",
      conteo: `${countReclamados} reclamos`,
      monto: formatCLP(reclamosVal),
      descripcion: "Descuentos aplicados por reclamos comerciales aceptados.",
      isHighlighted: false,
    },
    {
      concepto: "G. Monto Tickets Confirmados",
      conteo: `${countConfirmados} confirmados`,
      monto: formatCLP(montoConfirmados),
      descripcion:
        "Monto bruto total correspondiente a los pasajes confirmados vigentes.",
      isHighlighted: false,
    },
    {
      concepto: `H. Monto Descuento por Tramos (${pctTramos}%)`,
      conteo: "-",
      monto: formatCLP(mDescuentoTramos),
      descripcion: "Descuento por tramo de facturación acumulada.",
      isHighlighted: false,
    },
    {
      concepto: "I. Monto Total EDP (G - H)",
      conteo: "-",
      monto: formatCLP(montoTotalEDP),
      descripcion:
        "Subtotal bruto del Estado de Pago antes de devoluciones anteriores y reclamos.",
      isHighlighted: false,
    },
    {
      concepto: "J. MONTO EDP FINAL (Total a Facturar)",
      conteo: `${countConfirmados} confirmados`,
      monto: formatCLP(edpFinalVal),
      descripcion:
        "MONTO FINAL A FACTURAR (I - E - F) con descuentos y devoluciones aplicados.",
      isHighlighted: true,
    },
  ];

  legendRows.forEach((item, index) => {
    const row = sheet.addRow([
      item.concepto,
      "",
      item.conteo,
      "",
      item.monto,
      "",
      item.descripcion,
    ]);

    const rNum = row.number;
    sheet.mergeCells(`A${rNum}:B${rNum}`);
    sheet.mergeCells(`C${rNum}:D${rNum}`);
    sheet.mergeCells(`E${rNum}:F${rNum}`);
    sheet.mergeCells(`G${rNum}:O${rNum}`);

    const cellConcepto = row.getCell(1);
    const cellConteo = row.getCell(3);
    const cellMonto = row.getCell(5);
    const cellDesc = row.getCell(7);

    const isHighlighted = item.isHighlighted;
    const bgColor = isHighlighted
      ? "FFFFF3E0"
      : index % 2 === 0
        ? "FFFFFFFF"
        : "FFF8F9FA";

    [cellConcepto, cellConteo, cellMonto, cellDesc].forEach((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bgColor },
      };
      c.border = {
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
      };
    });

    cellConcepto.font = {
      bold: true,
      size: 10,
      color: { argb: isHighlighted ? "FFFF6600" : "FF333333" },
    };
    cellConteo.font = { bold: true, size: 10, color: { argb: "FF444444" } };
    cellConteo.alignment = { horizontal: "center", vertical: "middle" };

    cellMonto.font = {
      bold: true,
      size: 10,
      color: { argb: isHighlighted ? "FFFF6600" : "FF1A1A2E" },
    };
    cellMonto.alignment = { horizontal: "right", vertical: "middle" };

    cellDesc.font = { size: 9, italic: true, color: { argb: "FF666666" } };
    cellDesc.alignment = { vertical: "middle" };

    row.height = 20;
  });

  // ─── Congelar la fila de encabezados ──────────────────────────
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 4 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
