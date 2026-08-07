import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { Sequelize } from "sequelize-typescript";
import { Empresa } from "../models/empresa.model";
import { EmpresaTramo } from "../models/empresa_tramos.model";
import { CentroCosto } from "../models/centro_costo.model";
import { User } from "../models/user.model";
import { CuentaCorriente } from "../models/cuenta_corriente.model";
import { Ticket } from "../models/ticket.model";
import { EstadoCuenta } from "../models/estado_cuenta.model";
import { Pasajero } from "../models/pasajero.model";
import { UserEmpresa } from "../models/user_empresa.model";
import { Reclamo } from "../models/reclamo.model";
import { EdpTicketSnapshot } from "../models/edp_ticket_snapshot.model";
import "../models/associations";

/**
 * Script interactivo y ejecutable para actualizar/insertar la información de Empresas desde Excel.
 * Uso:
 *   npx ts-node src/script/importEmpresasExcel.ts <ruta_al_archivo_excel> [--dry-run]
 * Ejemplo:
 *   npx ts-node src/script/importEmpresasExcel.ts ./data/Empresas.xlsx
 */

// Limpia y normaliza los nombres de encabezados del Excel
function normalizeHeader(header: string): string {
  if (!header) return "";
  const raw = header.toString().trim();
  const clean = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remueve tildes
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_");

  // Mapeo directo de las 20 columnas del Excel `excel_empresa.xlsx`
  if (clean.includes("recargo")) return "recargo";
  if (clean.includes("devolucion")) return "porcentaje_devolucion";
  if (clean.includes("emision") || (clean.includes("facturacion") && clean.includes("dia"))) return "dia_facturacion";
  if (clean.includes("vencimiento")) return "dia_vencimiento";
  if (clean.includes("monto_maximo")) return "monto_maximo";
  if (clean.includes("monto_acumulado")) return "monto_acumulado";
  if (clean.includes("rut")) return "rut";
  if (clean.includes("cuenta_corriente")) return "cuenta_corriente";
  if (clean.includes("facturacion_automatica")) return "fact_manual"; // Facturación Automática (Sí/No)
  if (clean.includes("morosidad")) return "morosidad";

  return clean;
}

function parseNumber(val: any): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
}

function parsePhone(val: any): string | undefined {
  if (val === undefined || val === null) return undefined;
  // Remueve todo lo que no sea estrictamente un dígito (0-9), incluyendo el signo +, guiones, espacios y paréntesis
  const str = String(val).trim().replace(/[^0-9]/g, "");
  return str === "" ? undefined : str;
}

function parseString(val: any): string | undefined {
  if (val === undefined || val === null) return undefined;
  const str = String(val).trim();
  return str === "" ? undefined : str;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  // Si no especifican archivo, usar por defecto 'excel_empresa.xlsx' si existe
  let filePathArg = args.find((arg) => !arg.startsWith("--"));
  if (!filePathArg && fs.existsSync(path.resolve(process.cwd(), "excel_empresa.xlsx"))) {
    filePathArg = "excel_empresa.xlsx";
  }

  console.log("===============================================================================");
  console.log("🚀 SCRIPT DE ACTUALIZACIÓN DE EMPRESAS DESDE EXCEL");
  console.log(`📌 Modo: ${dryRun ? "SIMULACIÓN (--dry-run)" : "EJECUCIÓN REAL (Base de datos)"}`);
  console.log("===============================================================================\n");

  if (!filePathArg) {
    console.error("❌ ERROR: No se especificó el archivo Excel.");
    console.log("Uso: npx ts-node src/script/importEmpresasExcel.ts <ruta_al_excel> [--dry-run]");
    console.log("Ejemplo: npx ts-node src/script/importEmpresasExcel.ts excel_empresa.xlsx\n");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), filePathArg);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ERROR: El archivo en '${filePath}' no existe.`);
    process.exit(1);
  }

  console.log(`📁 Leyendo archivo: ${filePath}`);
  
  // Garantizar conexión explícita a la base de datos de DESARROLLO
  console.log("🔗 Conectando explícitamente a la Base de Datos de DESARROLLO...");
  const devSequelize = new Sequelize({
    dialect: "mysql",
    host: "ls-594a29bdbbcac0570afa88fba199455107a1c5a6.cs9gyyc0moxd.us-east-1.rds.amazonaws.com",
    port: 3306,
    username: "dbmasteruser",
    password: "aCY05KW.yh:jA%s{RO733w(AI|;Ui#6c",
    database: "multiempresa_db",
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
  });

  await devSequelize.authenticate();
  console.log("✅ Conexión con Base de Datos de DESARROLLO establecida exitosamente.");

  // Step 1: Asegurar que la columna `ente_facturador` existe en la tabla `empresas`
  try {
    console.log("\n🛠️ Verificando/creando la columna 'ente_facturador' en la tabla 'empresas' de Desarrollo...");
    const [results] = await devSequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'empresas' 
        AND COLUMN_NAME = 'ente_facturador';
    `);

    if ((results as any[]).length === 0) {
      console.log("➕ La columna 'ente_facturador' no existe. Agregándola a la tabla 'empresas'...");
      await devSequelize.query(`
        ALTER TABLE empresas 
        ADD COLUMN ente_facturador VARCHAR(150) NULL DEFAULT NULL;
      `);
      console.log("✅ Columna 'ente_facturador' agregada exitosamente a la base de datos de desarrollo.");
    } else {
      console.log("✅ La columna 'ente_facturador' ya existe en la base de datos de desarrollo.");
    }
  } catch (err: any) {
    console.error("❌ Error al verificar o alterar la estructura de la base de datos:", err.message);
    process.exit(1);
  }

  // Step 2: Cargar y leer el archivo Excel con XLSX
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    console.error("❌ ERROR: El libro de Excel no contiene ninguna hoja.");
    process.exit(1);
  }

  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  console.log(`📊 Hoja detectada: '${sheetName}' con ${rawRows.length} filas.`);

  // Mapear filas desde rawRows
  const summary = {
    totalFilas: rawRows.length,
    actualizadas: 0,
    creadas: 0,
    omitidasPorVacio: 0,
    errores: 0,
  };

  const logs: string[] = [];

  const logAndPrint = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  // Iterar filas
  for (let index = 0; index < rawRows.length; index++) {
    const rawRow = rawRows[index];
    const rowNum = index + 2; // Fila 1 es el encabezado en Excel

    // Normalizar llaves del objeto rawRow
    const rowData: any = {};
    for (const key of Object.keys(rawRow)) {
      const normKey = normalizeHeader(key);
      if (normKey) {
        rowData[normKey] = rawRow[key];
      }
    }

    const empresaId = parseNumber(rowData.id || rowData.empresa_id);
    const nombre = parseString(rowData.nombre || rowData.empresa);
    const contactoFactNombre = parseString(rowData.contacto_fact_nombre);
    const enteFacturador = parseString(rowData.ente_facturador);

    // REGLA SOLICITADA:
    // "si la data no esta para la empresa por ejemplo contacto_fact_nombre vacio, no agregar nada y seguir instertando."
    if (!contactoFactNombre && !enteFacturador && !nombre) {
      summary.omitidasPorVacio++;
      logAndPrint(
        `⚠️ Fila ${rowNum}: OMITIDA - No tiene datos significativos o contacto_fact_nombre/ente_facturador están vacíos. (ID: ${empresaId || "N/A"})`
      );
      continue;
    }

    try {
      // Buscar empresa existente por ID o por Nombre explícitamente en DESARROLLO
      let empresaExistente: Empresa | null = null;

      if (empresaId) {
        empresaExistente = await Empresa.findOne({ where: { id: empresaId } });
      }
      if (!empresaExistente && nombre) {
        empresaExistente = await Empresa.findOne({ where: { nombre } });
      }

      // PREPARAR OBJETO DE CAMPOS A ACTUALIZAR / INSERTAR
      // REGLA ESTRICTA SOLICITADA POR EL USUARIO:
      // ÚNICAMENTE se actualizan/insertan estos 10 campos visibles:
      // id, nombre, tipo_facturacion, ente_facturador, contacto_fact_nombre, contacto_fact_email, contacto_fact_telefono, ejecutivo_com_nombre, ejecutivo_com_email, ejecutivo_com_telefono
      const updateData: Partial<Empresa> = {};

      if (nombre && (!empresaExistente || empresaExistente.nombre !== nombre)) {
        updateData.nombre = nombre;
      }

      const tipoFact = parseString(rowData.tipo_facturacion);
      if ((tipoFact === "Masiva" || tipoFact === "Especial") && (!empresaExistente || empresaExistente.tipo_facturacion !== tipoFact)) {
        updateData.tipo_facturacion = tipoFact;
      }

      if (enteFacturador && (!empresaExistente || empresaExistente.ente_facturador !== enteFacturador)) {
        updateData.ente_facturador = enteFacturador;
      }

      if (contactoFactNombre && (!empresaExistente || empresaExistente.contacto_fact_nombre !== contactoFactNombre)) {
        updateData.contacto_fact_nombre = contactoFactNombre;
      }

      const cEmail = parseString(rowData.contacto_fact_email);
      if (cEmail && (!empresaExistente || empresaExistente.contacto_fact_email !== cEmail)) {
        updateData.contacto_fact_email = cEmail;
      }

      const cTel = parsePhone(rowData.contacto_fact_telefono);
      if (cTel && (!empresaExistente || empresaExistente.contacto_fact_telefono !== cTel)) {
        updateData.contacto_fact_telefono = cTel;
      }

      const eNom = parseString(rowData.ejecutivo_com_nombre);
      if (eNom && (!empresaExistente || empresaExistente.ejecutivo_com_nombre !== eNom)) {
        updateData.ejecutivo_com_nombre = eNom;
      }

      const eEmail = parseString(rowData.ejecutivo_com_email);
      if (eEmail && (!empresaExistente || empresaExistente.ejecutivo_com_email !== eEmail)) {
        updateData.ejecutivo_com_email = eEmail;
      }

      const eTel = parsePhone(rowData.ejecutivo_com_telefono);
      if (eTel && (!empresaExistente || empresaExistente.ejecutivo_com_telefono !== eTel)) {
        updateData.ejecutivo_com_telefono = eTel;
      }

      if (empresaExistente) {
        // Comparar valores actuales de la BD vs nuevos valores a actualizar
        const camposCambiados: string[] = [];
        let cambioTipoFacturacion = false;
        let tipoFactDetalle = "";

        for (const [key, val] of Object.entries(updateData)) {
          const valActual = (empresaExistente as any)[key];
          // Convertir a string para comparar limpia y objetivamente
          const strActual = valActual !== undefined && valActual !== null ? String(valActual).trim() : "";
          const strNuevo = val !== undefined && val !== null ? String(val).trim() : "";

          if (strActual !== strNuevo) {
            camposCambiados.push(`     - [${key}]: '${strActual || "vacío"}' ➔ '${strNuevo}'`);
            if (key === "tipo_facturacion") {
              cambioTipoFacturacion = true;
              tipoFactDetalle = `De '${strActual}' ➔ '${strNuevo}'`;
            }
          }
        }

        if (camposCambiados.length === 0) {
          logAndPrint(`ℹ️ Fila ${rowNum}: Empresa ID ${empresaExistente.id} (${empresaExistente.nombre}) ➔ SIN CAMBIOS (todos los datos del Excel coinciden con la BD).`);
        } else {
          logAndPrint(`🔄 Fila ${rowNum}: ACTUALIZANDO Empresa ID ${empresaExistente.id} (${empresaExistente.nombre}):`);
          if (cambioTipoFacturacion) {
            logAndPrint(`   📌 TIPO FACTURACIÓN CAMBIÓ: ${tipoFactDetalle}`);
          } else {
            logAndPrint(`   ℹ️ TIPO FACTURACIÓN: No cambió (se mantiene '${empresaExistente.tipo_facturacion}')`);
          }
          logAndPrint(`   📋 Campos que se modificarán en BD:`);
          camposCambiados.forEach((c) => logAndPrint(c));

          if (!dryRun) {
            await empresaExistente.update(updateData);
          }
        }
        summary.actualizadas++;
      } else {
        if (!nombre) {
          summary.errores++;
          logAndPrint(`❌ Fila ${rowNum}: ERROR - No se puede crear empresa porque el nombre está vacío.`);
          continue;
        }

        logAndPrint(`✨ Fila ${rowNum}: INSERTANDO NUEVA Empresa '${nombre}' (ID: ${empresaId || "autogenerado"}):`);
        logAndPrint(`   📌 TIPO FACTURACIÓN ASIGNADO: '${updateData.tipo_facturacion || "Masiva"}'`);
        logAndPrint(`   📋 Datos a insertar: ${JSON.stringify(updateData, null, 2)}`);

        if (!dryRun) {
          if (empresaId) updateData.id = empresaId;
          await Empresa.create(updateData as any);
        }
        summary.creadas++;
      }
    } catch (err: any) {
      summary.errores++;
      logAndPrint(`❌ Fila ${rowNum}: ERROR al procesar empresa ID ${empresaId || "N/A"}: ${err.message}`);
    }
  }

  console.log("\n===============================================================================");
  console.log("📊 RESUMEN FINAL DEL PROCESO");
  console.log("===============================================================================");
  console.log(`🔹 Total de filas evaluadas : ${summary.totalFilas}`);
  console.log(`✅ Empresas actualizadas    : ${summary.actualizadas}`);
  console.log(`✨ Empresas creadas         : ${summary.creadas}`);
  console.log(`⚠️ Omitidas por estar vacías : ${summary.omitidasPorVacio}`);
  console.log(`❌ Errores                  : ${summary.errores}`);
  console.log("===============================================================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Error fatal no controlado:", err);
  process.exit(1);
});
