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
 * Replica exactamente las columnas del exportador XLSX del panel frontend.
 */
export const generateEDPExcelBuffer = async (
  tickets: EDPExcelTicket[],
  empresaNombre: string,
  rutEmpresa: string,
  cuentaCorriente: string,
  periodo: string,
  periodoReservas: string,
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

  // ─── Filas de datos ────────────────────────────────────────────
  let totalMontoOriginal = 0;
  let totalDevolucion = 0;
  let totalMontoNeto = 0;

  tickets.forEach((ticket, idx) => {
    const esAnulado = ticket.ticketStatus === "Anulado";
    const tieneReclamoAceptado =
      ticket.reclamos &&
      ticket.reclamos.some((r) => r.estado === "Aceptado");

    const estadoLabel = tieneReclamoAceptado && !esAnulado
      ? "Reclamado"
      : ticket.ticketStatus;

    const montoOriginal = Number(ticket.monto_boleto || 0);
    const devolucion = Number(ticket.monto_devolucion || 0);
    const montoNeto = montoOriginal - devolucion;

    totalMontoOriginal += montoOriginal;
    totalDevolucion += devolucion;
    totalMontoNeto += montoNeto;

    const centroCostoNombre =
      ticket.pasajero?.centroCosto?.nombre ||
      ticket.pasajero?.centro_costo?.nombre ||
      ticket.pasajero?.CentroCosto?.nombre ||
      "Sin asignar";

    const rutComprador = ticket.user?.rut || (ticket as any).usuario?.rut || "";
    const nombreComprador = ticket.user?.nombre || (ticket as any).usuario?.nombre || "";

    const row = sheet.addRow({
      ticketNumber: ticket.ticketNumber || ticket.pnrNumber || "",
      fechaCompra: formatDate(ticket.confirmedAt),
      estado: estadoLabel,
      origin: ticket.origin || ticket.terminal_origen || "",
      destination: ticket.destination || ticket.terminal_destino || "",
      fechaViaje: `${formatDate(ticket.travelDate)} ${ticket.departureTime || ""}`.trim(),
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

  // ─── Fila de Totales ───────────────────────────────────────────
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
    };
  });
  totalRow.height = 20;

  // ─── Congelar la fila de encabezados ──────────────────────────
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 4 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};
