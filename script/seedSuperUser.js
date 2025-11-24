import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function createSuperUser() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const email = "superuser@system.com";
  const password = "Super1234";
  const hashedPassword = await bcrypt.hash(password, 10);

  await conn.execute(
    `INSERT INTO users (nombre, rut, email, password, rol, empresa)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    ["Super Usuario", "00.000.000-0", email, hashedPassword, "superuser"]
  );

  console.log("✔ SuperUser creado!");
  process.exit(0);
}

createSuperUser();
