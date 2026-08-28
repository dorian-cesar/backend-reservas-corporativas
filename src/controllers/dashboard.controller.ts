// src/controllers/dashboard.controller.ts
import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../database";
import { Empresa } from "../models/empresa.model";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { CentroCosto } from "../models/centro_costo.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { obtenerResumenSaldoEmpresa } from "../services/empresaSaldo.service";

/**
 * Obtener métricas resumidas del Dashboard de forma ultra optimizada.
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const rol = user?.rol;
    const empresa_id = user?.empresa_id;

    if (rol === "superuser" || rol === "contralor" || rol === "auditoria") {
      // 🚀 Consultas estadísticas globales ejecutadas en paralelo
      const [
        totalEmpresas,
        totalCentrosCosto,
        totalReservasConfirmadas,
        totalUsuariosActivos,
        montoBoletosResult,
        activasResult,
      ] = await Promise.all([
        Empresa.count({ where: { estado: true } }),
        CentroCosto.count(),
        Ticket.count({ where: { ticketStatus: "Confirmed" } }),
        User.count({ where: { estado: true, rol: { [Op.ne]: "superuser" } } }),
        Ticket.sum("monto_boleto", { where: { ticketStatus: "Confirmed" } }),
        sequelize.query<any>(
          `SELECT 
            COUNT(DISTINCT CASE WHEN e.rut IS NOT NULL AND TRIM(e.rut) != '' THEN e.rut END) AS totalEmpresasActivas,
            COUNT(DISTINCT e.id) AS totalCuentasActivas
           FROM empresas e
           WHERE 
             e.estado = true
             AND (
               e.id IN (SELECT DISTINCT id_empresa FROM tickets WHERE id_empresa IS NOT NULL)
               OR e.id IN (SELECT DISTINCT empresa_id FROM cuenta_corriente WHERE empresa_id IS NOT NULL)
             )`,
          { type: QueryTypes.SELECT }
        ),
      ]);

      const totalEmpresasActivas = Number(activasResult?.[0]?.totalEmpresasActivas || 0);
      const totalCuentasActivas = Number(activasResult?.[0]?.totalCuentasActivas || 0);

      return res.json({
        totalEmpresas,
        totalEmpresasActivas,
        totalCuentasActivas,
        totalCentrosCosto,
        totalReservasConfirmadas,
        totalUsuariosActivos,
        montoBoletos: Number(montoBoletosResult || 0),
        resumenSaldo: null,
      });
    } else if (rol === "admin" || rol === "empresa" || rol === "subusuario") {
      if (!empresa_id) {
        return res.status(400).json({ message: "Empresa no asociada al usuario" });
      }

      // 🚀 Consultas específicas por empresa ejecutadas en paralelo
      const [
        empresaObj,
        totalCentrosCosto,
        totalReservasConfirmadas,
        totalUsuariosActivos,
        montoBoletosResult,
        resumenSaldo,
        hasTickets,
        hasCuentas,
      ] = await Promise.all([
        Empresa.findOne({ where: { id: empresa_id } }),
        CentroCosto.count({ where: { empresa_id } }),
        Ticket.count({
          where: { id_empresa: empresa_id, ticketStatus: "Confirmed" },
        }),
        User.count({ where: { empresa_id, estado: true } }),
        Ticket.sum("monto_boleto", {
          where: { id_empresa: empresa_id, ticketStatus: "Confirmed" },
        }),
        obtenerResumenSaldoEmpresa(empresa_id),
        Ticket.count({ where: { id_empresa: empresa_id } }),
        CuentaCorriente.count({ where: { empresa_id } }),
      ]);

      const isEnabled = empresaObj?.estado ?? true;
      const hasActivity = (isEnabled && (hasTickets > 0 || hasCuentas > 0)) ? 1 : 0;

      return res.json({
        totalEmpresas: isEnabled ? 1 : 0,
        totalEmpresasActivas: hasActivity,
        totalCuentasActivas: hasActivity,
        totalCentrosCosto,
        totalReservasConfirmadas,
        totalUsuariosActivos,
        montoBoletos: Number(montoBoletosResult || 0),
        resumenSaldo,
      });
    } else {
      return res.status(403).json({ message: "No autorizado para ver estadísticas del dashboard" });
    }
  } catch (err) {
    console.error("Error en getDashboardStats:", err);
    return res.status(500).json({ message: "Error en el servidor al obtener métricas del dashboard" });
  }
};
