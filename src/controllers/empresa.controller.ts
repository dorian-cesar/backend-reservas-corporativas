import { Request, Response } from "express";
import ExcelJS from "exceljs";
import moment from "moment-timezone";
import { Empresa } from "../models/empresa.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import {
  IEmpresaCreate,
  IEmpresaUpdate,
} from "../interfaces/empresa.interface";
import { Op } from "sequelize";
import { UserEmpresa } from "../models/user_empresa.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { sequelize } from "../database";
import { obtenerResumenSaldoEmpresa } from "../services/empresaSaldo.service";

/**
 * Listar todas las empresas.
 */
// ... (mantenemos listarEmpresas igual, pero modificamos la importación arriba)

export const listarEmpresas = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const rol = user.rol;
    const user_id = user.id;
    const empresa_id = user.empresa_id;

    const page = req.query.page ? Number(req.query.page) : null;
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const ente_facturador = req.query.ente_facturador ? String(req.query.ente_facturador).trim() : null;

    const includeInactives = req.query.includeInactives === "true";

    let whereCondition: any = {};

    if (!includeInactives) {
      whereCondition.estado = true;
    }

    if (ente_facturador) {
      whereCondition.ente_facturador = ente_facturador;
    }

    if (search) {
      whereCondition[Op.or] = [
        { nombre: { [Op.like]: `%${search}%` } },
        { cuenta_corriente: { [Op.like]: `%${search}%` } },
      ];
    }

    if (rol === "admin") {
      const userEmpresas = await UserEmpresa.findAll({
        where: { user_id },
        attributes: ["empresa_id"],
      });

      const empresaIds = userEmpresas.map((ue) => ue.empresa_id);

      const finalEmpresaIds =
        empresaIds.length > 0 ? empresaIds : empresa_id ? [empresa_id] : [];

      if (finalEmpresaIds.length === 0) {
        return res.json(
          page && limit
            ? { data: [], pagination: { total: 0, page, limit, totalPages: 0 } }
            : [],
        );
      }

      whereCondition.id = {
        ...(whereCondition.id || {}),
        [Op.in]: finalEmpresaIds,
      };
    }

    if (rol !== "superuser" && empresa_id !== 1) {
      whereCondition.id = {
        ...(whereCondition.id || {}),
        [Op.ne]: 1,
      };
    }

    // Obtener deudas impagas de Cuenta Corriente agregadas por empresa en 1 sola consulta SQL instantánea
    const deudasImpagas = await CuentaCorriente.findAll({
      attributes: [
        "empresa_id",
        [sequelize.fn("SUM", sequelize.col("monto")), "deuda_cc_impaga"],
      ],
      where: {
        tipo_movimiento: "cargo",
        pagado: false,
      },
      group: ["empresa_id"],
      raw: true,
    });

    const mapaDeudasCC: Record<number, number> = {};
    (deudasImpagas as any[]).forEach((d) => {
      mapaDeudasCC[d.empresa_id] = Number(d.deuda_cc_impaga || 0);
    });

    const calcularResumenEmpresa = (empresa: Empresa) => {
      const empresaData = empresa.toJSON();
      const montoAcumulado = Number(empresa.monto_acumulado || 0);
      const deudaCC = mapaDeudasCC[empresa.id] || 0;
      const deudaTotal = montoAcumulado + deudaCC;
      const saldoLibre = empresa.monto_maximo
        ? empresa.monto_maximo - deudaTotal
        : null;

      return {
        ...empresaData,
        monto_acumulado: montoAcumulado,
        deuda_cc_impaga: deudaCC,
        deuda_total: deudaTotal,
        saldo_actual: deudaTotal,
        saldo_restante: saldoLibre,
      };
    };

    if (!page || !limit) {
      // Obtener empresas con datos básicos
      const empresas = await Empresa.findAll({
        where: whereCondition,
        order: [["id", "ASC"]],
        include: [{ model: EmpresaTramo, as: "tramos" }],
      });

      const empresasConSaldo = empresas.map(calcularResumenEmpresa);
      return res.json(empresasConSaldo);
    }

    const offset = (page - 1) * limit;

    const { rows, count } = await Empresa.findAndCountAll({
      where: whereCondition,
      order: [["id", "ASC"]],
      limit,
      offset,
      include: [{ model: EmpresaTramo, as: "tramos" }],
    });

    const empresasConSaldo = rows.map(calcularResumenEmpresa);

    return res.json({
      data: empresasConSaldo,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(count / limit)),
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error en servidor",
      error: (error as Error).message,
    });
  }
};

/**
 * Obtener una empresa por ID.
 */
export const obtenerEmpresa = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as any;
    const rol = user.rol;
    const empresa_id = user.empresa_id;

    // Si se intenta acceder a empresa 1 y el usuario no tiene permisos
    if (id === 1 && rol !== "superuser" && empresa_id !== 1) {
      return res.status(403).json({
        message: "No autorizado para ver esta empresa",
      });
    }

    const empresa = await Empresa.findByPk(id, {
      include: [{ model: EmpresaTramo, as: "tramos" }],
    });
    if (!empresa) return res.status(404).json({ message: "No encontrada" });

    const empresaData = empresa.toJSON();
    const resumen = await obtenerResumenSaldoEmpresa(empresa.id);

    res.json({
      ...empresaData,
      monto_acumulado: resumen.monto_acumulado,
      deuda_cc_impaga: resumen.deuda_cc_impaga,
      deuda_total: resumen.deuda_total,
      saldo_actual: resumen.deuda_total,
      saldo_restante: resumen.saldo_disponible_libre,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error en servidor", error: (error as Error).message });
  }
};

/**
 * Crear una empresa.
 */
export const crearEmpresa = async (
  req: Request<{}, {}, IEmpresaCreate>,
  res: Response,
) => {
  const {
    rut,
    nombre,
    giro,
    direccion,
    ciudad,
    comuna,
    cuenta_corriente,
    estado,
    recargo,
    porcentaje_devolucion,
    dia_facturacion,
    dia_vencimiento,
    monto_maximo,
    monto_acumulado,
    fact_manual,
    morosidad,
    tipo_facturacion,
    ente_facturador,
    contacto_fact_nombre,
    contacto_fact_email,
    contacto_fact_email_cc,
    contacto_fact_telefono,
    ejecutivo_com_nombre,
    ejecutivo_com_email,
    ejecutivo_com_telefono,
    tramos,
  } = req.body;

  if (cuenta_corriente) {
    const existing = await Empresa.findOne({
      where: { cuenta_corriente },
    });

    if (existing) {
      return res.status(400).json({
        message: "Ya existe una empresa con esa cuenta corriente",
      });
    }
  }

  const t = await sequelize.transaction();
  try {
    const empresa = await Empresa.create(
      {
        rut,
        nombre,
        giro,
        direccion,
        ciudad,
        comuna,
        cuenta_corriente,
        estado,
        recargo,
        porcentaje_devolucion,
        dia_facturacion,
        dia_vencimiento,
        monto_maximo,
        monto_acumulado,
        fact_manual,
        morosidad,
        tipo_facturacion: tipo_facturacion || "Masiva",
        ente_facturador,
        contacto_fact_nombre,
        contacto_fact_email,
        contacto_fact_email_cc,
        contacto_fact_telefono,
        ejecutivo_com_nombre,
        ejecutivo_com_email,
        ejecutivo_com_telefono,
      },
      { transaction: t },
    );

    if (tramos && Array.isArray(tramos)) {
      for (const tramo of tramos) {
        await EmpresaTramo.create(
          {
            id_empresa: empresa.id,
            monto_desde: Number(tramo.monto_desde) || 0,
            monto_hasta:
              tramo.monto_hasta !== null && tramo.monto_hasta !== undefined
                ? Number(tramo.monto_hasta)
                : null,
            porcentaje_descuento: Number(tramo.porcentaje_descuento) || 0,
          },
          { transaction: t },
        );
      }
    }

    await t.commit();
    res.json({ id: empresa.id, message: "Empresa creada" });
  } catch (error: any) {
    await t.rollback();
    res
      .status(500)
      .json({
        message: "Error en servidor al crear empresa",
        error: error.message,
      });
  }
};

/**
 * Actualizar una empresa.
 */
export const actualizarEmpresa = async (
  req: Request<{ id: string }, {}, IEmpresaUpdate>,
  res: Response,
) => {
  try {
    const id = parseInt(req.params.id);
    const empresa = await Empresa.findByPk(id);
    if (!empresa) return res.status(404).json({ message: "No encontrada" });

    const {
      rut,
      nombre,
      giro,
      direccion,
      ciudad,
      comuna,
      cuenta_corriente,
      estado,
      recargo,
      porcentaje_devolucion,
      dia_facturacion,
      dia_vencimiento,
      monto_maximo,
      fact_manual,
      morosidad,
      tipo_facturacion,
      ente_facturador,
      contacto_fact_nombre,
      contacto_fact_email,
      contacto_fact_email_cc,
      contacto_fact_telefono,
      ejecutivo_com_nombre,
      ejecutivo_com_email,
      ejecutivo_com_telefono,
      tramos,
    } = req.body;

    const t = await sequelize.transaction();
    try {
      await empresa.update(
        {
          rut,
          nombre,
          giro,
          direccion,
          ciudad,
          comuna,
          cuenta_corriente,
          estado,
          recargo,
          porcentaje_devolucion,
          dia_facturacion,
          dia_vencimiento,
          monto_maximo,
          fact_manual,
          morosidad,
          tipo_facturacion,
          ente_facturador,
          contacto_fact_nombre,
          contacto_fact_email,
          contacto_fact_email_cc,
          contacto_fact_telefono,
          ejecutivo_com_nombre,
          ejecutivo_com_email,
          ejecutivo_com_telefono,
        },
        { transaction: t },
      );

      if (tramos !== undefined) {
        await EmpresaTramo.destroy({
          where: { id_empresa: id },
          transaction: t,
        });

        if (Array.isArray(tramos)) {
          for (const tramo of tramos) {
            await EmpresaTramo.create(
              {
                id_empresa: id,
                monto_desde: Number(tramo.monto_desde) || 0,
                monto_hasta:
                  tramo.monto_hasta !== null && tramo.monto_hasta !== undefined
                    ? Number(tramo.monto_hasta)
                    : null,
                porcentaje_descuento: Number(tramo.porcentaje_descuento) || 0,
              },
              { transaction: t },
            );
          }
        }
      }

      await t.commit();
      res.json({ message: "Empresa actualizada" });
    } catch (error: any) {
      await t.rollback();
      res
        .status(500)
        .json({
          message: "Error al actualizar la empresa",
          error: error.message,
        });
    }
  } catch (err: any) {
    res.status(500).json({ message: "Error en servidor", error: err.message });
  }
};

/**
 * Eliminar una empresa.
 */
export const eliminarEmpresa = async (req: Request, res: Response) => {
  const empresa = await Empresa.findByPk(req.params.id);
  if (!empresa) return res.status(404).json({ message: "No encontrada" });
  await empresa.destroy();
  res.json({ message: "Empresa eliminada" });
};

export const resetMontoAcumulado = async (
  req: Request<{ id: string }>,
  res: Response,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.user as any;

    const empresa = await Empresa.findByPk(id);
    if (!empresa) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const montoAnterior = empresa.monto_acumulado || 0;

    await empresa.update({
      monto_acumulado: 0,
    });

    console.log(`Monto acumulado reestablecido:`, {
      empresaId: empresa.id,
      empresaNombre: empresa.nombre,
      montoAnterior: montoAnterior,
      montoNuevo: 0,
      usuarioId: user.id,
      usuarioRol: user.rol,
      fecha: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Monto acumulado reestablecido a 0`,
      detalles: {
        empresa: {
          id: empresa.id,
          nombre: empresa.nombre,
        },
        monto_anterior: montoAnterior,
        monto_nuevo: 0,
        fecha_reestablecimiento: new Date(),
      },
    });
  } catch (err) {
    console.error("Error reestableciendo monto acumulado:", err);
    res.status(500).json({
      message: "Error en servidor",
      error: (err as Error).message,
    });
  }
};

export const setNewLoginForEmpresa = async (
  req: Request<{ id: string }, {}, { newLogin: boolean }>,
  res: Response,
) => {
  try {
    const empresaId = parseInt(req.params.id);
    const { newLogin } = req.body;

    if (isNaN(empresaId)) {
      return res.status(400).json({
        success: false,
        message: "ID de empresa inválido",
      });
    }

    const empresa = await Empresa.findByPk(empresaId);
    if (!empresa) {
      return res.status(404).json({
        success: false,
        message: "Empresa no encontrada",
      });
    }

    // Guardar el valor en la empresa
    await empresa.update({ newLogin });

    return res.json({
      success: true,
      message: `newLogin ${newLogin ? "activado" : "desactivado"} para la empresa "${empresa.nombre}"`,
      empresa: {
        id: empresa.id,
        nombre: empresa.nombre,
        newLogin,
      },
    });
  } catch (err) {
    console.error("Error en setNewLoginForEmpresa:", err);
    res.status(500).json({
      success: false,
      message: "Error en servidor",
      error: err instanceof Error ? err.message : "Error desconocido",
    });
  }
};

export const exportEmpresas = async (req: Request, res: Response) => {
  try {
    const query = `
            SELECT 
                id, 
                nombre, 
                recargo, 
                porcentaje_devolucion, 
                dia_facturacion, 
                dia_vencimiento, 
                monto_maximo, 
                monto_acumulado, 
                rut, 
                cuenta_corriente,
                fact_manual,
                morosidad,
                tipo_facturacion,
                contacto_fact_nombre,
                contacto_fact_email,
                contacto_fact_telefono,
                ejecutivo_com_nombre,
                ejecutivo_com_email,
                ejecutivo_com_telefono,
                ente_facturador
            FROM empresas
        `;
    const [rows] = await sequelize.query(query);
    return res.json(rows);
  } catch (err: any) {
    console.error("Error al exportar empresas:", err);
    return res
      .status(500)
      .json({ message: "Error interno del servidor", error: err.message });
  }
};

export const exportEmpresasExcel = async (req: Request, res: Response) => {
  try {
    const query = `
            SELECT 
                id, 
                nombre, 
                recargo, 
                porcentaje_devolucion, 
                dia_facturacion, 
                dia_vencimiento, 
                monto_maximo, 
                monto_acumulado, 
                rut, 
                cuenta_corriente,
                fact_manual,
                morosidad,
                tipo_facturacion,
                contacto_fact_nombre,
                contacto_fact_email,
                contacto_fact_telefono,
                ejecutivo_com_nombre,
                ejecutivo_com_email,
                ejecutivo_com_telefono,
                ente_facturador
            FROM empresas
        `;
    const [rows] = (await sequelize.query(query)) as [any[], any];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WIT Innovación Tecnológica";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Empresas", {
      pageSetup: { fitToPage: true, orientation: "landscape" },
    });

    const totalCols = 20;

    // ─── Encabezado institucional ─────────────────────────────────
    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = "PULLMAN BUS — LISTADO DE EMPRESAS";
    titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A1A2E" },
    };
    sheet.getRow(1).height = 28;

    sheet.mergeCells(2, 1, 2, totalCols);
    const subtitleCell = sheet.getCell(2, 1);
    subtitleCell.value = `Total Empresas: ${rows.length}  |  Exportado el: ${moment().tz("America/Santiago").format("DD/MM/YYYY HH:mm")}`;
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
      { header: "ID", key: "id", width: 8, align: "center" },
      { header: "RUT", key: "rut", width: 15, align: "left" },
      { header: "Nombre", key: "nombre", width: 30, align: "left" },
      { header: "Giro", key: "giro", width: 25, align: "left" },
      { header: "Dirección", key: "direccion", width: 30, align: "left" },
      { header: "Ciudad", key: "ciudad", width: 18, align: "left" },
      { header: "Comuna", key: "comuna", width: 18, align: "left" },
      { header: "Cta. Corriente", key: "cuenta_corriente", width: 18, align: "center" },
      { header: "Recargo (%)", key: "recargo", width: 14, align: "right" },
      { header: "% Devolución", key: "porcentaje_devolucion", width: 14, align: "right" },
      { header: "Día Facturación", key: "dia_facturacion", width: 16, align: "center" },
      { header: "Día Vencimiento", key: "dia_vencimiento", width: 16, align: "center" },
      { header: "Monto Máximo", key: "monto_maximo", width: 18, align: "right" },
      { header: "Monto Acumulado", key: "monto_acumulado", width: 18, align: "right" },
      { header: "Facturación Manual", key: "fact_manual", width: 18, align: "center" },
      { header: "Morosidad", key: "morosidad", width: 12, align: "center" },
      { header: "Tipo Facturación", key: "tipo_facturacion", width: 18, align: "center" },
      { header: "Contacto Fact. Nombre", key: "contacto_fact_nombre", width: 25, align: "left" },
      { header: "Contacto Fact. Email", key: "contacto_fact_email", width: 25, align: "left" },
      { header: "Contacto Fact. Email CC", key: "contacto_fact_email_cc", width: 35, align: "left" },
      { header: "Contacto Fact. Teléfono", key: "contacto_fact_telefono", width: 20, align: "left" },
      { header: "Ejecutivo Com. Nombre", key: "ejecutivo_com_nombre", width: 25, align: "left" },
      { header: "Ejecutivo Com. Email", key: "ejecutivo_com_email", width: 25, align: "left" },
      { header: "Ejecutivo Com. Teléfono", key: "ejecutivo_com_telefono", width: 20, align: "left" },
      { header: "Ente Facturador", key: "ente_facturador", width: 25, align: "left" },
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
        fgColor: { argb: "FFFF6600" }, // Naranja Pullman
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
      };
    });
    headerRow.height = 22;

    const formatCLP = (monto: any): string => {
      if (monto === null || monto === undefined) return "$0";
      return `$${Number(monto).toLocaleString("es-CL")}`;
    };

    const formatPercent = (val: any): string => {
      if (val === null || val === undefined) return "0%";
      return `${val}%`;
    };

    const formatBool = (val: any): string => {
      return val ? "Sí" : "No";
    };

    rows.forEach((empresa, idx) => {
      const rowData = {
        id: empresa.id,
        rut: empresa.rut || "",
        nombre: empresa.nombre || "",
        giro: empresa.giro || "",
        direccion: empresa.direccion || "",
        ciudad: empresa.ciudad || "",
        comuna: empresa.comuna || "",
        cuenta_corriente: empresa.cuenta_corriente || "",
        recargo: formatPercent(empresa.recargo),
        porcentaje_devolucion: formatPercent(empresa.porcentaje_devolucion),
        dia_facturacion: empresa.dia_facturacion !== null && empresa.dia_facturacion !== undefined ? empresa.dia_facturacion : "-",
        dia_vencimiento: empresa.dia_vencimiento !== null && empresa.dia_vencimiento !== undefined ? empresa.dia_vencimiento : "-",
        monto_maximo: formatCLP(empresa.monto_maximo),
        monto_acumulado: formatCLP(empresa.monto_acumulado),
        fact_manual: formatBool(empresa.fact_manual),
        morosidad: formatBool(empresa.morosidad),
        tipo_facturacion: empresa.tipo_facturacion || "",
        contacto_fact_nombre: empresa.contacto_fact_nombre || "",
        contacto_fact_email: empresa.contacto_fact_email || "",
        contacto_fact_email_cc: empresa.contacto_fact_email_cc || "",
        contacto_fact_telefono: empresa.contacto_fact_telefono || "",
        ejecutivo_com_nombre: empresa.ejecutivo_com_nombre || "",
        ejecutivo_com_email: empresa.ejecutivo_com_email || "",
        ejecutivo_com_telefono: empresa.ejecutivo_com_telefono || "",
        ente_facturador: empresa.ente_facturador || "-",
      };

      const row = sheet.addRow(rowData);
      const isEven = idx % 2 === 0;
      const rowFill: ExcelJS.FillPattern = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFFFFFFF" : "FFFAFAFA" },
      };

      row.eachCell((cell, colIdx) => {
        const colDef = COLUMNS[colIdx - 1];
        cell.fill = rowFill;
        cell.font = { size: 9 };
        cell.alignment = { 
          vertical: "middle", 
          horizontal: (colDef?.align || "left") as ExcelJS.Alignment["horizontal"] 
        };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFE9E9E9" } },
        };
      });
      row.height = 18;
    });

    const fileName = `empresas_export_${moment().tz("America/Santiago").format("YYYYMMDD_HHmmss")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const excelBuffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Length", (excelBuffer as any).length);
    return res.send(excelBuffer);

  } catch (err: any) {
    console.error("Error al exportar empresas excel:", err);
    return res
      .status(500)
      .json({ message: "Error interno del servidor", error: err.message });
  }
};
