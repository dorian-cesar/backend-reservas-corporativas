# Walkthrough: Sistema 100% Dinámico de Roles y Permisos (Frontend & Backend)

Se ha completado la transición del sistema de control de acceso: se eliminó el hardcodeo de roles en el frontend y backend, conectando todo al mantenedor de permisos almacenado en la base de datos (`roles_permisos`).

---

## 1. Cambios en Backend (`backend-reservas-corporativas`)

- **Middleware `checkPermission(...claves)` en [auth.middleware.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/middleware/auth.middleware.ts):**
  - Consulta en tiempo real si el rol del usuario posee permiso activo en la tabla `roles_permisos` mediante `PermisoService.tienePermiso(rol, clave)`.
  - Equipado con caché en memoria TTL 60s con invalidación inmediata al editar permisos desde el mantenedor.
- **Rutas Express Migradas a `checkPermission`:**
  - [ticket.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/ticket.routes.ts): Protegido con `tickets_ver_informacion_de_tickets` y `buscar_generar_buequeda_de_servicios`.
  - [pasajeros.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/pasajeros.routes.ts): Ver, crear, modificar datos y estados protegidos con sus permisos específicos.
  - [empresa.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/empresa.routes.ts): Listar, exportar, crear, modificar datos y desactivar protegidos por permisos.
  - [estadoCuenta.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/estadoCuenta.routes.ts): Listar, crear manual, tickets y descuentos protegidos por permisos.
  - [cuenta_corriente.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/cuenta_corriente.routes.ts): Ver movimientos, adjuntos y pagos protegidos por permisos.
  - [reports.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/reports.routes.ts): Selección y exportación (Excel/PDF) protegidas por permisos.

---

## 2. Cambios en Frontend (`Reservas-Corporativas`)

- **Manejo de Permisos y Pestañas Dinámicas (`can(clave)`):**
  - [app/admincc/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/admincc/page.tsx): Pestañas dinámicas según los permisos activos en BD (`allowedTabs`). Si se desactiva un permiso en el mantenedor, la pestaña desaparece y no se puede interactuar.
  - [app/admin/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/admin/page.tsx): Pestañas dinámicas según permisos en BD.
  - [app/controller/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/controller/page.tsx): Pestañas dinámicas según permisos en BD.
  - [app/auditoria/page.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/app/auditoria/page.tsx): Pestañas dinámicas según permisos en BD.
- **Acciones y Botones en Vistas Principales:**
  - [components/super-components/super-bookings.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-bookings.tsx):
    - Exportar: `can("tickets_exportar_datos")`.
    - Descargar PDF: `can("tickets_descargas_pdf_pasaje")`.
    - Anular pasaje: `can("tickets_anular_pasaje")`.
    - Ingresar reclamo: `can("tickets_ingresar_reclamo")`.
  - [components/super-components/super-companies.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-companies.tsx):
    - Agregar empresa: `can("empresa_crear_nueva_empresa")`.
    - Exportar datos: `can("empresa_exportar_datos")`.
    - Carga masiva CSV: `can("empresa_carga_masiva")`.
    - Editar empresa: `can("empresa_modificar_datos_de_empresa")`.
    - Modificar cupo / acumulado: `can("empresa_modificar_cupo_de_empresa")`.
  - [components/company-users.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/company-users.tsx):
    - Agregar usuario: `can("usuarios_crear_nuevo_usuario")`.
    - Subir CSV: `can("usuarios_carga_masiva")`.
    - Exportar Excel: `can("usuarios_exportar_datos")`.
    - Editar usuario: `can("usuarios_modificar_datos_de_usuarios")`.
  - [components/super-components/super-passengers.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-passengers.tsx):
    - Nuevo pasajero: `can("pasajeros_crear_nuevo_pasajero")`.
    - Subir CSV: `can("pasajeros_carga_masiva")`.
    - Editar pasajero: `can("pasajeros_modificar_datos_de_pasajero")`.
  - [components/super-cost-center.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-cost-center.tsx):
    - Agregar centro: `can("centro_de_costo_crear_nuevo_centro_de_costo")`.
    - Subir CSV: `can("centro_de_costo_carga_masiva")`.
    - Editar / Estado: `can("centro_de_costo_modificar_estado_de_centro_de_costo")`.

---

## 3. Validación y Verificación

- **Backend:** `npx tsc --noEmit` completado exitosamente con **0 errores**.
- **Frontend:** `pnpm run build` completado exitosamente con **código 0**, 65/65 páginas estáticas y dinámicas compiladas sin errores.
