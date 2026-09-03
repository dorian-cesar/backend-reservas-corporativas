# Walkthrough: Auditoría y Sincronización Total de Roles y Permisos (RBAC)

Se realizó una auditoría y corrección exhaustiva, acción por acción (las 55 acciones funcionales registradas en la tabla `roles_permisos` de MySQL) para los 7 roles del sistema:
- `subusuario`
- `admin`
- `auditoria`
- `contralor`
- `admincc`
- `superuser`
- `soporte`

---

## 1. Módulos y Acciones Auditados

### Módulo: Buscar (1 acción)
- `buscar_generar_buequeda_de_servicios`: habilitado para `subusuario`, `admin` y `superuser`. Permite consultar servicios y disponibilidad.

### Módulo: Centro de Costo (4 acciones)
- `centro_de_costo_ver_informacion_de_centros_de_costos`: habilitado para `admin`, `auditoria`, `contralor`, `admincc`, `superuser`.
- `centro_de_costo_crear_nuevo_centro_de_costo`: habilitado para `admin` y `superuser`.
- `centro_de_costo_modificar_estado_de_centro_de_costo`: habilitado para `admin` y `superuser`.
- `centro_de_costo_carga_masiva`: habilitado para `superuser`.
- *Operación de reserva:* `subusuario` y demás roles compradores pueden listar los centros de costo de su empresa para asociar boletos sin fallos de autorización ni 500.

### Módulo: Cuentas Corrientes (3 acciones)
- `cuentas_corrientes_ver_informacion_de_cuentas_corrientes`: `admin`, `auditoria`, `contralor`, `admincc`, `superuser`.
- `cuentas_corrientes_pagar_linea_generada`: `contralor`, `admincc`, `superuser`. Botón de pago en tabla y tarjetas protegido con `can()`.
- `cuentas_corrientes_crear_nuevo_movimiento`: `contralor`, `admincc`, `superuser`. Botón de nuevo movimiento protegido con `can()`.

### Módulo: Empresa (11 acciones)
- `empresa_ver_informacion_de_empresa`: `auditoria`, `contralor`, `admincc`, `superuser`.
- `empresa_crear_nueva_empresa`: `superuser`.
- `empresa_modificar_datos_de_empresa`: `superuser`. Botón editar en tabla y tarjetas condicionado por `can()`.
- `empresa_modificar_cupo_de_empresa`: `superuser`. Botón restablecer condicionado por `can()`.
- `empresa_modificar_condiciones_de_facturacion`, `empresa_modificar_datos_de_contacto`, `empresa_modicar_morocidad_empresa`, `empresa_modificar_estado_empresa`, `empresa_modificar_tramos_de_descuentos`: campos de formulario condicionados dinámicamente con `can()`.
- `empresa_exportar_datos`: `auditoria`, `superuser`. Botón exportar Excel condicionado con `can()`.
- `empresa_carga_masiva`: `superuser`. Botón CSV condicionado con `can()`.

### Módulo: Estados de Pago (6 acciones)
- `estados_de_pago_ver_informacion_de_estados_de_pago`: `admin`, `auditoria`, `contralor`, `admincc`, `superuser`.
- `estados_de_pago_crear_edp_manual`: `auditoria`, `admincc`, `superuser`.
- `estados_de_pago_exportar_datos`: `auditoria`, `contralor`, `admincc`, `superuser`.
- `estados_de_pago_descargar_detalle_de_edp` y `estados_de_pago_descargar_pdf_de_edp`: `admin`, `auditoria`, `contralor`, `admincc`, `superuser`. Acciones disponibles tanto en tabla como en tarjetas.
- `estados_de_pago_aplicar_descuento_en_edp`: `contralor`, `admincc`, `superuser`. Diálogo de descuento condicionado con `can()`.

### Módulo: Historial de Cobranza (3 acciones)
- `historial_de_cobranza_visualizar_modulo`: `auditoria`, `contralor`, `admincc`, `superuser`.
- `historial_de_cobranza_crear`: `contralor`, `admincc`, `superuser`.
- `historial_de_cobranza_eliminar`: `superuser`.

### Módulo: Pasajeros (6 acciones)
- `pasajeros_ver_informacion_de_pasajeros`: `admin`, `auditoria`, `contralor`, `admincc`, `superuser`.
- `pasajeros_crear_nuevo_pasajero`: `admin`, `superuser`.
- `pasajeros_modificar_datos_de_pasajero`: `admin`, `superuser`.
- `pasajeros_modificar_estado_de_pasajero`: `admin`, `superuser`.
- `pasajeros_exportar_datos`: `admin`, `auditoria`, `contralor`, `admincc`, `superuser`.
- `pasajeros_carga_masiva`: `superuser`.
- *Operación de reserva:* La creación automática al comprar pasajes permite a roles con búsqueda/reserva (`subusuario`) completar el boleto.

### Módulo: Reclamos (3 acciones)
- `reclamos_visualizar_listado_de_reclamos`: `superuser`, `soporte`.
- `reclamos_aprobar_reclamo`: `superuser`, `soporte`.
- `reclamos_rechazar_reclamo`: `superuser`, `soporte`.

### Módulo: Reportes (3 acciones)
- `reportes_seleccionar_tipo_de_reportes`: `contralor`, `admincc`, `superuser`.
- `reportes_exportar_en_excel`: `contralor`, `admincc`, `superuser`.
- `reportes_exportar_en_pdf`: `contralor`, `admincc`, `superuser`.

### Módulo: Reservas (4 acciones) vs Tickets (5 acciones)
- `reservas_ver_informacion_de_reservas`: `subusuario`, `admin`, `superuser` (panel Mis Reservas).
- `tickets_ver_informacion_de_tickets`: `admin`, `auditoria`, `contralor`, `admincc`, `superuser` (panel Boletos corporativos).
- Descarga PDF de pasaje: `reservas_descargas_pdf_pasaje` y `tickets_descargas_pdf_pasaje`.
- Reclamos en pasaje: `reservas_ingresar_reclamo` y `tickets_ingresar_reclamo`.
- Anulación de pasajes: `reservas_anular_pasaje` y `tickets_anular_pasaje`.

### Módulo: Usuarios (6 acciones)
- `usuarios_ver_informacion_de_usuario`: `admin`, `auditoria`, `contralor`, `admincc`, `superuser`.
- `usuarios_crear_nuevo_usuario`: `admin`, `superuser`.
- `usuarios_modificar_datos_de_usuarios`: `admin`, `superuser`.
- `usuarios_modificar_estado_de_usuarios`: `admin`, `superuser`.
- `usuarios_exportar_datos`: `admin`, `auditoria`, `contralor`, `admincc`, `superuser`.
- `usuarios_carga_masiva`: `superuser`.
- *Carga de sesión propia (`GET /api/users/:id`):* Habilitada para todos los roles (`subusuario`, `admin`, `auditoria`, `contralor`, `admincc`, `superuser`, `soporte`) para evitar errores 403 al iniciar sesión (`fetchUser`).

---

## 2. Validación Automatizada en Vivo

Se ejecutó un banco de pruebas automatizadas contra el backend en caliente evaluando las 7 combinaciones de roles para cada acción principal:
```
================================================================
   AUDITORÍA EXHAUSTIVA DE ACCIONES Y PERMISOS POR ROL EN BD    
================================================================
📌 Listar Centros de Costo: 7/7 OK (Acceso solo roles operativos/admin)
📌 Listar Cuentas Corrientes: 7/7 OK (Bloquea subusuario/soporte, permite admin/auditor/contralor/admincc/super)
📌 Listar Empresas: 7/7 OK (Bloquea subusuario/admin/soporte, permite auditor/contralor/admincc/super)
📌 Listar Estados de Pago: 7/7 OK (Bloquea subusuario/soporte, permite admin/auditor/contralor/admincc/super)
📌 Visualizar Cobranza: 7/7 OK (Bloquea subusuario/admin/soporte, permite auditor/contralor/admincc/super)
📌 Listar Usuarios: 7/7 OK (Bloquea subusuario/soporte, permite admin/auditor/contralor/admincc/super)
📌 Ver Perfil de Sesión Propio (fetchUser): 7/7 OK (Todos los roles 200 OK)
📌 Consultar Reservas Personales: 7/7 OK (Permite subusuario/admin/super, bloquea resto)
📌 Listar Boletos Administrativos: 7/7 OK (Bloquea subusuario/soporte, permite admin/auditor/contralor/admincc/super)
📌 Listar Reclamos: 7/7 OK (Permite solo superuser y soporte)
📌 Reportes Estado de Cuenta Periodo: 7/7 OK (Permite solo contralor, admincc y superuser)

================================================================
RESULTADO DE LA AUDITORÍA: 77 / 77 pruebas exitosas (100%)
================================================================
```

Compilación de código TypeScript:
- Backend (`npx tsc --noEmit`): **0 errores**.
- Frontend (`pnpm exec tsc --noEmit`): **0 errores**.
