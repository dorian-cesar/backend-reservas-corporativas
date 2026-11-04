# Reglas del Proyecto: Backend Reservas Corporativas

## 1. Regla Mandatoria de Despliegue en AWS (Deploy Rule)

Antes de realizar o coordinar cualquier despliegue (deploy, pase a producción, actualización de código o reinicio de servicios en AWS):

1. **Lectura Obligatoria del Manual:**
   - Es **estrictamente obligatorio** consultar y seguir el manual [MANUAL_DEPLOY_AWS.md](file:///c:/NodeJs/reservas%20corporativas/backend-reservas-corporativas/MANUAL_DEPLOY_AWS.md) antes de ejecutar cualquier acción en el servidor de producción.
2. **Herramientas y MCPs Autorizados:**
   - **AWS:** Utilizar el MCP de trabajo `aws-trabajo` (Cuenta `922850914172`, Región `us-east-1`, instancia Lightsail `reservas-corporativas`).
   - **Git / GitHub:** Utilizar el MCP de Git / GitHub corporativo (`github-trabajo`) o el CLI local para asegurar que la rama `master` esté sincronizada con `origin/master` antes del deploy.
3. **Flujo de Ejecución Rápido en Servidor:**
   - Acceso SSH a `bitnami@32.196.135.134` con la llave de Lightsail (`LightsailDefaultKeyPair`).
   - Ruta remota del proyecto: `/home/bitnami/backend-reservas-corporativas`.
   - Ejecutar la secuencia estandarizada en un solo comando:
     ```bash
     cd /home/bitnami/backend-reservas-corporativas && git stash && git pull origin master && git stash pop || true && export PATH=/opt/bitnami/node/bin:$PATH && npm run build && pm2 reload reservas && pm2 list
     ```
   - **Compilación Obligatoria:** `npm run build` es indispensable para que los cambios se reflejen en la API (PM2) y en las tareas programadas de `crontab` nocturno (`dist/cron/`).
4. **Higiene de Seguridad:**
   - Las llaves SSH temporales generadas localmente deben ser eliminadas inmediatamente al terminar el despliegue.

---

## 2. Regla de Estados de Pago (EDP) y Facturación

- Toda modificación al cálculo, auditoría o envío automático de Estados de Pago debe seguir los lineamientos de [MANUAL_ENVIO_EDPS_AUTOMATICOS.md](file:///c:/NodeJs/reservas%20corporativas/backend-reservas-corporativas/MANUAL_ENVIO_EDPS_AUTOMATICOS.md).
- Todo envío automático de EDP a empresas masivas debe incluir de forma obligatoria la copia en `CC` a `facturacion@pullmanbus.cl`.
