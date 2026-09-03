# Plan de Implementación: Autorización Dinámica Basada en Roles y Permisos (BD)

Migrar de verificaciones estáticas de roles (`authorizeRoles("admin", ...)`) a un sistema **100% dinámico** respaldado por la tabla `roles_permisos` tanto en el **Backend** como en el **Frontend**.

---

## User Review Required

> [!IMPORTANT]
> - Cuando un usuario cambie un permiso en el Mantenedor de Roles y Permisos (ej. habilitar/deshabilitar la exportación de boletos para un rol), el cambio tendrá efecto inmediato tanto en las acciones/botones que ve en el Frontend como en la protección de endpoints en el Backend.
> - El rol `superuser` mantiene bypass total automático (acceso pleno a todas las funcionalidades).
> - Para usuarios no autenticados o con cuentas desactivadas, se mantienen las validaciones de seguridad estándar.

---

## Arquitectura Propuesta

```mermaid
flowchart TD
    subgraph BaseDeDatos [Base de Datos MySQL]
        RP[Tabla roles_permisos]
    end

    subgraph Backend [Backend API (Express)]
        PS[PermisoService con Caché en Memoria]
        RP -->|Lectura / Invalidación| PS
        CP[Middleware checkPermission('clave')]
        PS -->|Verifica permiso| CP
        Routes[Rutas de API protegidas con checkPermission]
        CP --> Routes
    end

    subgraph Frontend [Frontend Next.js]
        MPRoute[GET /api/permisos/mis-permisos]
        PS --> MPRoute
        Hook[Hook usePermissions / can]
        MPRoute --> Hook
        UI[Componentes y Botones con can('clave')]
        Hook --> UI
    end
```

---

## Cambios Propuestos

### Backend (`backend-reservas-corporativas`)

#### 1. Nuevo Middleware Dinámico `checkPermission`
- **Archivo:** [src/middleware/auth.middleware.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/middleware/auth.middleware.ts)
- Implementar `checkPermission(clave: string | string[])`:
  - Extrae el rol del token JWT (`req.user.rol`).
  - Si es `superuser`, permite el paso inmediato (`next()`).
  - Llama a `PermisoService.tienePermiso(rol, clave)` que consulta la matriz en caché / BD.
  - Si tiene permiso, `next()`. Si no, retorna `403 Forbidden` con mensaje descriptivo.

#### 2. Reemplazar `authorizeRoles` por `checkPermission` en Rutas Clave
- **Archivo:** [src/routes/ticket.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/ticket.routes.ts)
  - `GET /` y `GET /empresa/:id_empresa`: `checkPermission("tickets_ver_informacion_de_tickets")`
  - `GET /search`: `checkPermission("tickets_ver_informacion_de_tickets")`
  - `GET /usuario/:id_User`: `checkPermission("tickets_ver_informacion_de_tickets")`
- **Archivo:** [src/routes/pasajeros.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/pasajeros.routes.ts)
  - `GET /verificar` y `GET /:id`: `checkPermission("pasajeros_ver_informacion_de_pasajeros")`
  - `POST /`: `checkPermission("pasajeros_crear_nuevo_pasajero")`
  - `PUT /:id`: `checkPermission("pasajeros_modificar_datos_de_pasajero")`
  - `DELETE /:id`: `checkPermission("pasajeros_modificar_estado_de_pasajero")`
- **Archivo:** [src/routes/estadoCuenta.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/estadoCuenta.routes.ts)
  - Validar contra `estados_de_pago_*`.
- **Archivo:** [src/routes/cuenta_corriente.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/cuenta_corriente.routes.ts)
  - Validar contra `cuentas_corrientes_*`.

---

### Frontend (`Reservas-Corporativas`)

#### 1. Consistencia del Hook `usePermissions`
- **Archivo:** [hooks/usePermissions.ts](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/hooks/usePermissions.ts)
  - Asegurar soporte de claves alternas (ej: normalización de nombres de claves si hay discrepancias de tildes o typo en BD).

#### 2. Módulo de Boletos (`SuperAllBookings`)
- **Archivo:** [components/super-components/super-bookings.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-bookings.tsx)
  - Inyectar `const { can } = usePermissions();`
  - Ocultar botón **Exportar a Excel / CSV** si `!can("tickets_exportar_datos")`.
  - Ocultar botón de **Descargar PDF** si `!can("tickets_descargas_pdf_pasaje")`.
  - Ocultar o deshabilitar **Anular Boleto** si `!can("tickets_anular_pasaje")`.
  - Ocultar o deshabilitar **Ingresar Reclamo** si `!can("tickets_ingresar_reclamo")`.

#### 3. Módulo de Empresas (`SuperCompanies`)
- **Archivo:** [components/super-components/super-companies.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-companies.tsx)
  - Ocultar botón **Crear Empresa** si `!can("empresa_crear_nueva_empresa")`.
  - Ocultar botón **Exportar** si `!can("empresa_exportar_datos")`.
  - Ocultar botón **Carga Masiva** si `!can("empresa_carga_masiva")`.
  - Ocultar opciones de edición según los permisos específicos (`empresa_modificar_*`).

#### 4. Módulo de Pasajeros (`CompanyPassengers`)
- **Archivo:** [components/super-components/super-passengers.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-passengers.tsx)
  - Ocultar botón **Nuevo Pasajero** si `!can("pasajeros_crear_nuevo_pasajero")`.
  - Ocultar **Exportar** si `!can("pasajeros_exportar_datos")`.
  - Ocultar **Carga Masiva** si `!can("pasajeros_carga_masiva")`.
  - Ocultar acciones de edición / desactivación según `pasajeros_modificar_*`.

#### 5. Módulo de Usuarios (`CompanyUsers`)
- **Archivo:** [components/company-users.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/company-users.tsx)
  - Ocultar **Crear Usuario** si `!can("usuarios_crear_nuevo_usuario")`.
  - Ocultar **Exportar** si `!can("usuarios_exportar_datos")`.
  - Ocultar **Carga Masiva** si `!can("usuarios_carga_masiva")`.

#### 6. Módulo de Centros de Costo (`SuperCostCenters`)
- **Archivo:** [components/super-cost-center.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-cost-center.tsx)
  - Ocultar **Crear Centro de Costo** si `!can("centro_de_costo_crear_nuevo_centro_de_costo")`.
  - Ocultar **Carga Masiva** si `!can("centro_de_costo_carga_masiva")`.

#### 7. Visibilidad Dinámica de Pestañas Principales en Paneles
- **Archivos:**
  - [app/admincc/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/admincc/page.tsx)
  - [app/admin/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/admin/page.tsx)
  - [app/superuser/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/superuser/page.tsx)
  - [app/auditoria/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/auditoria/page.tsx)
  - [app/controller/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/controller/page.tsx)
- Condicionar la renderización de cada `TabsTrigger` al permiso de lectura correspondiente:
  - Empresas: `can("empresa_ver_informacion_de_empresa")`
  - Boletos: `can("tickets_ver_informacion_de_tickets")`
  - Pasajeros: `can("pasajeros_ver_informacion_de_pasajeros")`
  - Usuarios: `can("usuarios_ver_informacion_de_usuario")`
  - Centros de Costo: `can("centro_de_costo_ver_informacion_de_centros_de_costos")`
  - Estados de Pago: `can("estados_de_pago_ver_informacion_de_estados_de_pago")`
  - Cuentas Corrientes: `can("cuentas_corrientes_ver_informacion_de_cuentas_corrientes")`
  - Cobranza: `can("historial_de_cobranza_visualizar_modulo")`
  - Reclamos: `can("reclamos_visualizar_listado_de_reclamos")`
  - Reportes: `can("reportes_seleccionar_tipo_de_reportes")`

---

## Plan de Verificación

### Pruebas Automatizadas
1. `npx tsc --noEmit` en backend para validar tipos y middlewares.
2. Script de prueba automatizado simulando llamadas con diferentes roles a endpoints protegidos con `checkPermission`.
3. `pnpm run build` en frontend para verificar que toda la interfaz compile sin errores.

### Pruebas Manuales
1. Entrar con un rol específico (ej. `admincc`).
2. Verificar que se muestren solo las pestañas y botones a los que tiene permiso según la BD.
3. Modificar un permiso en el Mantenedor (ej. desactivar exportación para `admincc`).
4. Recargar y verificar que el botón desaparece en el frontend y que una petición directa a la API retorna 403 Forbidden.
