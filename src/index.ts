import express from "express";
import authRoutes from "./routes/auth.routes";
import empresaRoutes from "./routes/empresa.routes";
import usersRoutes from "./routes/users.routes";
import centroCostoRoutes from "./routes/centro_costo.routes";
import cuentaCorrienteRoutes from "./routes/cuenta_corriente.routes";
import { connectDB } from "./database";
import * as dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "../swagger.json";
import ticketRoutes from "./routes/ticket.routes";
import pdfRoutes from "./routes/pdf.routes";
import estadoCuentaRoutes from "./routes/estadoCuenta.routes"
import dashboardRoutes from "./routes/dashboard.routes"
import pasajeroRoutes from "./routes/pasajeros.routes"
import uploadRoutes from "./routes/upload.routes";
import passwordRoutes from "./routes/password.routes"
import userEmpresaRoutes from "./routes/user_empresa.routes";

dotenv.config();

const PORT = process.env.PORT || 4000;
const app = express();
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/empresas", empresaRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/centros-costo", centroCostoRoutes);
app.use("/api/cuenta-corriente", cuentaCorrienteRoutes);
app.use("/api/estado-cuenta", estadoCuentaRoutes);
app.use("/api/tickets", ticketRoutes);
app.use('/api/pdf', pdfRoutes);
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/pasajeros", pasajeroRoutes)
app.use("/api/upload/", uploadRoutes)
app.use("/api/password", passwordRoutes)
app.use("/api/user-empresa/", userEmpresaRoutes)

// Documentación Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en puerto ${PORT}`);
    });
});

export default app;
