import * as bcrypt from "bcrypt";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

/**
 * Crea la empresa "WIT SPA", un centro de costo y un usuario superuser.
 */
async function seedEmpresaCentroCostoSuperUser() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    // Crear empresa WIT SPA
    await conn.execute(
        `INSERT INTO empresas (nombre, estado, recargo, porcentaje_devolucion)
         VALUES (?, 1, 0, 0.00)
         ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
        ["WIT SPA"]
    );
    // Obtener el id de la empresa creada o existente
    const [empresaIdRows] = await conn.query(
        `SELECT id FROM empresas WHERE nombre = ? LIMIT 1`,
        ["WIT SPA"]
    );
    const empresaId =
        Array.isArray(empresaIdRows) && empresaIdRows.length > 0 && "id" in empresaIdRows[0]
            ? (empresaIdRows[0] as { id: number }).id
            : null;
    if (!empresaId) {
        console.error("No se pudo obtener el id de la empresa WIT SPA");
        process.exit(1);
    }

    // Crear centro de costo principal para WIT SPA
    await conn.execute(
        `INSERT INTO centros_costo (nombre, empresa_id, estado, created_at, updated_at)
         VALUES (?, ?, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
        ["Principal", empresaId]
    );
    // Obtener el id del centro de costo creado o existente
    const [centroCostoIdRows] = await conn.query(
        `SELECT id FROM centros_costo WHERE nombre = ? AND empresa_id = ? LIMIT 1`,
        ["Principal", empresaId]
    );
    const centroCostoId =
        Array.isArray(centroCostoIdRows) && centroCostoIdRows.length > 0 && "id" in centroCostoIdRows[0]
            ? (centroCostoIdRows[0] as { id: number }).id
            : null;
    if (!centroCostoId) {
        console.error("No se pudo obtener el id del centro de costo Principal");
        process.exit(1);
    }

    // Crear usuario superuser
    const email = "superuser@system.com";
    const password = "Super1234";
    const hashedPassword = await bcrypt.hash(password, 10);

    await conn.execute(
        `INSERT INTO users (nombre, rut, email, password, rol, empresa_id, centro_costo_id, estado, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE id=id`,
        [
            "Super Usuario",
            "00.000.000-0",
            email,
            hashedPassword,
            "superuser",
            empresaId,
            centroCostoId
        ]
    );

    console.log("✔ Empresa WIT SPA, centro de costo y SuperUser creados!");
    process.exit(0);
}

seedEmpresaCentroCostoSuperUser().catch((err) => {
    console.error("Error en el seed:", err);
    process.exit(1);
});
