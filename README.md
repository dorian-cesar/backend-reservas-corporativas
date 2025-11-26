# Backend Reservas Corporativas

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-black?logo=express)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Sequelize](https://img.shields.io/badge/Sequelize-6.x-3f3f3f?logo=sequelize)](https://sequelize.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.x-blue?logo=mysql)](https://www.mysql.com/)
[![Swagger](https://img.shields.io/badge/Swagger-UI-85ea2d?logo=swagger)](https://swagger.io/tools/swagger-ui/)
[![Jest](https://img.shields.io/badge/Jest-29.x-c21325?logo=jest)](https://jestjs.io/)

Backend multiempresa para reservas corporativas Pullman Bus - WIT.

## Tabla de Contenidos

- [Descripción](#descripción)
- [Características](#características)
- [Instalación](#instalación)
- [Scripts](#scripts)
- [Estructura de Rutas](#estructura-de-rutas)
- [Autenticación y Roles](#autenticación-y-roles)
- [Swagger](#swagger)
- [Contribución](#contribución)
- [Licencia](#licencia)
- [Autor](#autor)

---

## Descripción

Este proyecto es un backend multiempresa para la gestión de reservas corporativas, desarrollado con Node.js, Express y Sequelize. Permite la administración de tickets, usuarios, empresas, centros de costo y movimientos de cuenta corriente, con control de acceso basado en roles y autenticación JWT.

---

## Características

- Gestión de tickets de viaje por empresa y usuario.
- Administración de usuarios y roles (superuser, admin, subusuario, contralor).
- Gestión de empresas y centros de costo.
- Registro y consulta de movimientos de cuenta corriente.
- Autenticación JWT.
- Documentación Swagger.

---

## Instalación

1. Clona el repositorio:

   ```bash
   git clone https://github.com/ivalenzuela/backend-reservas-corporativas.git
   cd backend-reservas-corporativas
   ```

2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Configura las variables de entorno en un archivo `.env`.

4. Ejecuta las migraciones y/o sincroniza la base de datos según corresponda.

---

## Scripts

- `npm run dev` — Inicia el servidor en modo desarrollo.
- `npm run build` — Compila el proyecto a JavaScript.
- `npm start` — Compila y ejecuta el servidor.
- `npm run lint` — Ejecuta ESLint sobre el código fuente.
- `npm run seed:superuser` — Crea el usuario superuser inicial.
- `npm run syncDB` — Sincroniza los modelos con la base de datos.
- `npm test` — Ejecuta los tests con Jest.

---

## Estructura de Rutas

### Tickets

- `GET /tickets` — Listar tickets (superuser, admin)
- `POST /tickets` — Crear ticket (superuser, admin, subusuario)
- `GET /tickets/search` — Buscar tickets por ticketNumber (superuser, admin, subusuario)
- `GET /tickets/empresa/:id_empresa` — Tickets por empresa (superuser, admin)
- `GET /tickets/usuario/:id_User` — Tickets por usuario (superuser, admin, subusuario)
- `PUT /tickets/:id` — Actualizar ticket (superuser, admin, subusuario)
- `DELETE /tickets/:id` — Eliminar ticket (superuser, admin)
- `PATCH /tickets/:id/status` — Cambiar estado del ticket (superuser, admin)

### Usuarios

- `GET /users` — Listar usuarios (superuser, admin)
- `POST /users` — Crear usuario (superuser, admin)
- `PUT /users/:id` — Actualizar usuario (superuser, admin)
- `DELETE /users/:id` — Eliminar usuario (superuser, admin)
- `PATCH /users/:id/estado` — Activar/desactivar usuario (superuser, admin)

### Empresas

- `GET /empresas` — Listar empresas (superuser)
- `GET /empresas/:id` — Obtener empresa (superuser, admin)
- `POST /empresas` — Crear empresa (superuser)
- `PUT /empresas/:id` — Actualizar empresa (superuser)
- `DELETE /empresas/:id` — Eliminar empresa (superuser)

### Centros de Costo

- `GET /centros-costo/empresa/:empresa_id` — Listar centros de costo por empresa (admin, superuser)
- `GET /centros-costo/:id` — Obtener centro de costo (admin, superuser)
- `POST /centros-costo` — Crear centro de costo (admin, superuser)
- `PUT /centros-costo/:id` — Actualizar centro de costo (admin, superuser)
- `DELETE /centros-costo/:id` — Eliminar centro de costo (admin, superuser)

### Cuenta Corriente

- `GET /cuenta-corriente/empresa/:empresa_id` — Listar movimientos (admin, superuser, contralor)
- `GET /cuenta-corriente/:id` — Obtener movimiento (admin, superuser, contralor)
- `POST /cuenta-corriente` — Crear movimiento (admin, superuser, contralor)
- `DELETE /cuenta-corriente/:id` — Eliminar movimiento (superuser)

### Autenticación

- `POST /auth/login` — Login de usuario

---

## Autenticación y Roles

El acceso a las rutas está protegido mediante JWT y control de roles. Los roles disponibles son:

- `superuser`
- `admin`
- `subusuario`
- `contralor`

Consulta los middlewares `authenticateJWT` y `authorizeRoles` para más detalles.

---

## Swagger

La documentación de la API está disponible en `/api-docs` utilizando Swagger UI.

---

## Contribución

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request para sugerencias o mejoras.

---

## Licencia

MIT

---

## Autores

[![Dorian Gonzalez](https://img.shields.io/badge/Dorian%20Gonzalez-github-black?logo=github&labelColor=black&color=gray)](https://github.com/dorian-cesar)
[![dgonzalez@wit.la](https://img.shields.io/badge/email-dgonzalez@wit.la-blue?logo=gmail)](mailto:dgonzalez@wit.la)

[![Iván Valenzuela](https://img.shields.io/badge/Iván%20Valenzuela-github-black?logo=github&labelColor=black&color=gray)](https://github.com/ivalenzuela)
[![ivalenzuela@wit.la](https://img.shields.io/badge/email-ivalenzuela@wit.la-blue?logo=gmail)](mailto:ivalenzuela@wit.la)

[![WIT](https://img.shields.io/badge/WIT-Innovaci%C3%B3n%20y%20Tecnolog%C3%ADa-00bfae?logo=linkedin)](https://cl.linkedin.com/company/wit-innovacion-y-tecnologia)
[![wit.la](https://img.shields.io/badge/wit.la-web-00bfae?logo=internet-explorer)](https://wit.la/)
