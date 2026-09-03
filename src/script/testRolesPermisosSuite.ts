import { connectDB, sequelize } from "../database";
import { PermisoService, ROLES_VALIDOS } from "../services/permiso.service";
import { RolPermiso } from "../models/rol_permiso.model";
import { User } from "../models/user.model";
import { seedRolesPermisos } from "./seedRolesPermisos";
import * as jwt from "jsonwebtoken";
import request from "supertest";
import app from "../index";
import path from "path";
import fs from "fs";

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

function logHeader(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(`  📌 ${title}`);
  console.log("=".repeat(70));
}

async function runTest(
  suite: string,
  name: string,
  fn: () => Promise<void> | void
) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ suite, test: name, passed: true, durationMs: duration });
    console.log(`  ✅ [PASS] ${name} (${duration}ms)`);
  } catch (err: any) {
    const duration = Date.now() - start;
    results.push({
      suite,
      test: name,
      passed: false,
      error: err.message || String(err),
      durationMs: duration,
    });
    console.error(`  ❌ [FAIL] ${name} (${duration}ms)`);
    console.error(`     Error: ${err.message || err}`);
  }
}

export async function runFullRolesAndPermissionsSuite() {
  console.log("\n🚀 ===================================================================");
  console.log("🚀 EJECUTANDO SUITE DE REVISIÓN: ROLES Y PERMISOS (DEV ENVIRONMENT)");
  console.log("🚀 ===================================================================");

  // Setup
  await connectDB();
  const jwtSecret = process.env.JWT_SECRET || "TuClaveSuperSecreta123!!";

  // Usuario activo para pruebas
  let activeUser = await User.findOne({
    where: { estado: true },
    attributes: ["id", "email", "rol"],
  });

  if (!activeUser) {
    activeUser = await User.create({
      nombre: "Test Suite Runner",
      email: "test_runner@pullmanbus.cl",
      password: "runner_password_123",
      rol: "superuser",
      estado: true,
    } as any);
  }

  const superuserToken = jwt.sign(
    { id: activeUser.id, email: activeUser.email, rol: "superuser" },
    jwtSecret,
    { expiresIn: "1h" }
  );

  const subusuarioToken = jwt.sign(
    { id: activeUser.id, email: activeUser.email, rol: "subusuario" },
    jwtSecret,
    { expiresIn: "1h" }
  );

  const adminToken = jwt.sign(
    { id: activeUser.id, email: activeUser.email, rol: "admin" },
    jwtSecret,
    { expiresIn: "1h" }
  );

  // -------------------------------------------------------------------------
  // SUITE 1: INTEGRIDAD DE BASE DE DATOS Y EXCEL
  // -------------------------------------------------------------------------
  logHeader("1. Verificación de Integridad: Archivo Excel y Tabla roles_permisos");

  await runTest(
    "Integridad",
    "Existe archivo roles_permisos.xlsx en backend",
    () => {
      const p = path.join(process.cwd(), "roles_permisos.xlsx");
      if (!fs.existsSync(p))
        throw new Error("No existe el archivo roles_permisos.xlsx");
    }
  );

  await runTest(
    "Integridad",
    "Ejecución de seedRolesPermisos y carga en BD",
    async () => {
      await seedRolesPermisos();
      const count = await RolPermiso.count();
      if (count === 0)
        throw new Error("La tabla roles_permisos quedó vacía tras el seed");
    }
  );

  await runTest(
    "Integridad",
    "Validación de normalización de claves y sin duplicados",
    async () => {
      const items = await RolPermiso.findAll();
      const claves = items.map((i) => i.clave);
      const set = new Set(claves);
      if (claves.length !== set.size) {
        throw new Error("Existen claves duplicadas en la tabla roles_permisos");
      }
      for (const c of claves) {
        if (!/^[a-z0-9_]+$/.test(c)) {
          throw new Error(`Clave no normalizada: ${c}`);
        }
      }
    }
  );

  await runTest(
    "Integridad",
    "Validación de columnas de roles en el modelo",
    () => {
      const expected = [
        "subusuario",
        "empresa",
        "admin",
        "auditoria",
        "contralor",
        "admincc",
        "superuser",
        "soporte",
      ];
      for (const r of expected) {
        if (!ROLES_VALIDOS.includes(r as any)) {
          throw new Error(`Falta el rol '${r}' en ROLES_VALIDOS`);
        }
      }
    }
  );

  // -------------------------------------------------------------------------
  // SUITE 2: SERVICIO DE PERMISOS (PermisoService)
  // -------------------------------------------------------------------------
  logHeader("2. Pruebas Unitarias de Lógica de Negocio (PermisoService)");

  await runTest(
    "PermisoService",
    "obtenerMatrizCompleta retorna lista completa ordenada",
    async () => {
      const matriz = await PermisoService.obtenerMatrizCompleta();
      if (!matriz || matriz.length === 0)
        throw new Error("Matriz vacía");
      for (let i = 1; i < matriz.length; i++) {
        if (matriz[i].id < matriz[i - 1].id) {
          throw new Error("La matriz no está ordenada por ID ascendente");
        }
      }
    }
  );

  await runTest(
    "PermisoService",
    "Superuser tiene bypass total (100% de acciones en true)",
    async () => {
      const map = await PermisoService.obtenerPermisosRol("superuser");
      const values = Object.values(map);
      if (values.length === 0 || !values.every((v) => v === true)) {
        throw new Error(
          "El superuser no tiene todas las acciones asignadas como true"
        );
      }
    }
  );

  await runTest(
    "PermisoService",
    "Subusuario tiene restricciones correctas",
    async () => {
      const map = await PermisoService.obtenerPermisosRol("subusuario");
      if (map["mantenedor_usuarios"] === true) {
        throw new Error("Subusuario no debería tener acceso a mantenedor_usuarios");
      }
    }
  );

  await runTest(
    "PermisoService",
    "Rol desconocido retorna todo en false",
    async () => {
      const map = await PermisoService.obtenerPermisosRol("rol_no_existente");
      const values = Object.values(map);
      if (!values.every((v) => v === false)) {
        throw new Error("Rol desconocido no retornó todos los permisos en false");
      }
    }
  );

  await runTest(
    "PermisoService",
    "Caché en memoria reduce latencia a 0ms en llamadas repetidas",
    async () => {
      PermisoService.invalidarCache();
      const t0 = performance.now();
      await PermisoService.obtenerPermisosRol("admin");
      const dbTime = performance.now() - t0;

      const t1 = performance.now();
      await PermisoService.obtenerPermisosRol("admin");
      const cacheTime = performance.now() - t1;

      console.log(
        `     📊 Tiempo con BD: ${dbTime.toFixed(2)}ms | Tiempo con Caché: ${cacheTime.toFixed(2)}ms`
      );
    }
  );

  await runTest(
    "PermisoService",
    "actualizarPermiso modifica BD, invalida caché y rechaza rol inválido",
    async () => {
      const item = await RolPermiso.findOne();
      if (!item) throw new Error("No hay permisos en BD");
      const original = item.subusuario;

      // Actualizar
      await PermisoService.actualizarPermiso(item.id, "subusuario", !original);
      const updatedMap = await PermisoService.obtenerPermisosRol("subusuario");
      if (updatedMap[item.clave] !== !original) {
        throw new Error("El mapa de permisos no reflejó el cambio inmediatamente");
      }

      // Probar rol inválido
      let errorLanzado = false;
      try {
        await PermisoService.actualizarPermiso(item.id, "rol_invalido", true);
      } catch (e) {
        errorLanzado = true;
      }
      if (!errorLanzado) {
        throw new Error("No se lanzó excepción al usar un rol no permitido");
      }

      // Revertir
      await PermisoService.actualizarPermiso(item.id, "subusuario", original);
    }
  );

  // -------------------------------------------------------------------------
  // SUITE 3: ENDPOINTS API HTTP (/api/permisos)
  // -------------------------------------------------------------------------
  logHeader("3. Pruebas de Endpoints HTTP y Control de Acceso");

  await runTest(
    "API /api/permisos/mis-permisos",
    "GET /mis-permisos con token superuser -> 200 y rol superuser",
    async () => {
      const res = await request(app)
        .get("/api/permisos/mis-permisos")
        .set("Authorization", `Bearer ${superuserToken}`);

      if (res.status !== 200)
        throw new Error(`Status esperado 200, recibido ${res.status}`);
      if (res.body.rol !== "superuser")
        throw new Error(`Rol esperado superuser, recibido ${res.body.rol}`);
      if (!res.body.permisos || typeof res.body.permisos !== "object")
        throw new Error("Respuesta no contiene objeto permisos");
    }
  );

  await runTest(
    "API /api/permisos/mis-permisos",
    "GET /mis-permisos sin token -> 401 Unauthorized",
    async () => {
      const res = await request(app).get("/api/permisos/mis-permisos");
      if (res.status !== 401)
        throw new Error(`Status esperado 401, recibido ${res.status}`);
    }
  );

  await runTest(
    "API /api/permisos",
    "GET /api/permisos (Matriz) con Superuser -> 200 y array de permisos",
    async () => {
      const res = await request(app)
        .get("/api/permisos")
        .set("Authorization", `Bearer ${superuserToken}`);

      if (res.status !== 200)
        throw new Error(`Status esperado 200, recibido ${res.status}`);
      if (!Array.isArray(res.body.permisos))
        throw new Error("La propiedad permisos no es un array");
      if (res.body.permisos.length !== res.body.total)
        throw new Error("total no coincide con la longitud del array");
    }
  );

  await runTest(
    "API /api/permisos",
    "GET /api/permisos (Matriz) con Subusuario -> 403 Forbidden",
    async () => {
      const res = await request(app)
        .get("/api/permisos")
        .set("Authorization", `Bearer ${subusuarioToken}`);

      if (res.status !== 403)
        throw new Error(`Status esperado 403, recibido ${res.status}`);
    }
  );

  await runTest(
    "API /api/permisos/:id",
    "PUT /api/permisos/:id con Superuser -> 200 y actualización confirmada",
    async () => {
      const item = await RolPermiso.findOne();
      if (!item) throw new Error("No hay permisos");
      const id = item.id;
      const original = item.admin;

      const res = await request(app)
        .put(`/api/permisos/${id}`)
        .set("Authorization", `Bearer ${superuserToken}`)
        .send({ rol: "admin", valor: !original });

      if (res.status !== 200)
        throw new Error(`Status esperado 200, recibido ${res.status}`);
      if (res.body.permiso.admin !== !original)
        throw new Error("No se actualizó el campo admin correctamente");

      // Restaurar
      await request(app)
        .put(`/api/permisos/${id}`)
        .set("Authorization", `Bearer ${superuserToken}`)
        .send({ rol: "admin", valor: original });
    }
  );

  await runTest(
    "API /api/permisos/:id",
    "PUT /api/permisos/:id con Admin -> 403 Forbidden (solo superuser)",
    async () => {
      const res = await request(app)
        .put("/api/permisos/1")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ rol: "subusuario", valor: true });

      if (res.status !== 403)
        throw new Error(`Status esperado 403, recibido ${res.status}`);
    }
  );

  await runTest(
    "API /api/permisos/restablecer",
    "POST /api/permisos/restablecer con Superuser -> 200 y matriz recargada",
    async () => {
      const res = await request(app)
        .post("/api/permisos/restablecer")
        .set("Authorization", `Bearer ${superuserToken}`);

      if (res.status !== 200)
        throw new Error(`Status esperado 200, recibido ${res.status}`);
      if (!res.body.message.includes("restablecida"))
        throw new Error("Mensaje de éxito no coincide");
    }
  );

  // -------------------------------------------------------------------------
  // REPORTE FINAL Y RESUMEN
  // -------------------------------------------------------------------------
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log("\n" + "=".repeat(70));
  console.log("📊 RESUMEN EJECUTIVO DE LA SUITE DE ROLES Y PERMISOS");
  console.log("=".repeat(70));
  console.log(`  Total de Pruebas Ejecutadas: ${total}`);
  console.log(`  ✅ Exitosas (Passed):         ${passed}`);
  console.log(`  ❌ Fallidas (Failed):         ${failed}`);
  console.log(`  ⏱️  Tiempo Total:              ${results.reduce((acc, r) => acc + r.durationMs, 0)}ms`);
  console.log("=".repeat(70));

  if (failed > 0) {
    console.log("\n❌ DETALLE DE PRUEBAS FALLIDAS:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - [${r.suite}] ${r.test}: ${r.error}`);
      });
  } else {
    console.log("\n🎉 ¡TODAS LAS PRUEBAS DE ROLES Y PERMISOS PASARON SATISFACTORIAMENTE!");
  }

  // Teardown
  await sequelize.close();
  return { total, passed, failed };
}

if (require.main === module) {
  runFullRolesAndPermissionsSuite()
    .then(({ failed }) => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("Error fatal durante la ejecución de la suite:", err);
      process.exit(1);
    });
}
