import { Op } from "sequelize";
import { connectDB, sequelize } from "../database";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";

export const populateEmpresaInTickets = async () => {
    try {
        await connectDB();
        
        console.log("🚀 Iniciando proceso de población de empresas en tickets...");

        // Opción 1: Usar consulta SQL directa (RECOMENDADO)
        const [tickets] = await sequelize.query(`
            SELECT t.id, t.ticketNumber, t.id_User, u.empresa_id
            FROM tickets t
            LEFT JOIN users u ON t.id_User = u.id
            WHERE t.id_empresa IS NULL
            ORDER BY t.id
        `);

        console.log(`📊 Encontrados ${tickets.length} tickets sin empresa asignada`);

        let updated = 0;
        let skipped = 0;
        let errors = 0;
        
        for (const ticket of tickets as any[]) {
            try {
                if (ticket.empresa_id) {
                    // Actualizar usando query SQL
                    await sequelize.query(`
                        UPDATE tickets 
                        SET id_empresa = :empresaId
                        WHERE id = :ticketId
                    `, {
                        replacements: {
                            empresaId: ticket.empresa_id,
                            ticketId: ticket.id
                        }
                    });
                    
                    updated++;
                    
                    if (updated % 100 === 0) {
                        console.log(`⏳ Progreso: ${updated} tickets actualizados...`);
                    }
                } else {
                    skipped++;
                    console.log(`⚠️  Ticket ${ticket.id} (Usuario: ${ticket.id_User}) no tiene empresa asignada (skipped)`);
                }
            } catch (error) {
                errors++;
                console.error(`❌ Error actualizando ticket ${ticket.id}:`, error);
            }
        }

        console.log(`✅ Proceso completado:`);
        console.log(`   - Tickets actualizados: ${updated}`);
        console.log(`   - Tickets omitidos: ${skipped}`);
        console.log(`   - Errores: ${errors}`);
        console.log(`   - Total procesados: ${tickets.length}`);
        
        // Estadísticas adicionales
        const [result] = await sequelize.query(`
            SELECT 
                COUNT(*) as total_con_empresa,
                (SELECT COUNT(*) FROM tickets WHERE id_empresa IS NULL) as total_sin_empresa
            FROM tickets 
            WHERE id_empresa IS NOT NULL
        `);
        
        const stats = (result as any[])[0];
        console.log(`📈 Estadísticas finales:`);
        console.log(`   - Tickets con empresa: ${stats.total_con_empresa}`);
        console.log(`   - Tickets sin empresa: ${stats.total_sin_empresa}`);
        
        // Mostrar algunos ejemplos
        if (stats.total_sin_empresa > 0) {
            const [remaining] = await sequelize.query(`
                SELECT t.id, t.ticketNumber, t.id_User, u.nombre as usuario_nombre, u.empresa_id
                FROM tickets t
                LEFT JOIN users u ON t.id_User = u.id
                WHERE t.id_empresa IS NULL
                LIMIT 10
            `);
            
            console.log(`📋 Ejemplos de tickets que aún no tienen empresa (primeros 10):`);
            console.table(remaining);
        }
        
    } catch (error) {
        console.error('❌ Error en populateEmpresaInTickets:', error);
        process.exit(1);
    } finally {
        // Cerrar conexión
        await sequelize.close();
        console.log("🔌 Conexión cerrada");
        process.exit(0);
    }
};

// Ejecutar si este archivo se ejecuta directamente
if (require.main === module) {
    populateEmpresaInTickets();
}