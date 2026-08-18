// src/script/reEnviarEDP.run.ts
import * as dotenv from "dotenv";
dotenv.config();

import { reEnviarEDP } from "./reEnviarEDP";

(async () => {
  try {
    const args = process.argv.slice(2);
    const edpId = args[0] ? parseInt(args[0], 10) : 7784; // Acciona por defecto

    await reEnviarEDP(edpId);
    console.log("Re-envío de EDP procesado correctamente.");
    process.exit(0);
  } catch (error) {
    console.error("Error procesando re-envío de EDP:", error);
    process.exit(1);
  }
})();
