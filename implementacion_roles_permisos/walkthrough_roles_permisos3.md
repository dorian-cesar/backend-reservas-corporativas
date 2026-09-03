# Walkthrough: Cobertura Total de Roles y Permisos (12 Módulos, 58 Acciones)

Se realizó una auditoría y corrección exhaustiva en caliente sobre los **12 módulos** y sus **58 acciones funcionales**, asegurando sincronización total entre la Base de Datos, el Backend y el Frontend (tanto navegación/pestañas como acciones/botones específicos).

---

## 1. Auditoría de la Base de Datos (`roles_permisos`)

Se verificaron las 58 filas en MySQL agrupadas por módulo:
- **Empresa (11 acciones):** Ver información, crear, modificar datos, modificar cupo, modificar facturación, modificar contacto, modificar morosidad, modificar estado, modificar tramos, exportar datos, carga masiva.
- **Centro de Costo (4 acciones):** Ver información, crear, modificar estado, carga masiva.
- **Usuarios (6 acciones):** Ver información, crear, modificar datos, modificar estado, exportar datos, carga masiva.
- **Estados de Pago (6 acciones):** Ver información, crear EDP manual, exportar datos, descargar detalle, descargar PDF, aplicar descuento.
- **Cuentas Corrientes (6 acciones):** Ver información, pagar línea generada, crear nuevo movimiento (con variantes canónicas y de compatibilidad).
- **Boletos / Tickets (5 acciones):** Ver información, exportar datos, descargas PDF, anular pasaje, ingresar reclamo.
- **Pasajeros (6 acciones):** Ver información, crear, modificar datos, modificar estado, exportar datos, carga masiva.
- **Buscar (1 acción):** Generar búsqueda de servicios.
- **Reservas (4 acciones):** Ver información, descargas PDF, anular pasaje, ingresar reclamo.
- **Reportes (3 acciones):** Seleccionar tipo de reporte, exportar en Excel, exportar en PDF.
- **Reclamos (3 acciones):** Visualizar listado, aprobar reclamo, rechazar reclamo.
- **Historial de Cobranza (3 acciones):** Visualizar módulo, crear, eliminar.

---

## 2. Ajustes Aplicados en Frontend (`Reservas-Corporativas`)

1. **[hooks/usePermissions.ts](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/hooks/usePermissions.ts):**
   - Mapeo bidireccional exhaustivo de alias para absorber cualquier variación entre nombres descriptivos de interfaz y nombres canónicos de BD:
     - `estados_de_pago_aplicar_descuento_en_edp` ⇄ `estados_de_pago_aplicar_descuento_a_estado_de_pago`
     - `cuentas_corrientes_pagar_linea_generada` ⇄ `cuentas_corrientes_pagar_cargo_de_cuenta_corriente`
     - `cuentas_corrientes_crear_nuevo_movimiento` ⇄ `cuentas_corrientes_crear_movimiento_cargo_abono`
     - `historial_de_cobranza_*` ⇄ `cobranza_*`
     - `reclamos_*` ⇄ `reclamos_*_reclamo`
     - `tickets_ver_informacion_de_boletos` ⇄ `tickets_ver_informacion_de_tickets`
     - `buscar_generar_buequeda_de_servicios` ⇄ `reservas_ver_informacion_de_reservas`
     - Normalización automática `cuentas_corrientes_` ⇄ `cuantas_corrientes_`.

2. **[components/estado-pago.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/estado-pago.tsx):**
   - Columna y modal de "Aplicar Descuento" condicionados a `can("estados_de_pago_aplicar_descuento_en_edp")`.
   - Botón "Exportar" condicionado a `can("estados_de_pago_exportar_datos")`.
   - Botón "Crear Estado de Cuenta" condicionado a `can("estados_de_pago_crear_edp_manual")`.
   - Botón `EDPPDFButton` condicionado a `can("estados_de_pago_descargar_pdf_de_edp")`.
   - Botón Ver Detalle condicionado a `can("estados_de_pago_descargar_detalle_de_edp")`.

3. **[components/cuenta-corriente.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/cuenta-corriente.tsx):**
   - Botón "Pagar Cargo" (tabla y tarjetas) condicionado a `can("cuentas_corrientes_pagar_linea_generada")`.
   - Botón "Nuevo Movimiento" condicionado a `can("cuentas_corrientes_crear_nuevo_movimiento")`.

4. **[components/super-components/super-companies.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-companies.tsx):**
   - Se eliminaron todos los `disabled={user?.role !== "superuser"}` y se conectaron a permisos:
     - Día emisión y vencimiento EDP: `can("empresa_modificar_condiciones_de_facturacion")`.
     - Facturación manual: `can("empresa_modificar_condiciones_de_facturacion")`.
     - Morosidad: `can("empresa_modicar_morocidad_empresa")`.
     - Estado activa/inactiva: `can("empresa_modificar_estado_empresa")`.
     - Recargo y devolución: `can("empresa_modificar_datos_de_empresa")`.
     - Botón "Agregar Tramo" de descuento: `can("empresa_modificar_tramos_de_descuentos")`.

5. **[components/super-components/super-reports.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-reports.tsx):**
   - Botón "Exportar PDF" condicionado a `can("reportes_exportar_en_pdf")`.
   - Botón "Exportar Excel (.xlsx)" condicionado a `can("reportes_exportar_en_excel")`.

6. **[components/company-users.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/company-users.tsx):**
   - Selector de estado (Activo/Inactivo) condicionado a `can("usuarios_modificar_estado_de_usuarios")`.

7. **[components/super-components/super-passengers.tsx](file:///c:/Users/Usuario/Desktop/wit-dev/Reservas-Corporativas/components/super-components/super-passengers.tsx):**
   - Implementada función de exportación a CSV condicionada a `can("pasajeros_exportar_datos")`.

---

## 3. Verificación de Resultados

- **Auditoría de Roles en BD:**
  - `subusuario`: 5 permisos activos.
  - `admin`: 28 permisos activos.
  - `auditoria`: 18 permisos activos.
  - `contralor`: 25 permisos activos.
  - `admincc`: 27 permisos activos.
  - `superuser`: 58 permisos activos.
  - `soporte`: 3 permisos activos.
- **Backend:** `npx tsc --noEmit` completado con **0 errores**.
- **Frontend:** `pnpm run build` completado exitosamente con **código 0**, 65/65 páginas estáticas y dinámicas compiladas.
