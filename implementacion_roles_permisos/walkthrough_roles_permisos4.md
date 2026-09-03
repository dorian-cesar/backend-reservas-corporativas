# Walkthrough: Corrección de Carga de Centros de Costo para Subusuarios

---

## 1. Problema Reportado
Al operar como `subusuario` en el formulario de compra de pasajes (`components/passenger-info.tsx`):
```
Error cargando centros de costo: 500
at cargarCentrosCosto (components/passenger-info.tsx:786:17)
```

## 2. Causa
1. Al migrar los endpoints de centros de costo para dar soporte a `admincc`, la ruta de listado (`GET /api/centros-costo/empresa/:empresa_id`) se había configurado con `checkPermission("centro_de_costo_ver_informacion_de_centros_de_costos")`.
2. Ese permiso es **administrativo** (para el mantenedor de centros de costo).
3. Los **subusuarios y compradores** no tienen ese permiso administrativo en la base de datos, pero **deben poder listar los centros de costo de su propia empresa para asociar los pasajes que compran**.
4. Al no tener el permiso, el backend respondía con `403 Forbidden` y el proxy de Next.js (`app/api/centros-costo/[id]/route.ts`) capturaba el error arrojando `500 Error interno del servidor`.

## 3. Solución Aplicada
En [src/routes/centro_costo.routes.ts](file:///c:/Users/Usuario/Desktop/wit-dev/backend-reservas-corporativas/src/routes/centro_costo.routes.ts):
- `GET /empresa/:empresa_id` y `GET /:id` quedaron habilitados para todos los roles válidos del sistema que operan con centros de costo (`subusuario`, `admin`, `empresa`, `admincc`, `contralor`, `auditoria`, `superuser`, `soporte`).
- Las acciones de **escritura/gestión** (`crearCentroCosto`, `actualizarCentroCosto`, `eliminarCentroCosto`) se mantienen estrictamente protegidas bajo `checkPermission` dinámico del mantenedor RBAC.

## 4. Validación en Vivo
Se verificó el flujo completo a través del servidor local de Next.js (`http://localhost:3000`):
- `GET http://localhost:3000/api/centros-costo/11` (usado por `passenger-info.tsx`) -> **`200 OK`** (167 centros de costo).
- `GET http://localhost:3000/api/centros-costo/empresa/11` -> **`200 OK`** (167 centros de costo).
- Backend y Frontend sin errores de compilación ni ejecuciones fallidas.
