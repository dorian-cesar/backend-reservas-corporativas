import express from "express";
import authRoutes from "./routes/auth.routes";
import empresaRoutes from "./routes/empresa.routes";
import usersRoutes from "./routes/users.routes";
import centroCostoRoutes from "./routes/centro_costo.routes";
import cuentaCorrienteRoutes from "./routes/cuenta_corriente.routes";
import {connectDB} from "./database";

const app = express();
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/empresas", empresaRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/centros-costo", centroCostoRoutes);
app.use("/api/cuenta-corriente", cuentaCorrienteRoutes);


connectDB().then(() => {
    app.listen(4000, () => {
        console.log("Servidor corriendo en puerto 4000");
    });
});

export default app;
