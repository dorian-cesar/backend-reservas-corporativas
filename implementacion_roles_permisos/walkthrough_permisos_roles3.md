# Walkthrough: Corrección Integral de Permisos Dinámicos y Rutas para AdminCC

Se realizó una revisión profunda de todas las rutas y controladores del Backend que aún mantenían autorizaciones estáticas o bloqueaban a roles con permisos en base de datos como `admincc`.

---

## 1. Problema Detectado con Centros de Costo (Error 403 / 502 Bad Gateway)

Al consultar `GET /api/centros-costo/empresa/:empresa_id` con el usuario `admincc`:
- **Causa:** La ruta en [src/routes/centro_costo.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/centro_costo.routes.ts) tenía hardcodeado el middleware:
  ```typescript
  authorizeRoles("admin", "superuser", "auditoria", "contralor", "subusuario")
  ```
  No incluía a `admincc` y no utilizaba el middleware dinámico `checkPermission` conectado a la BD.
- **Consecuencia:** El backend rechazaba la petición con `403 No autorizado`, y el proxy de Next.js (`/api/centros-costo/empresa/[empresaId]/route.ts`) devolvía un `502 Bad Gateway`.

---

## 2. Correcciones Aplicadas en Rutas y Controladores

### Backend (`backend-reservas-corporativas`):
1. **[src/routes/centro_costo.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/centro_costo.routes.ts):**
   - Migrado completamente a `checkPermission` dinámico:
     - `GET /empresa/:empresa_id` -> `checkPermission("centro_de_costo_ver_informacion_de_centros_de_costos")`
     - `GET /:id` -> `checkPermission("centro_de_costo_ver_informacion_de_centros_de_costos")`
     - `POST /` -> `checkPermission("centro_de_costo_crear_nuevo_centro_de_costo")`
     - `PUT /:id` -> `checkPermission("centro_de_costo_modificar_estado_de_centro_de_costo")`
     - `DELETE /:id` -> `checkPermission("centro_de_costo_modificar_estado_de_centro_de_costo")`
2. **[src/routes/users.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/users.routes.ts) y [src/controllers/users.controller.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/controllers/users.controller.ts):**
   - Migradas las rutas a `checkPermission`:
     - Listar usuarios -> `usuarios_ver_informacion_de_usuario`
     - Exportar usuarios -> `usuarios_exportar_datos`
     - Crear usuario -> `usuarios_crear_nuevo_usuario`
     - Modificar usuario -> `usuarios_modificar_datos_de_usuarios`
     - Estado usuario -> `usuarios_modificar_estado_de_usuarios`
   - En el controlador `users.controller.ts`, se incluyó `admincc` en las condiciones de acceso global (`empresa_id === 1` y roles administrativos) y en la asignación de `targetEmpresaId`.
3. **[src/routes/upload.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/upload.routes.ts):**
   - Endpoints de carga masiva CSV migrados a `checkPermission`:
     - `/users/csv` -> `usuarios_carga_masiva`
     - `/passengers/csv` -> `pasajeros_carga_masiva`
     - `/centros-costo/csv` -> `centro_de_costo_carga_masiva`
     - `/empresas/csv` -> `empresa_carga_masiva`
4. **[src/routes/dashboard.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/dashboard.routes.ts):**
   - Se añadió `admincc` a los roles autorizados para consultar estadísticas.
5. **[src/routes/reclamo.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/reclamo.routes.ts):**
   - Migrado a `checkPermission` (`reclamos_visualizar_listado_de_reclamos`, `reclamos_aprobar_reclamo`, etc.).
6. **[src/routes/ticket.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/ticket.routes.ts):**
   - Migrado anulación y estado de tickets a `checkPermission("tickets_anular_pasaje", "reservas_anular_pasaje")`.

---

## 3. Pruebas Realizadas en Caliente

1. **Centros de costo de empresa 11 con rol `admincc`:**
   - **Petición:** `GET /api/centros-costo/empresa/11`
   - **Resultado:** **`200 OK`** (167 centros de costo retornados).
2. **Listado de usuarios con rol `admincc`:**
   - **Petición:** `GET /api/users?empresa_id=11`
   - **Resultado:** **`200 OK`** (10 usuarios retornados con paginación).
3. **Validación de TypeScript:**
   - Backend: **0 errores** (`npx tsc --noEmit`).
   - Frontend: **0 errores** (`pnpm exec tsc --noEmit`).
