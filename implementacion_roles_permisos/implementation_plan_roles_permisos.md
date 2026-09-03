# Plan de Implementación: Sistema Dinámico de Roles y Permisos (RBAC) con Mantenedor para Superuser

Basado en la matriz del archivo [roles_permisos.xlsx](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/roles_permisos.xlsx), en las decisiones del usuario y en la advertencia sobre el rol `empresa`, se implementará el **sistema dinámico de control de acceso basado en roles (RBAC)** en **ambiente de desarrollo** con su correspondiente **Mantenedor visual interactivo exclusivo para el Superuser**.

---

## Consideraciones Clave y Reglas de Negocio

1. **Soporte y Protección del Rol `empresa`:**
   - En `user.model.ts`, el rol `empresa` es el valor por defecto (`defaultValue: "empresa"`).
   - Se incluye `empresa` como columna oficial en la tabla `roles_permisos` para garantizar que **no se rompa ningún flujo de creación de usuarios**.
   - Sus permisos iniciales se configurarán alineados a su alcance corporativo (cotizador/reservas y gestión básica), y el `superuser` podrá ajustarlos directamente desde el mantenedor si lo desea.
2. **Rol `admin`:** No verá la pestaña general "Empresas" (según estipula el Excel); gestionará Centros de Costo, Usuarios, Boletos, Pasajeros, Reservas, EDP y Cuenta Corriente **únicamente de su propia empresa / holding asignado**.
3. **Módulos Nuevos por Rol:**
   - **`contralor`**: Se activan Cuentas Corrientes, Reportes, Cobranza (crear/ver) y Usuarios.
   - **`admincc`**: Se activan Tickets, Pasajeros, Centros de Costo, Reportes, Reclamos (solo ver) y Cobranza (crear/ver).
   - **`auditoria`**: Se activa Cobranza (solo ver).
4. **Mantenedor Dinámico en Base de Datos:**
   - Tabla `roles_permisos` inicializada con las 55 acciones del Excel.
   - Pestaña interactiva en `/superuser` con switches para alternar permisos en tiempo real.
5. **Ambiente:** Todo se ejecutará y validará en **Desarrollo** (`ls-594a29bdbbcac0570afa88fba199455107a1c5a6.cs9gyyc0moxd.us-east-1.rds.amazonaws.com`).

---

## 1. Diseño de la Base de Datos (`roles_permisos`)

Estructura de la tabla en base de datos de desarrollo:

```sql
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
```

---

## 2. Componentes a Crear y Modificar

### Backend (`backend-reservas-corporativas`)

#### [NEW] [src/models/rol_permiso.model.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/models/rol_permiso.model.ts)
- Modelo Sequelize `RolPermiso` con tipos para `modulo`, `accion`, `clave`, y las columnas booleanas de cada rol (incluyendo `empresa`).

#### [NEW] [src/services/permiso.service.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/services/permiso.service.ts)
- Servicio central con cache en memoria:
  - `obtenerMatrizCompleta()`
  - `obtenerPermisosRol(rol)` (con fallback seguro para `empresa`)
  - `actualizarPermiso(id, rol, valor)`
  - `restablecerPermisosExcel()`

#### [NEW] [src/controllers/permiso.controller.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/controllers/permiso.controller.ts)
- Controladores para:
  - `GET /api/permisos` (Matriz completa para superuser)
  - `PUT /api/permisos/:id` (Actualizar celda rol/permiso)
  - `POST /api/permisos/restablecer` (Restaurar Excel)
  - `GET /api/permisos/mis-permisos` (Permisos del usuario logueado)

#### [NEW] [src/routes/permiso.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/permiso.routes.ts)
- Rutas protegidas con `authenticateJWT` y `authorizeRoles`.

#### [NEW] [src/script/seedRolesPermisos.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/script/seedRolesPermisos.ts)
- Script de migración y seed que lee `roles_permisos.xlsx`, crea la tabla y puebla las 55 filas.

#### [MODIFY] [src/routes/index.ts / app.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/app.ts)
- Montar las rutas de permisos en `/api/permisos`.

#### [MODIFY] Rutas backend protegidas:
- [reports.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/reports.routes.ts): Habilitar a `superuser`, `contralor`, `admincc`.
- [cobranza.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/cobranza.routes.ts): Habilitar a `superuser`, `contralor`, `admincc`, `auditoria` (lectura); `POST` para `superuser`, `contralor`, `admincc`; `DELETE` para `superuser`.
- [reclamo.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/reclamo.routes.ts): Habilitar a `admincc`, `superuser`, `soporte`.

---

### Frontend (`Reservas-Corporativas`)

#### [NEW] [components/super-components/super-permisos.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-permisos.tsx)
- Mantenedor interactivo para Superuser:
  - Búsqueda por módulo o acción.
  - Secciones colapsables por los 12 módulos.
  - Switches por cada rol con guardado inmediato y alertas Toast.
  - Botón de restablecer a valores iniciales de Excel.

#### [NEW] [hooks/usePermissions.ts](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/hooks/usePermissions.ts)
- Hook reactivo que consume `/api/permisos/mis-permisos` y entrega `hasPermission(clave)`.

#### [MODIFY] [app/superuser/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/superuser/page.tsx)
- Agregar pestaña **"Roles y Permisos"** que renderiza `<SuperPermisos />`.

#### [MODIFY] Ajuste de Pestañas en Paneles:
- [app/admin/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/admin/page.tsx): Ocultar pestaña "Empresas".
- [app/controller/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/controller/page.tsx): Activar Cuentas Corrientes, Reportes, Cobranza y Usuarios.
- [app/admincc/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/admincc/page.tsx): Activar Tickets, Pasajeros, Centros de Costo, Reportes, Reclamos y Cobranza.
- [app/auditoria/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/auditoria/page.tsx): Activar Cobranza (solo lectura).

#### [MODIFY] Condicionamiento de Botones en Componentes:
- Integrar `hasPermission(clave)` en:
  - [super-companies.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-companies.tsx) (Crear, Editar, Cupo, Exportar, Carga Masiva).
  - [super-cost-center.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-cost-center.tsx) (Crear, Estado, Carga Masiva).
  - [company-users.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/company-users.tsx) (Crear, Modificar, Exportar, Carga Masiva).
  - [estado-pago.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/estado-pago.tsx) (EDP Manual, Aplicar Descuento, Exportar).
  - [cuenta-corriente.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/cuenta-corriente.tsx) (Pagar Cargo, Nuevo Movimiento).
  - [super-bookings.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-bookings.tsx) (Anular, Ingresar Reclamo, Exportar).
  - [super-passengers.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-passengers.tsx) (Crear, Modificar, Exportar, Carga Masiva).
  - [super-cobranza.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-cobranza.tsx) (Crear Gestión, Eliminar).
  - [super-reclamos.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-reclamos.tsx) (Aprobar, Rechazar).

---

## 3. Plan de Verificación

1. **Base de Datos:** Ejecutar script seed en desarrollo y verificar las 55 filas con `SELECT COUNT(*) FROM roles_permisos`.
2. **API:** Probar `GET /api/permisos` y `PUT /api/permisos/:id` con token de superuser.
3. **Mantenedor UI:** Entrar a `/superuser` -> "Roles y Permisos", alternar switches y verificar guardado.
4. **Paneles por Rol:** Comprobar que cada rol vea sus pestañas correspondientes.
5. **Botones Granulares:** Comprobar que los botones restringidos desaparezcan según el permiso activo.
6. **Compilación:** `npx tsc --noEmit` sin errores en backend y frontend.
