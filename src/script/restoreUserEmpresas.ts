import * as fs from "fs";
import * as path from "path";
import { sequelize } from "../database";

async function run() {
    const transaction = await sequelize.transaction();
    try {
        console.log("Connecting to the database...");
        await sequelize.authenticate();

        console.log("1. Creating table 'user_empresas' with exact schema...");
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS user_empresas (
              id int NOT NULL AUTO_INCREMENT,
              user_id int NOT NULL,
              empresa_id int NOT NULL,
              created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              UNIQUE KEY uq_user_empresa (user_id,empresa_id),
              KEY idx_user_id (user_id),
              KEY idx_empresa_id (empresa_id),
              CONSTRAINT fk_user_empresas_empresa FOREIGN KEY (empresa_id) REFERENCES empresas (id) ON DELETE CASCADE,
              CONSTRAINT fk_user_empresas_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB AUTO_INCREMENT=360 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
        `, { transaction });

        // Path to the backup CSV
        const csvPath = path.join(__dirname, "../../data/user_empresas.csv");
        console.log(`2. Reading backup data from ${csvPath}...`);

        if (!fs.existsSync(csvPath)) {
            throw new Error(`CSV file not found at: ${csvPath}`);
        }

        const fileContent = fs.readFileSync(csvPath, "utf-8");
        const lines = fileContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        
        // Skip header
        const records: { id: number; user_id: number; empresa_id: number; created_at: string | null }[] = [];
        for (let i = 1; i < lines.length; i++) {
            // Regex to split by comma except inside quotes
            const columns = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (columns.length >= 3) {
                const id = parseInt(columns[0]);
                const user_id = parseInt(columns[1]);
                const empresa_id = parseInt(columns[2]);
                const created_at = columns[3] ? columns[3].replace(/"/g, "") : null;
                
                if (!isNaN(id) && !isNaN(user_id) && !isNaN(empresa_id)) {
                    records.push({ id, user_id, empresa_id, created_at });
                }
            }
        }

        console.log(`3. Importing ${records.length} records into 'user_empresas'...`);

        for (const record of records) {
            await sequelize.query(`
                INSERT INTO user_empresas (id, user_id, empresa_id, created_at)
                VALUES (:id, :user_id, :empresa_id, :created_at)
                ON DUPLICATE KEY UPDATE created_at = VALUES(created_at);
            `, {
                replacements: {
                    id: record.id,
                    user_id: record.user_id,
                    empresa_id: record.empresa_id,
                    created_at: record.created_at
                },
                transaction
            });
        }

        await transaction.commit();
        console.log("Successfully restored user_empresas table and all data from CSV!");
        process.exit(0);
    } catch (err) {
        await transaction.rollback();
        console.error("Error during restoration:", err);
        process.exit(1);
    }
}

run();
