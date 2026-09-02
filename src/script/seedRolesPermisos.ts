import { connectDB, sequelize } from "../database";
import ExcelJS from "exceljs";
import path from "path";

// Generar una clave técnica limpia a partir de módulo y acción
function generarClave(modulo: string, accion: string): string {
  const normalizar = (str: string) =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quitar tildes
      .replace(/[^a-z0-9]+/g, "_") // solo alfanumérico y guion bajo
      .replace(/^_+|_+$/g, ""); // recortar guiones al inicio/fin

  return `${normalizar(modulo)}_${normalizar(accion)}`;
}

export async function seedRolesPermisos() {
  await connectDB();

  console.log("🚀 Iniciando migración y seed de Roles y Permisos...");

  // 1. Crear tabla roles_permisos si no existe
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roles_permisos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      modulo VARCHAR(100) NOT NULL,
      accion VARCHAR(150) NOT NULL,
      clave VARCHAR(100) NOT NULL UNIQUE,
      subusuario BOOLEAN DEFAULT FALSE,
      empresa BOOLEAN DEFAULT FALSE,
      admin BOOLEAN DEFAULT FALSE,
      auditoria BOOLEAN DEFAULT FALSE,
      contralor BOOLEAN DEFAULT FALSE,
      admincc BOOLEAN DEFAULT FALSE,
      superuser BOOLEAN DEFAULT TRUE,
      soporte BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_modulo (modulo),
      INDEX idx_clave (clave)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log("✅ Tabla 'roles_permisos' verificada / creada con éxito.");

  // 2. Leer archivo roles_permisos.xlsx
  const excelPath = path.join(process.cwd(), "roles_permisos.xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  const worksheet = workbook.getWorksheet("ROLES Y PERFILES");
  if (!worksheet) {
    throw new Error("No se encontró la hoja 'ROLES Y PERFILES' en roles_permisos.xlsx");
  }

  const filas: any[] = [];

  worksheet.eachRow((row, rowNumber) => {
    // Encabezados en fila 2, datos desde fila 3
    if (rowNumber > 2) {
      const values: any = row.values;
      // values[1] = Modulos, values[2] = Accion, values[3] = subusuario,
      // values[4] = admin, values[5] = auditoria, values[6] = contralor,
      // values[7] = admincc, values[8] = superuser, values[9] = soporte
      let modulo = String(values[1] || "").trim();
      if (modulo.toLowerCase() === "cuantas corrientes") {
        modulo = "Cuentas Corrientes";
      }
      const accion = String(values[2] || "").trim();

      if (modulo && accion) {
        const parseSi = (v: any) => String(v || "").trim().toLowerCase() === "si";

        const subusuario = parseSi(values[3]);
        const admin = parseSi(values[4]);
        const auditoria = parseSi(values[5]);
        const contralor = parseSi(values[6]);
        const admincc = parseSi(values[7]);
        const superuser = parseSi(values[8]) || true; // superuser siempre tiene acceso
        const soporte = parseSi(values[9]);

        // Rol empresa: alineado con permisos corporativos base (búsqueda y reservas)
        const empresa = subusuario || (modulo === "Buscar" || modulo === "Reservas");

        const clave = generarClave(modulo, accion);

        filas.push({
          modulo,
          accion,
          clave,
          subusuario,
          empresa,
          admin,
          auditoria,
          contralor,
          admincc,
          superuser,
          soporte,
        });
      }
    }
  });

  console.log(`📋 Se leyeron ${filas.length} acciones desde roles_permisos.xlsx.`);

  // 3. Insertar o actualizar registros en la tabla
  for (const fila of filas) {
    await sequelize.query(
      `
      INSERT INTO roles_permisos (modulo, accion, clave, subusuario, empresa, admin, auditoria, contralor, admincc, superuser, soporte)
      VALUES (:modulo, :accion, :clave, :subusuario, :empresa, :admin, :auditoria, :contralor, :admincc, :superuser, :soporte)
      ON DUPLICATE KEY UPDATE
        modulo = VALUES(modulo),
        accion = VALUES(accion),
        subusuario = VALUES(subusuario),
        empresa = VALUES(empresa),
        admin = VALUES(admin),
        auditoria = VALUES(auditoria),
        contralor = VALUES(contralor),
        admincc = VALUES(admincc),
        superuser = VALUES(superuser),
        soporte = VALUES(soporte),
        updated_at = NOW();
      `,
      { replacements: fila }
    );
  }

  console.log(`🎉 ¡Éxito! ${filas.length} acciones cargadas exitosamente en la base de datos.`);
}

if (require.main === module) {
  seedRolesPermisos()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error al ejecutar seed de roles y permisos:", err);
      process.exit(1);
    });
}
