import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);

app.get("/", (req, res) => res.json({ message: "Backend multi-empresa OK" }));

app.listen(process.env.PORT, () =>
  console.log("Servidor corriendo en puerto", process.env.PORT)
);
