import { Sequelize } from "sequelize-typescript";
import "../models/associations";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Empresa, IEmpresa } from "../models/empresa.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { CentroCosto } from "../models/centro_costo.model";
import { Ticket } from "../models/ticket.model";
import { Pasajero } from "../models/pasajero.model";
import { Reclamo } from "../models/reclamo.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import { User } from "../models/user.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { UserEmpresa } from "../models/user_empresa.model";
import { generateEDPPDF, EDPPDFData } from "../services/pdf.service";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import moment from "moment-timezone";

const TIMEZONE = "America/Santiago";

// Credenciales proporcionadas por el usuario para conectar directo a AWS RDS en modo lectura
const DB_HOST = "reserva-corporativa.c6xou04wqeof.us-east-1.rds.amazonaws.com";
const DB_PORT = 3306;
const DB_USER = "admin";
const DB_PASSWORD = "BIWEHB?NtOi6GPo.WaKD-Uvy[I9F";
const DB_NAME = "multiempresa_db";

const sequelize = new Sequelize({
  dialect: "mysql",
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  models: [
    Empresa,
    EmpresaTramo,
    CentroCosto,
    User,
    CuentaCorriente,
    Ticket,
    EstadoCuenta,
    Pasajero,
    UserEmpresa,
    Reclamo,
    EdpTicketSnapshot,
  ],
  logging: false,
  timezone: "-04:00", // Santiago timezone offset estándar
});

// Helpers de formateo
function parseDateString(dateStr: string): Date {
  const [datePart, timePart] = dateStr.trim().split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes, seconds] = timePart
    ? timePart.split(":").map(Number)
    : [0, 0, 0];
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

function formatDateCL(date: Date | string | null): string {
  if (!date) return "-";
  try {
    const d = typeof date === "string" ? parseDateString(date) : date;
    return moment(d).tz(TIMEZONE).format("DD-MM-YYYY");
  } catch {
    return String(date);
  }
}

function formatCLP(monto: number): string {
  return `$${Math.round(monto || 0).toLocaleString("es-CL")}`;
}

function formatPercent(value: number): string {
  return `${Number(value || 0).toFixed(2)}%`;
}
function cleanString(str: any): string {
  if (typeof str !== "string") return str ? String(str) : "";
  return str.replace(/\t/g, " ").replace(/[\r\n\x00-\x1F\x7F-\x9F]/g, " ").trim();
}

// ─── Función auxiliar para construir los datos del PDF (replica exacta del pdf.controller) ──────
async function buildEdpPdfData(ec: EstadoCuenta): Promise<EDPPDFData> {
  const estadoData = ec.toJSON() as any;

  const empresa = await Empresa.findByPk(estadoData.empresa_id);
  if (!empresa) throw new Error(`Empresa ID ${estadoData.empresa_id} no encontrada`);
  const empresaData = empresa.get({ plain: true }) as IEmpresa;

  const centrosMapByNombre = new Map<
    string,
    { nombre: string; cantidad_tickets: number; monto_facturado: number }
  >();
  let ticketsConfirmados = 0;
  let ticketsAnulados = 0;
  let ticketsReclamadosCount = 0;
  let montoTotalBruto = 0;
  let devolucionesTotal = 0;
  let tickets: any[] = [];
  let usingSnapshot = false;

  const snapshots = await EdpTicketSnapshot.findAll({
    where: { edp_id: estadoData.id },
    order: [["id", "ASC"]],
  });

  if (snapshots.length > 0) {
    tickets = snapshots
      .map((s) => {
        try {
          return JSON.parse(s.ticket_data);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    usingSnapshot = true;
  }

  if (!usingSnapshot && estadoData.fecha_inicio && estadoData.fecha_fin) {
    const ticketsInstances = await Ticket.findAll({
      where: {
        id_empresa: estadoData.empresa_id,
        confirmedAt: {
          [Op.between]: [
            parseDateString(estadoData.fecha_inicio),
            parseDateString(estadoData.fecha_fin),
          ],
        },
      },
      include: [
        {
          model: Pasajero,
          attributes: ["id", "id_centro_costo"],
          required: false,
          include: [
            {
              model: CentroCosto,
              attributes: ["id", "nombre"],
              required: false,
            },
          ],
        },
        { model: Reclamo, required: false },
      ],
    });
    tickets = ticketsInstances.map((t) => t.get({ plain: true }));
  }

  tickets.forEach((ticket) => {
    const esAnulado = ticket.ticketStatus === "Anulado";
    const hasAcceptedReclamo = ticket.reclamos?.some(
      (r: any) => r.estado === "Aceptado",
    );
    const montoTicket = Number(ticket.monto_boleto ?? 0);
    const montoDevolucion = esAnulado
      ? Number(ticket.monto_devolucion ?? ticket.monto_boleto ?? 0)
      : Number(ticket.monto_devolucion ?? 0);

    if (hasAcceptedReclamo && !esAnulado) ticketsReclamadosCount++;
    if (esAnulado) {
      ticketsAnulados++;
      devolucionesTotal += montoDevolucion;
    } else {
      ticketsConfirmados++;
      montoTotalBruto += montoTicket;
    }

    const pasajero = ticket.pasajero;
    const rawNombreCC =
      pasajero?.centroCosto?.nombre ||
      pasajero?.CentroCosto?.nombre ||
      pasajero?.centro_costo?.nombre ||
      "Sin asignar";
    const nombreCC = cleanString(rawNombreCC);

    if (!centrosMapByNombre.has(nombreCC))
      centrosMapByNombre.set(nombreCC, {
        nombre: nombreCC,
        cantidad_tickets: 0,
        monto_facturado: 0,
      });
    const cc = centrosMapByNombre.get(nombreCC)!;
    if (!esAnulado) {
      cc.cantidad_tickets++;
      cc.monto_facturado += montoTicket;
    }
  });

  const centrosCostoArray = Array.from(centrosMapByNombre.values())
    .filter((cc) => cc.cantidad_tickets > 0)
    .sort((a, b) => b.monto_facturado - a.monto_facturado);

  const montoBrutoAntesDeDescuento = centrosCostoArray.reduce(
    (sum, cc) => sum + cc.monto_facturado,
    0,
  );
  const devolucionesEstado =
    Number(estadoData.suma_devoluciones || 0) -
    Number(estadoData.reclamos_descuento || 0) -
    Number(estadoData.devoluciones_fuera_periodo || 0);
  const porcentajeDescuento = Number(estadoData.porcentaje_descuento || 0);
  const montoDescuento = Math.round(
    montoBrutoAntesDeDescuento * (porcentajeDescuento / 100),
  );

  const tramosEmpresa = await EmpresaTramo.findAll({
    where: { id_empresa: estadoData.empresa_id },
  });
  const esDescuentoTramo =
    tramosEmpresa.length > 0 &&
    tramosEmpresa.some(
      (t) => Number(t.porcentaje_descuento) === porcentajeDescuento,
    );
  const etiquetaDescuento = esDescuentoTramo
    ? "Descuento por Tramos"
    : "Descuento Aplicado";

  const montoReclamos = Number(estadoData.reclamos_descuento || 0);
  const montoI = Math.max(0, montoBrutoAntesDeDescuento - montoDescuento);
  const devFueraBD = Number(estadoData.devoluciones_fuera_periodo || 0);
  const montoFinalConDescuento =
    estadoData.monto_facturado != null
      ? Number(estadoData.monto_facturado)
      : Math.max(0, montoI - devFueraBD - montoReclamos);

  const saldoFavorRestante =
    Number(empresaData.devolucion_pendiente_edp || 0) +
    Number(empresaData.descuento_pendiente_edp || 0);

  return {
    edp: {
      numero_edp: String(estadoData.id),
      fecha_generacion: estadoData.fecha_generacion
        ? formatDateCL(estadoData.fecha_generacion)
        : null,
      periodo_reservas:
        estadoData.fecha_inicio && estadoData.fecha_fin
          ? `${formatDateCL(estadoData.fecha_inicio)} - ${formatDateCL(estadoData.fecha_fin)}`
          : null,
    },
    empresa: {
      id: Number(empresaData.id),
      nombre: cleanString(empresaData.nombre),
      rut: cleanString(empresaData.rut ?? "No disponible"),
      cuenta_corriente: empresaData.cuenta_corriente ? cleanString(empresaData.cuenta_corriente) : null,
    },
    resumen: {
      tickets_generados: estadoData.total_tickets || 0,
      tickets_anulados: estadoData.total_tickets_anulados || 0,
      suma_devoluciones: devolucionesEstado,
      monto_bruto_facturado: montoBrutoAntesDeDescuento,
      porcentaje_descuento: porcentajeDescuento,
      etiqueta_descuento: etiquetaDescuento,
      monto_descuento: montoDescuento,
      monto_final: montoFinalConDescuento,
      tickets_reclamados: ticketsReclamadosCount,
      monto_reclamos: montoReclamos,
      devoluciones_fuera_periodo: devFueraBD,
      saldo_favor_restante: saldoFavorRestante,
    },
    centros_costo: centrosCostoArray.map((cc, idx) => ({
      id: idx + 1,
      nombre: cleanString(cc.nombre),
      cantidad_tickets: cc.cantidad_tickets,
      monto_facturado: cc.monto_facturado,
    })),
    totales: {
      cantidad_tickets: ticketsConfirmados,
      monto_facturado: montoBrutoAntesDeDescuento,
    },
  };
}


async function run() {
  console.log("Conectando a la base de datos AWS RDS en modo lectura...");
  try {
    await sequelize.authenticate();
    console.log("Conexión establecida correctamente.");

    // Crear carpeta edp_globales si no existe en la raíz del proyecto
    const outputDir = path.join(process.cwd(), "edp_globales");
    if (!fs.existsSync(outputDir)) {
      console.log(`Creando directorio: ${outputDir}`);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log("Obteniendo todos los Estados de Pago (EDPs)...");
    const todosLosEstados = await EstadoCuenta.findAll({
      include: [
        {
          model: Empresa,
          attributes: ["id", "nombre", "rut", "cuenta_corriente", "estado"],
        },
      ],
      order: [["fecha_generacion", "DESC"]],
    });

    // Filtrar EDPs sin tickets ni monto — no tienen sentido como PDF ni en el Excel
    const estados = todosLosEstados.filter((ec) => {
      const d = ec.toJSON() as any;
      return Number(d.total_tickets || 0) > 0 || Number(d.monto_facturado || 0) > 0;
    });
    const omitidos = todosLosEstados.length - estados.length;

    console.log(`Se encontraron ${todosLosEstados.length} Estados de Pago en total.`);
    console.log(`✂️  Omitidos (0 tickets y $0): ${omitidos} | A procesar: ${estados.length}`);

    // 1. Crear el archivo Excel Global
    console.log("Generando planilla Excel global...");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WIT Innovación Tecnológica";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Estados de Pago Globales", {
      pageSetup: { fitToPage: true, orientation: "landscape" },
    });

    // Encabezado institucional Pullman
    sheet.mergeCells("A1:I1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "PULLMAN BUS — REPORTE GLOBAL DE ESTADOS DE PAGO (EDP)";
    titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A1A2E" },
    };
    sheet.getRow(1).height = 32;

    sheet.mergeCells("A2:I2");
    const subtitleCell = sheet.getCell("A2");
    const todayStr = moment().tz(TIMEZONE).format("DD-MM-YYYY HH:mm");
    subtitleCell.value = `Total Registros: ${estados.length}  |  Fecha de Generación: ${todayStr}  |  Estado: Lectura Global`;
    subtitleCell.font = { size: 10, italic: true, color: { argb: "FF555555" } };
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    subtitleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF5F5F5" },
    };
    sheet.getRow(2).height = 20;

    sheet.addRow([]); // Fila vacía (fila 3)

    // Definición de columnas
    const COLUMNS = [
      { header: "ID Empresa", key: "idEmpresa", width: 12, align: "center" },
      {
        header: "Nombre Empresa",
        key: "nombreEmpresa",
        width: 30,
        align: "left",
      },
      {
        header: "Fecha Generación",
        key: "fechaGeneracion",
        width: 18,
        align: "center",
      },
      {
        header: "Período Facturación",
        key: "periodoFacturacion",
        width: 26,
        align: "center",
      },
      {
        header: "Total Tickets",
        key: "totalTickets",
        width: 14,
        align: "right",
      },
      {
        header: "Total Anulados",
        key: "totalAnulados",
        width: 14,
        align: "right",
      },
      {
        header: "Monto Facturado",
        key: "montoFacturado",
        width: 18,
        align: "right",
      },
      {
        header: "Suma Devoluciones",
        key: "sumaDevoluciones",
        width: 18,
        align: "right",
      },
      { header: "Descuento", key: "descuento", width: 12, align: "right" },
    ];

    sheet.columns = COLUMNS.map((col) => ({ key: col.key, width: col.width }));

    const headerRow = sheet.getRow(4);
    COLUMNS.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF6600" }, // Pullman Orange
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    });
    headerRow.height = 24;

    let sumTickets = 0;
    let sumAnulados = 0;
    let sumMontoFacturado = 0;
    let sumSumaDevoluciones = 0;

    estados.forEach((ec, idx) => {
      const ecData = ec.toJSON() as any;
      const empresaNombre = ecData.empresa?.nombre || "N/A";
      const idEmpresa = ecData.empresa_id;

      const fechaGenStr = formatDateCL(ecData.fecha_generacion);
      const periodoStr =
        ecData.fecha_inicio && ecData.fecha_fin
          ? `${formatDateCL(ecData.fecha_inicio)} - ${formatDateCL(ecData.fecha_fin)}`
          : ecData.periodo;

      const totalTickets = Number(ecData.total_tickets || 0);
      const totalAnulados = Number(ecData.total_tickets_anulados || 0);
      const montoFacturado = Number(ecData.monto_facturado || 0);
      const sumaDevoluciones = Number(ecData.suma_devoluciones || 0);
      const descuentoStr = formatPercent(
        Number(ecData.porcentaje_descuento || 0),
      );

      sumTickets += totalTickets;
      sumAnulados += totalAnulados;
      sumMontoFacturado += montoFacturado;
      sumSumaDevoluciones += sumaDevoluciones;

      const row = sheet.addRow({
        idEmpresa,
        nombreEmpresa: empresaNombre,
        fechaGeneracion: fechaGenStr,
        periodoFacturacion: periodoStr,
        totalTickets,
        totalAnulados,
        montoFacturado: formatCLP(montoFacturado),
        sumaDevoluciones: formatCLP(sumaDevoluciones),
        descuento: descuentoStr,
      });

      // Estilo de datos
      const isEven = idx % 2 === 0;
      const rowFill: ExcelJS.FillPattern = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFFFFFFF" : "FFFAFAFA" },
      };

      row.eachCell((cell, colNum) => {
        cell.fill = rowFill;
        cell.font = { size: 9 };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFE0E0E0" } },
        };
        const colDef = COLUMNS[colNum - 1];
        if (colDef) {
          cell.alignment = {
            horizontal: colDef.align as ExcelJS.Alignment["horizontal"],
            vertical: "middle",
          };
        }
      });
      row.height = 20;
    });

    // Fila de Totales
    const totalRow = sheet.addRow({
      idEmpresa: "TOTALES",
      nombreEmpresa: `${estados.length} registros`,
      fechaGeneracion: "",
      periodoFacturacion: "",
      totalTickets: sumTickets,
      totalAnulados: sumAnulados,
      montoFacturado: formatCLP(sumMontoFacturado),
      sumaDevoluciones: formatCLP(sumSumaDevoluciones),
      descuento: "",
    });

    totalRow.eachCell((cell, colNum) => {
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
      const colDef = COLUMNS[colNum - 1];
      if (colDef) {
        cell.alignment = {
          horizontal: colDef.align as ExcelJS.Alignment["horizontal"],
          vertical: "middle",
        };
      }
    });
    totalRow.height = 24;

    const excelPath = path.join(outputDir, "reporte_global_edp.xlsx");
    await workbook.xlsx.writeFile(excelPath);
    console.log(`Planilla Excel Global guardada con éxito en: ${excelPath}`);
    // ─── 2. Descargar PDFs con concurrencia controlada ─────────────────────────
    console.log("\nIniciando descarga de PDFs (modo concurrente)...");
    const pdfDir = path.join(outputDir, "pdfs");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    const CONCURRENCY = 12; // 12 PDFs en paralelo — seguro para RDS sin saturarlo
    let pdfOk = 0;
    let pdfError = 0;
    let completados = 0;
    const errores: string[] = [];

    // Semáforo simple para limitar la concurrencia
    const semaphore = (() => {
      let running = 0;
      const queue: (() => void)[] = [];
      return {
        acquire: () => new Promise<void>((resolve) => {
          if (running < CONCURRENCY) { running++; resolve(); }
          else queue.push(() => { running++; resolve(); });
        }),
        release: () => {
          running--;
          const next = queue.shift();
          if (next) next();
        },
      };
    })();

    const procesarEDP = async (ec: EstadoCuenta, index: number): Promise<void> => {
      await semaphore.acquire();
      const ecData = ec.toJSON() as any;

      try {
        // Doble capa de seguridad: skip si no tiene tickets ni monto
        if (Number(ecData.total_tickets || 0) === 0 && Number(ecData.monto_facturado || 0) === 0) {
          return;
        }

        const empresaNameClean = (ecData.empresa?.nombre || "Empresa")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
        const periodoClean = String(ecData.periodo || "sin_periodo").replace(/[^a-zA-Z0-9_-]/g, "-");
        const pdfFilename = `EDP_${ec.id}_${empresaNameClean}_${periodoClean}.pdf`;
        const pdfPath = path.join(pdfDir, pdfFilename);

        // Si el PDF ya existe y es válido (> 0 bytes), no lo volvemos a procesar
        if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) {
          pdfOk++;
          return;
        }

        const edpData = await buildEdpPdfData(ec);
        const pdfBytes = await generateEDPPDF(edpData);
        fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
        pdfOk++;
      } catch (err: any) {
        pdfError++;
        errores.push(`EDP ID ${ec.id} (${ecData.empresa?.nombre}): ${err?.message || err}`);
      } finally {
        completados++;
        const pct = ((completados / estados.length) * 100).toFixed(1);
        process.stdout.write(
          `\r  Progreso: ${completados}/${estados.length} (${pct}%) | ✅ ${pdfOk} ok | ❌ ${pdfError} errores   `
        );
        semaphore.release();
      }
    };

    // Lanzar todos en paralelo con el semáforo controlando cuántos corren a la vez
    await Promise.allSettled(estados.map((ec, i) => procesarEDP(ec, i)));

    console.log(`\n\n✅ PDFs generados: ${pdfOk} / ${estados.length}  |  Errores: ${pdfError}`);
    if (errores.length > 0) {
      console.log("\n⚠️  EDPs con error:");
      errores.forEach(e => console.log(`   ❌ ${e}`));
    }
    console.log(`   Guardados en: ${pdfDir}`);
    console.log(`\n¡Proceso completo! Excel + PDFs listos en: ${outputDir}`);
  } catch (error) {
    console.error("Error durante la ejecución del script:", error);
  } finally {
    await sequelize.close();
  }
}

run();

