import * as dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../database";
import { Empresa } from "../models/empresa.model";
import * as XLSX from "xlsx";
import * as path from "path";

async function main() {
  console.log("==================================================");
  console.log(" ACTUALIZAR CONTACTOS Y ENTE FACTURADOR DESDE EXCEL");
  console.log("==================================================\n");

  await connectDB();

  const excelPath = path.join(__dirname, "../../empresas_email.xlsx");
  console.log(`Leyendo archivo Excel desde: ${excelPath}`);

  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convertir a JSON crudo (matriz de matrices)
  const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  if (rows.length === 0) {
    console.error("El archivo Excel está vacío.");
    process.exit(1);
  }

  // Buscar la fila de cabecera
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.includes("ID") && row.includes("RUT") && row.includes("Nombre")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    console.error("No se encontró la fila de cabecera con 'ID', 'RUT', 'Nombre'.");
    process.exit(1);
  }

  console.log(`Cabecera encontrada en la fila index: ${headerIndex}`);
  const headers = rows[headerIndex];
  
  // Mapeo de índices de columnas
  const colIdx = {
    id: headers.indexOf("ID"),
    contactoFactNombre: headers.indexOf("Contacto Fact. Nombre"),
    contactoFactEmail: headers.indexOf("Contacto Fact. Email"),
    contactoFactTelefono: headers.indexOf("Contacto Fact. Teléfono"),
    ejecutivoComNombre: headers.indexOf("Ejecutivo Com. Nombre"),
    ejecutivoComEmail: headers.indexOf("Ejecutivo Com. Email"),
    ejecutivoComTelefono: headers.indexOf("Ejecutivo Com. Teléfono"),
    enteFacturador: headers.indexOf("Ente Facturador"),
  };

  console.log("Índices de columnas mapeados:", colIdx);

  const dataRows = rows.slice(headerIndex + 1);
  console.log(`Procesando ${dataRows.length} filas de datos...`);

  let actualizadas = 0;
  let sinCambios = 0;
  let noEncontradas = 0;
  const reporteCambios: any[] = [];

  for (const row of dataRows) {
    const rawId = row[colIdx.id];
    if (rawId === undefined || rawId === null || rawId === "") {
      continue; // Fila vacía
    }

    const id = Number(rawId);
    if (isNaN(id)) {
      continue;
    }

    const empresa = await Empresa.findByPk(id);

    if (!empresa) {
      noEncontradas++;
      console.warn(`⚠️ Empresa con ID ${id} no encontrada en la base de datos.`);
      continue;
    }

    // Limpiar y normalizar valores del excel
    const valOrEmpty = (val: any) => {
      if (val === undefined || val === null) return "";
      return String(val).trim();
    };

    const cleanEnteFacturador = (val: any) => {
      if (val === undefined || val === null) return null;
      const str = String(val).trim();
      if (str === "-" || str.toLowerCase() === "null") {
        return null;
      }
      return str;
    };

    const newContactoFactNombre = valOrEmpty(row[colIdx.contactoFactNombre]);
    const newContactoFactEmail = valOrEmpty(row[colIdx.contactoFactEmail]);
    const newContactoFactTelefono = valOrEmpty(row[colIdx.contactoFactTelefono]);
    const newEjecutivoComNombre = valOrEmpty(row[colIdx.ejecutivoComNombre]);
    const newEjecutivoComEmail = valOrEmpty(row[colIdx.ejecutivoComEmail]);
    const newEjecutivoComTelefono = valOrEmpty(row[colIdx.ejecutivoComTelefono]);
    const newEnteFacturador = cleanEnteFacturador(row[colIdx.enteFacturador]);

    const cambios: Record<string, { anterior: any; nuevo: any }> = {};

    if (empresa.contacto_fact_nombre !== newContactoFactNombre) {
      cambios.contacto_fact_nombre = { anterior: empresa.contacto_fact_nombre, nuevo: newContactoFactNombre };
    }
    if (empresa.contacto_fact_email !== newContactoFactEmail) {
      cambios.contacto_fact_email = { anterior: empresa.contacto_fact_email, nuevo: newContactoFactEmail };
    }
    if (empresa.contacto_fact_telefono !== newContactoFactTelefono) {
      cambios.contacto_fact_telefono = { anterior: empresa.contacto_fact_telefono, nuevo: newContactoFactTelefono };
    }
    if (empresa.ejecutivo_com_nombre !== newEjecutivoComNombre) {
      cambios.ejecutivo_com_nombre = { anterior: empresa.ejecutivo_com_nombre, nuevo: newEjecutivoComNombre };
    }
    if (empresa.ejecutivo_com_email !== newEjecutivoComEmail) {
      cambios.ejecutivo_com_email = { anterior: empresa.ejecutivo_com_email, nuevo: newEjecutivoComEmail };
    }
    if (empresa.ejecutivo_com_telefono !== newEjecutivoComTelefono) {
      cambios.ejecutivo_com_telefono = { anterior: empresa.ejecutivo_com_telefono, nuevo: newEjecutivoComTelefono };
    }
    if (empresa.ente_facturador !== newEnteFacturador) {
      cambios.ente_facturador = { anterior: empresa.ente_facturador, nuevo: newEnteFacturador };
    }

    if (Object.keys(cambios).length > 0) {
      // Actualizar registro en BD
      await empresa.update({
        contacto_fact_nombre: newContactoFactNombre,
        contacto_fact_email: newContactoFactEmail,
        contacto_fact_telefono: newContactoFactTelefono,
        ejecutivo_com_nombre: newEjecutivoComNombre,
        ejecutivo_com_email: newEjecutivoComEmail,
        ejecutivo_com_telefono: newEjecutivoComTelefono,
        ente_facturador: newEnteFacturador as any,
      });

      actualizadas++;
      reporteCambios.push({
        id: empresa.id,
        nombre: empresa.nombre,
        cambios,
      });
    } else {
      sinCambios++;
    }
  }

  console.log("\n==================================================");
  console.log(" RESUMEN DEL PROCESO DE ACTUALIZACIÓN");
  console.log("==================================================");
  console.log(`Total de empresas procesadas en Excel: ${dataRows.length}`);
  console.log(`Empresas actualizadas con cambios: ${actualizadas}`);
  console.log(`Empresas sin cambios (ya estaban al día): ${sinCambios}`);
  console.log(`Empresas del Excel no encontradas en DB: ${noEncontradas}`);
  console.log("==================================================\n");

  if (reporteCambios.length > 0) {
    console.log("DETALLE DE EMPRESAS ACTUALIZADAS:\n");
    reporteCambios.forEach((item) => {
      console.log(`🏢 [ID: ${item.id}] ${item.nombre}:`);
      Object.keys(item.cambios).forEach((field) => {
        const c = item.cambios[field];
        console.log(`   └─ ${field}: "${c.anterior}" ➡️ "${c.nuevo}"`);
      });
      console.log("");
    });
  } else {
    console.log("No se realizaron cambios en ninguna empresa.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error ejecutando script de actualización:", err);
  process.exit(1);
});
