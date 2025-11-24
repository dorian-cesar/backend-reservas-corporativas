BRANDBOOK 2025
LÓGICA PLATAFORMA DE VENTA
PARA EMPRESAS [Pullman Bus - WIT]
El contenido del documento es de uso exclusivo lo que indica que para cualquier otro uso
viernes, 21 de noviembre de 2025
Copyright © 2025. GRUPO PULLMAN BUS / WIT SPA Servicios Tecnológicos - Los Conquistadores 1700, Providencia, Región Metropolitana, Chile.
A Global Partnership
deberá tener autorización escrita por parte de WIT SPA

ÍNDICE
1. OBJETIVO GENERAL
2. ALCANCE DEL DESARROLLO
3. PERFILES DEL SISTEMA
   3.1. CONSIDERACIONES PERFIL EMPRESA – PORCENTAJE DE INCREMENTO
4. INTEGRACIÓN CON API DE KUPOS
5. FLUJO DE LA SOLUCIÓN
6. INFORMES
   6.1. INFORME DE VENTA DE PASAJES
   6.2. ENCABEZADO DEL EDP (RESUMEN POR EMPRESA)
   3 3 4 4 5 6 7 8 9
   Copyright © 2025 GRUPO PULLMAN BUS / WIT SPA Chile, RM, Santiago.
   Página 2 de 9

    1. OBJETIVO GENERAL
       Desarrollar una Plataforma de Venta para Empresas que permita registrar pasajes para clientes corporativos utilizando la integración actual con Kupos como motor de venta, generando información estructurada para:
       • Control interno.
       • Auditoría.
       • Estados de Pago (EDP).
       • Facturación posterior por empresa.
       Importante: La plataforma NO vende pasajes directamente, solo registra los pasajes confirmados a Kupos y los asocia a cada empresa y usuario. El cobro se realiza a través de la facturación generada posteriormente por el área contralora.
2. ALCANCE DEL DESARROLLO
   La plataforma debe contemplar:
   • Gestión de empresas.
   • Gestión de usuarios corporativos (usuarios empresa y subusuarios).
   • Perfiles diferenciados (Empresa, Subusuario, Auditoría, Contralor, Administrador).
   • Flujo completo de registro de pasajes vía integración con Kupos.
   • Registro y control de anulaciones.
   • Aplicación de porcentaje de incremento por empresa.
   • Envío de correo automático con pasaje adjunto.
   • Generación de EDP.
   • Exportación de información.
   • Auditoría, reportes y trazabilidad completa.
   Copyright © 2025 GRUPO PULLMAN BUS / WIT SPA Chile, RM, Santiago.
   Página 3 de 9

    3. PERFILES DEL SISTEMA
       Perfil
       Descripción General
       Funciones / Permisos
       Administrador
       Usuario con control total sobre la plataforma.
       • •
       • •
       Crear y administrar empresas Configurar el porcentaje de incremento por empresas
       Crear usuarios empresa principales Activar/desactivar empresas y usuarios
       Usuario Empresa (Administrador Cliente)
       Administrador principal de cada empresa cliente.
       • •
       • •
       Administrar datos internos de su empresa Visualizar toda la información consolidada de su empresa
       Anular pasajes Acceder a Historial de Pasajes
       Subusuario Empresa (Comprador)
       Usuario operativo encargado de registrar compras y anulaciones.
       • • •
       Comprar y registrar pasajes
       Anular pasajes según permisos asignados Acceder solo a su propio historial de pasajes
       Usuario Auditoría
       Perfil de revisión con acceso a información global.
       • • •
       Consultar reportes completos
       Ver movimientos por empresa, usuario y fechas Acceso de solo lectura (sin posibilidad de editar)
       Usuario Contralor (EDP / Finanzas)
       Usuario del área financiera encargado del control y facturación.
       • • • •
       Generar Estados de Pago (EDP) Filtrar por empresa y periodo
       Preparar datos para facturación Marcar EDP como “Pendiente” o “Facturado”
       3.1. CONSIDERACIONES PERFIL EMPRESA – PORCENTAJE DE INCREMENTO
       En el perfil de cada empresa se debe configurar un Porcentaje de Incremento, el cual se aplicará directamente sobre la tarifa base entregada por Kupos para todos los pasajes registrados en la plataforma.
       Este porcentaje determina el valor final asociado a cada pasaje y es utilizado posteriormente para la emisión de Estados de Pago (EDP) y la facturación correspondiente.
       Copyright © 2025 GRUPO PULLMAN BUS / WIT SPA Chile, RM, Santiago. Página 4 de 9

   Cada empresa puede tener un porcentaje distinto, y este debe:
   • Ser configurable por el Administrador
   • Aplicarse automáticamente al valor base de cada pasaje.
   • Mantener trazabilidad de cambios para fines de auditoría.
   Fórmula aplicada:
   Valor Final del Pasaje = Tarifa Base Kupos × (1 + Porcentaje de Incremento / 100) 4. INTEGRACIÓN CON API DE KUPOS
   • Ambientes Disponibles
   Ambiente
   Descripción
   Base URL
   API Key
   QA
   Ambiente de pruebas para validación interna y certificación de flujos.
   https://newstg3- gdsbus.kupos.cl
   TSQFFYAPI00515538
   Stage / Pre- Producción
   Ambiente intermedio para pruebas con datos casi reales antes del despliegue final.
   (usar misma estructura del ambiente QA si Kupos lo provee)
   TSWLEXAPI65814865
   Producción
   Ambiente operativo que procesa transacciones reales.
   https://gds.kupos.com
   TSFEFSAPI80085614
   Copyright © 2025 GRUPO PULLMAN BUS / WIT SPA Chile, RM, Santiago.
   Página 5 de 9

    5. FLUJO DE LA SOLUCIÓN
       Etapa
       Descripción
       Detalles / Acciones del Sistema
       4.1. Inicio de Sesión
       Autenticación del usuario en la plataforma.
       • • •
       Ingreso con usuario y contraseña. Validación de empresa y usuario. Validación de permisos.
       4.2. Selección de Servicio
       Visualización de servicios disponibles vía Kupos.
       • Consulta de rutas, horarios, tarifas base y asientos disponibles.
       4.3. Confirmación de Compra
       Envío de solicitud a Kupos.
       • Usuario selecciona servicio y asiento. • Se envía la solicitud de registro.
       4.4. Confirmación desde Kupos
       Registro completo del pasaje.
       • • • • •
       Datos del viaje. Usuario. Empresa.
       Tarifa base + incremento. Pasaje disponible para EDP.
       4.5. Envío de Correo
       Confirmación al comprador.
       • Datos del viaje + archivo adjunto. • Registro del envío.
       5.Solicitud de Anulación
       Usuario solicita anular.
       • Validación de plazo (máximo 4 horas antes).
       5.1. Envío a Kupos
       Solicitud técnica.
       • Estado pendiente.
       5.2. Confirmación de Kupos
       Cancelación efectiva.
       • Estado ANULADO.
       5.3. Registro
       Cargo del 20% en EDP.
       • Fórmula aplicada. • Se registra en EDP.
       Copyright © 2025 GRUPO PULLMAN BUS / WIT SPA Chile, RM, Santiago. Página 6 de 9

       Imagen 1. Flujo Operacional
       Copyright © 2025 GRUPO PULLMAN BUS / WIT SPA Chile, RM, Santiago. Página 7 de 9

    6. INFORMES
       6.1. INFORME DE VENTA DE PASAJES
       Tabla – Campos del Informe de Venta de Pasajes
       Campo
       Descripción
       id_pasaje
       Identificador único del pasaje.
       codigo_reserva_kupos
       Código de reserva entregado por Kupos.
       empresa_id
       ID interno de la empresa.
       empresa_nombre
       Nombre de la empresa.
       usuario_id
       ID del usuario que realizó la compra.
       usuario_nombre
       Nombre del usuario o subusuario.
       perfil_usuario
       Tipo de usuario (Empresa / Subusuario).
       pasajero_nombre
       Nombre del pasajero.
       fecha_compra
       Fecha y hora de compra.
       origen
       Terminal o ciudad de origen.
       destino
       Terminal o ciudad de destino.
       fecha_viaje
       Fecha del viaje.
       hora_salida
       Hora de salida.
       asiento
       Número de asiento asignado.
       servicio_tipo
       Tipo de servicio (Semi Cama, Salón Cama, etc.).
       valor_final_pasaje
       Valor final (tarifa base + incremento).
       estado_pasaje
       Estado del pasaje (VENDIDO / ANULADO).
       fecha_anulacion
       Fecha y hora de anulación (si aplica).
       usuario_anula
       Usuario que ejecutó la anulación (si aplica).
       monto_cargo_anulacion
       Cargo del 20% si el pasaje fue anulado.
       observaciones
       Comentarios adicionales del movimiento.
       Copyright © 2025 GRUPO PULLMAN BUS / WIT SPA Chile, RM, Santiago. Página 8 de 9

   6.2. ENCABEZADO DEL EDP (RESUMEN POR EMPRESA) Tabla – Campos del Informe EDP
   Campo
   Descripción
   edp_id
   Identificador único del EDP.
   empresa_id
   ID interno de la empresa.
   empresa_nombre
   Nombre de la empresa cliente.
   rut_empresa
   RUT de la empresa.
   periodo_desde
   Fecha de inicio del periodo.
   periodo_hasta
   Fecha de término del periodo.
   fecha_generacion
   Fecha y hora en que se generó el EDP.
   total_pasajes_vendidos
   Cantidad total de pasajes vendidos incluidos.
   total_pasajes_anulados
   Cantidad total de pasajes anulados (20% considerado).
   total_bruto_vendido
   Suma de los valores finales de pasajes vendidos.
   total_cargos_anulacion
   Suma del 20% de pasajes anulados.
   total_edp
   Total final del EDP.
   estado_edp
   PENDIENTE / FACTURADO / CERRADO.
   Copyright © 2025 GRUPO PULLMAN BUS / WIT SPA Chile, RM, Santiago. Página 9 de 9
