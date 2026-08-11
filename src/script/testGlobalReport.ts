import { connectDB } from "../database";
import { obtenerEstadoCuentaGlobalPeriodo } from "../controllers/reports.controller";

async function testGlobal() {
  await connectDB();

  const req: any = {
    query: {
      meses: "6",
      empresa_id: "todas",
    },
  };

  const res: any = {
    json: (data: any) => {
      console.log("=== EXITO! ===");
      console.log("Periodos:", data.periodos);
      console.log("Total empresas:", data.empresas.length);
      console.log("Totales:", data.totales);
    },
    status: (code: number) => ({
      json: (data: any) => console.error(`ERROR ${code}:`, data),
    }),
  };

  await obtenerEstadoCuentaGlobalPeriodo(req, res);
  process.exit(0);
}

testGlobal();
