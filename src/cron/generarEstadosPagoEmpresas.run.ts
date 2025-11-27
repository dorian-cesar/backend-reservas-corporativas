// src/cron/generarEstadosPagoEmpresas.run.ts

import "../database"; // Asegúrate de importar tu inicialización de Sequelize/DB
import { generarEstadosPagoEmpresas } from "./generarEstadosPagoEmpresas";

(async () => {
    try {
        await generarEstadosPagoEmpresas();
        console.log("Estados de pago generados correctamente.");
        process.exit(0);
    } catch (error) {
        console.error("Error generando estados de pago:", error);
        process.exit(1);
    }
})();
