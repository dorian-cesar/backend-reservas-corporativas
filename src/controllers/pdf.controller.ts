import { Request, Response } from "express";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Pasajero } from "../models/pasajero.model";
import { Empresa, IEmpresa } from "../models/empresa.model";
import { Op } from "sequelize";
import { CentroCosto } from "../models/centro_costo.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { request } from "http";
import { Reclamo } from "../models/reclamo.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import {
  generateTicketPDFTemplate1,
  generateTicketPDFTemplate2,
  TicketPDFData,
  generateEDPPDF,
  EDPPDFData,
} from "../services/pdf.service";
import { generateEDPExcelBuffer } from "../services/excel.service";

export const getTicketsWithPassengerInfo = async (
  req: Request,
  res: Response,
) => {
  try {
    const { ticketNumber } = req.params;
    const { format } = req.query;

    if (!ticketNumber) {
      return res.status(400).json({
        success: false,
        message: "El parámetro ticketNumber es requerido",
      });
    }

    const tickets = await Ticket.findAll({
      where: {
        ticketNumber: ticketNumber,
      },
      include: [
        {
          model: User,
          required: true,
          attributes: ["id", "nombre", "rut", "email", "rol"],
          include: [
            {
              model: Empresa,
              attributes: ["id", "nombre", "rut", "cuenta_corriente", "estado"],
            },
          ],
        },
        {
          model: Pasajero,
          attributes: ["id", "nombre", "rut", "correo"],
          required: false,
        },
      ],
      order: [["travelDate", "DESC"]],
    });

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se encontraron tickets con el número proporcionado",
      });
    }

    // Para formato JSON normal
    if (format !== "pdf") {
      const formattedTickets = tickets.map((ticket) => {
        const ticketData = ticket.toJSON() as any;
        const userData = ticketData.user || {};
        const empresaData = userData.empresa || {};
        const passengerData = ticketData.pasajero || {};

        return {
          ticket: {
            id: ticketData.id,
            ticketNumber: ticketData.ticketNumber,
            pnrNumber: ticketData.pnrNumber,
            ticketStatus: ticketData.ticketStatus,
            origin: ticketData.origin,
            destination: ticketData.destination,
            terminal_origen: ticketData.terminal_origen || "",
            terminal_destino: ticketData.terminal_destino || "",
            travelDate: ticketData.travelDate,
            departureTime: ticketData.departureTime,
            seatNumbers: ticketData.seatNumbers,
            fare: ticketData.fare,
            monto_boleto: ticketData.monto_boleto,
            monto_devolucion: ticketData.monto_devolucion,
            confirmedAt: ticketData.confirmedAt,
            created_at: ticketData.created_at,
            updated_at: ticketData.updated_at,
          },
          cliente: {
            id: userData.id || null,
            nombre: userData.nombre || "No disponible",
            rut: userData.rut || null,
            email: userData.email || "No disponible",
            rol: userData.rol || null,
          },
          empresa: {
            id: empresaData.id || null,
            nombre: empresaData.nombre || "No disponible",
            rut: empresaData.rut || null,
            cuenta_corriente: empresaData.cuenta_corriente || null,
            estado: empresaData.estado || null,
          },
          pasajero: {
            nombre: passengerData.nombre || userData.nombre || "No disponible",
            rut: passengerData.rut || userData.rut || null,
            correo: passengerData.correo || userData.email || "No disponible",
          },
        };
      });

      return res.json({
        success: true,
        data: formattedTickets,
        total: tickets.length,
      });
    }

    // Para formato PDF (tomamos el primer ticket)
    const ticket = tickets[0];
    const ticketData = ticket.toJSON() as any;
    const userData = ticketData.user || {};
    const empresaData = userData.empresa || {};
    const passengerData = ticketData.pasajero || {};

    const pdfData: TicketPDFData = {
      ticket: {
        id: ticketData.id,
        ticketNumber: ticketData.ticketNumber,
        pnrNumber: ticketData.pnrNumber,
        ticketStatus: ticketData.ticketStatus,
        origin: ticketData.origin,
        destination: ticketData.destination,
        terminal_origen: ticketData.terminal_origen,
        terminal_destino: ticketData.terminal_destino,
        travelDate: ticketData.travelDate,
        departureTime: ticketData.departureTime,
        seatNumbers: ticketData.seatNumbers,
        fare: ticketData.fare,
        monto_boleto: ticketData.monto_boleto,
        monto_devolucion: ticketData.monto_devolucion,
        confirmedAt: ticketData.confirmedAt,
        created_at: ticketData.created_at,
        updated_at: ticketData.updated_at,
      },
      cliente: {
        id: userData.id || null,
        nombre: userData.nombre || "No disponible",
        rut: userData.rut || null,
        email: userData.email || "No disponible",
        rol: userData.rol || null,
      },
      empresa: {
        id: empresaData.id || null,
        nombre: empresaData.nombre || "No disponible",
        rut: empresaData.rut || null,
        cuenta_corriente: empresaData.cuenta_corriente || null,
        estado: empresaData.estado || null,
      },
      pasajero: {
        nombre: passengerData.nombre || userData.nombre || "No disponible",
        rut: passengerData.rut || userData.rut || null,
        correo: passengerData.correo || userData.email || "No disponible",
      },
    };

    const pdfBytes = await generateTicketPDFTemplate2(pdfData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="boleto-${ticketNumber}.pdf"`,
    );

    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Error fetching tickets with passenger info:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

function parseDateString(dateStr: string): Date {
  const [datePart, timePart] = dateStr.trim().split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes, seconds] = timePart
    ? timePart.split(":").map(Number)
    : [0, 0, 0];
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

export const generarPDFEstadoCuenta = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log("Generando PDF para estado de cuenta ID:", id);

    const estadoCuenta = await EstadoCuenta.findByPk(id);
    if (!estadoCuenta) {
      return res
        .status(404)
        .json({ message: "Estado de cuenta no encontrado" });
    }
    const estadoData = estadoCuenta.toJSON();

    const empresa = await Empresa.findByPk(estadoData.empresa_id);
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }
    const empresaData = empresa.get({ plain: true }) as IEmpresa;

    // Mapa por NOMBRE para consolidar CCs con distintos IDs pero mismo nombre
    // (Sodexo y otras empresas pueden tener múltiples registros con el mismo nombre CC)
    const centrosMapByNombre = new Map<string, {
      nombre: string;
      cantidad_tickets: number;
      monto_facturado: number;
    }>();

    let ticketsConfirmados = 0;
    let ticketsAnulados = 0;
    let ticketsReclamadosCount = 0;
    let montoTotalBruto = 0;
    let devolucionesTotal = 0;

    let tickets: any[] = [];
    let usingSnapshot = false;

    const snapshots = await EdpTicketSnapshot.findAll({
      where: { edp_id: id },
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
                attributes: ["id", "nombre"],  // nombre necesario para agrupar por nombre
                required: false,
              },
            ],
          },
          {
            model: Reclamo,
            required: false,
          },
        ],
      });
      tickets = ticketsInstances.map(t => t.get({ plain: true }));
    }

    if (tickets.length > 0) {
      console.log("Tickets encontrados:", tickets.length);

      tickets.forEach((ticketPlain) => {
        const pasajero = ticketPlain.pasajero;
        const esAnulado = ticketPlain.ticketStatus === "Anulado";
        const montoTicket = Number(ticketPlain.monto_boleto ?? 0);
        const montoDevolucion = Number(ticketPlain.monto_devolucion ?? 0);

        const hasAcceptedReclamo =
          ticketPlain.reclamos &&
          ticketPlain.reclamos.some((r: any) => r.estado === "Aceptado");
        if (hasAcceptedReclamo && !esAnulado) {
          ticketsReclamadosCount += 1;
        }

        // Totales generales
        if (esAnulado) {
          ticketsAnulados += 1;
          devolucionesTotal += montoDevolucion;
        } else {
          ticketsConfirmados += 1;
          montoTotalBruto += montoTicket;
        }

        // Agrupar por NOMBRE del CC desde el snapshot
        // (misma lógica que el cron: agrupa por nombre, no por ID)
        const nombreCC =
          pasajero?.centroCosto?.nombre ||
          pasajero?.CentroCosto?.nombre ||
          pasajero?.centro_costo?.nombre ||
          "Sin asignar";
        if (!centrosMapByNombre.has(nombreCC)) {
          centrosMapByNombre.set(nombreCC, {
            nombre: nombreCC,
            cantidad_tickets: 0,
            monto_facturado: 0,
          });
        }
        const centroByNombre = centrosMapByNombre.get(nombreCC)!;
        // Solo tickets CONFIRMADOS suman al desglose (igual que cron y EDP manual)
        if (!esAnulado) {
          centroByNombre.cantidad_tickets += 1;
          centroByNombre.monto_facturado += montoTicket;
        }
      });
    }


    // Calcular montos netos por centro de costo (solo centros con tickets confirmados > 0)
    const centrosCostoArray = Array.from(centrosMapByNombre.values())
      .filter((cc) => cc.cantidad_tickets > 0)
      .map((cc) => ({
        ...cc,
        monto_neto: cc.monto_facturado,
      }))
      .sort((a, b) => b.monto_neto - a.monto_neto);

    // Monto bruto total de pasajes generados
    const montoBrutoAntesDeDescuento = centrosCostoArray.reduce(
      (sum, cc) => sum + cc.monto_neto,
      0,
    );


    const devolucionesEstado =
      Number(estadoData.suma_devoluciones || 0) -
      Number(estadoData.reclamos_descuento || 0) -
      Number(estadoData.devoluciones_fuera_periodo || 0);

    // Consumo de boletos confirmados del periodo sobre el cual se aplica el descuento por tramos
    const netoConsumoReal = montoBrutoAntesDeDescuento;

    const porcentajeDescuento = Number(estadoData.porcentaje_descuento || 0);
    const montoDescuento = Math.round(
      netoConsumoReal * (porcentajeDescuento / 100),
    );



    // Determinar si el descuento proviene de tramos comerciales de la empresa o fue aplicado manualmente
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

    // J = I - E - F (calculado dinámicamente para garantizar coherencia con lo que muestra el PDF)
    // I = montoBrutoAntesDeDescuento - montoDescuento
    const montoI = Math.max(0, montoBrutoAntesDeDescuento - montoDescuento);
    const devFueraBD = Number(estadoData.devoluciones_fuera_periodo || 0);
    const montoFinalConDescuento = estadoData.monto_facturado !== undefined && estadoData.monto_facturado !== null
      ? Number(estadoData.monto_facturado)
      : Math.max(0, montoI - devFueraBD - montoReclamos);

    // Saldo a Favor Restante (Acumulado para próx. período) proviene de los campos de la empresa
    const saldoFavorRestante =
      Number(empresaData.devolucion_pendiente_edp || 0) +
      Number(empresaData.descuento_pendiente_edp || 0);

    const edpData: EDPPDFData = {
      edp: {
        numero_edp: estadoData.id!.toString(),
        fecha_generacion: estadoData.fecha_generacion
          ? new Date(estadoData.fecha_generacion).toLocaleDateString("es-CL")
          : null,
        periodo_reservas:
          estadoData.fecha_inicio && estadoData.fecha_fin
            ? `${parseDateString(estadoData.fecha_inicio).toLocaleDateString("es-CL")} - ${parseDateString(
                estadoData.fecha_fin,
              ).toLocaleDateString("es-CL")}`
            : null,
      },
      empresa: {
        id: Number(empresaData.id),
        nombre: empresaData.nombre,
        rut: empresaData.rut ?? "No disponible",
        cuenta_corriente: empresaData.cuenta_corriente ?? null,
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
        devoluciones_fuera_periodo: Number(
          estadoData.devoluciones_fuera_periodo || 0,
        ),
        saldo_favor_restante: saldoFavorRestante,
      },
      centros_costo: centrosCostoArray.map((cc, idx) => ({
        id: idx + 1,
        nombre: cc.nombre,
        cantidad_tickets: cc.cantidad_tickets,
        monto_facturado: cc.monto_neto, // Usar monto NETO en el desglose
      })),
      totales: {
        cantidad_tickets: ticketsConfirmados,
        monto_facturado: montoBrutoAntesDeDescuento,
      },

    };


    const pdfBytes = await generateEDPPDF(edpData);
    const pdfBuffer = Buffer.from(pdfBytes);

    const fileName = `EDP-${empresaData.nombre.replace(/\s+/g, "-")}-${estadoData.periodo || "sin-fecha"}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Error al generar PDF de estado de cuenta:", error);
    return res.status(500).json({
      message: "Error al generar PDF",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

export const generarExcelEstadoCuenta = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log("Generando Excel maquetado para estado de cuenta ID:", id);

    const estadoCuenta = await EstadoCuenta.findByPk(id);
    if (!estadoCuenta) {
      return res
        .status(404)
        .json({ message: "Estado de cuenta no encontrado" });
    }
    const estadoData = estadoCuenta.toJSON();

    const empresa = await Empresa.findByPk(estadoData.empresa_id);
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }
    const empresaData = empresa.get({ plain: true }) as IEmpresa;

    let tickets: any[] = [];
    const snapshots = await EdpTicketSnapshot.findAll({
      where: { edp_id: id },
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
    } else if (estadoData.fecha_inicio && estadoData.fecha_fin) {
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
          { model: User, required: false },
          {
            model: Pasajero,
            required: false,
            include: [{ model: CentroCosto, required: false }],
          },
          { model: Reclamo, required: false },
        ],
      });
      tickets = ticketsInstances.map((t) => t.get({ plain: true }));
    }

    const periodoReservas =
      estadoData.fecha_inicio && estadoData.fecha_fin
        ? `${estadoData.fecha_inicio.substring(0, 10)} - ${estadoData.fecha_fin.substring(0, 10)}`
        : estadoData.periodo;

    const excelBuffer = await generateEDPExcelBuffer(
      tickets,
      empresaData.nombre,
      empresaData.rut ?? "",
      empresaData.cuenta_corriente ?? "",
      estadoData.periodo,
      periodoReservas,
    );

    const fileName = `tickets_edp_${estadoData.periodo}_${empresaData.cuenta_corriente || empresaData.id}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", excelBuffer.length);

    return res.send(excelBuffer);
  } catch (error) {
    console.error("Error al generar Excel de estado de cuenta:", error);
    return res.status(500).json({
      message: "Error al generar Excel",
      error: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

