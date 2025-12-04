// src/controllers/dashboard.controller.ts
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Empresa } from '../models/empresa.model';
import { Ticket } from '../models/ticket.model';
import { User } from '../models/user.model';
import { CentroCosto } from '../models/centro_costo.model';

export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const rol = (req.user as any).rol;
        const empresa_id = (req.user as any).empresa_id;

        let totalEmpresas = 0;
        let totalCentrosCosto = 0;
        let totalReservasConfirmadas = 0;
        let totalUsuariosActivos = 0;
        let montoBoletos = 0;

        if (rol === "admin" || rol === "empresa" || rol === "subusuario") {
            // Solo datos de su propia empresa
            if (!empresa_id) {
                return res.status(400).json({ message: "Empresa no asociada" });
            }

            // Obtener empresa con sus centros de costo
            const empresa = await Empresa.findByPk(empresa_id, {
                include: [{
                    model: CentroCosto,
                    attributes: ['id']
                }]
            });

            if (!empresa) {
                return res.status(404).json({ message: "Empresa no encontrada" });
            }

            // Contar centros de costo de la empresa
            totalCentrosCosto = await CentroCosto.count({
                where: { empresa_id }
            });

            // Contar reservas confirmadas de la empresa
            totalReservasConfirmadas = await Ticket.count({
                where: {
                    ticketStatus: 'Confirmed'
                },
                include: [{
                    model: User,
                    where: {
                        empresa_id,
                        estado: true
                    },
                    required: true
                }]
            });

            // Contar usuarios activos de la empresa
            totalUsuariosActivos = await User.count({
                where: {
                    empresa_id,
                    estado: true
                }
            });

            // Monto acumulado de la empresa
            montoBoletos = empresa.monto_acumulado || 0;
            totalEmpresas = 1;

        } else if (rol === "superuser" || rol === "contralor") {
            // Todos los datos del sistema

            // Total de empresas activas
            totalEmpresas = await Empresa.count({
                where: { estado: true }
            });

            // Total de reservas confirmadas
            totalReservasConfirmadas = await Ticket.count({
                where: {
                    ticketStatus: 'Confirmed'
                }
            });

            // Total de usuarios activos (excluyendo superuser si es necesario)
            totalUsuariosActivos = await User.count({
                where: {
                    estado: true,
                    rol: { [Op.ne]: 'superuser' }
                }
            });

            // Suma total de todos los montos acumulados de las empresas
            const empresas = await Empresa.findAll({
                where: { estado: true },
                attributes: ['monto_acumulado']
            });

            montoBoletos = empresas.reduce((sum, emp) => {
                return sum + (emp.monto_acumulado || 0);
            }, 0);

            // Para superuser/contralor, totalCentrosCosto sería el total de todos los centros
            totalCentrosCosto = await CentroCosto.count();

        } else {
            return res.status(403).json({ message: "No autorizado" });
        }

        // Misma estructura de respuesta para todos los roles
        return res.json({
            totalEmpresas,
            totalCentrosCosto,
            totalReservasConfirmadas,
            totalUsuariosActivos,
            montoBoletos
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error en servidor" });
    }
};