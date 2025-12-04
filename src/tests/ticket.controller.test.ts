// tests/ticket.controller.test.ts

import request from "supertest";
import app from "../index";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { Empresa } from "../models/empresa.model";
import { sequelize } from "../database";
import { ITicketCreate } from "../interfaces/ticket.interface";

let superuserToken: string;
let adminToken: string;
let testUser: User;
let testTicket: Ticket | null = null;
let testEmpresa: Empresa;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  // Crear empresa para asociar usuarios tipo admin
  testEmpresa = await Empresa.create({
    nombre: "Empresa Test",
    recargo: 10,
    porcentaje_devolucion: 0.1,
    estado: true,
  });

  testUser = await User.create({
    nombre: "Test User",
    email: "testuser@example.com",
    password: "hashedpassword",
    rol: "empresa",
    estado: true,
  });

  const superuser = await User.create({
    nombre: "Superuser",
    email: "superuser@example.com",
    password: "hashedpassword",
    rol: "superuser",
    estado: true,
  });

  const admin = await User.create({
    nombre: "Admin",
    email: "admin@example.com",
    password: "hashedpassword",
    rol: "admin",
    empresa_id: testEmpresa.id,
    estado: true,
  });

  superuserToken = "Bearer " + (await getToken(superuser));
  adminToken = "Bearer " + (await getToken(admin));
}, 30000);

afterAll(async () => {
  await sequelize.close();
});

async function getToken(user: User): Promise<string> {
  const jwt = require("jsonwebtoken");
  return jwt.sign(
    {
      id: user.id,
      rol: user.rol,
      empresa_id: user.empresa_id,
    },
    process.env.JWT_SECRET || "testsecret",
    { expiresIn: "1h" }
  );
}

describe("Ticket Controller", () => {
  describe("POST /tickets", () => {
    it("debe crear un ticket como superuser", async () => {
      const payload: ITicketCreate = {
        ticketNumber: "TS251125133854508XBNV",
        ticketStatus: "Confirmed",
        origin: "Santiago",
        destination: "Puerto Montt",
        travelDate: "2025-11-26",
        departureTime: "12:00 AM",
        seatNumbers: "33",
        fare: 2000,
        monto_boleto: 2200,
        confirmedAt: "2025-11-25T16:38:58.962Z",
        id_User: testUser.id,
        monto_devolucion: 0,
        nombre_pasajero: "Test User",
      };

      const res = await request(app)
        .post("/tickets")
        .set("Authorization", superuserToken)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.ticketNumber).toBe(payload.ticketNumber);

      testTicket = await Ticket.findByPk(res.body.id);
      expect(testTicket).not.toBeNull();
    });

    it("no debe crear ticket para usuario inexistente", async () => {
      const payload: ITicketCreate = {
        ticketNumber: "TS251125133854508XBNY",
        ticketStatus: "Confirmed",
        origin: "Santiago",
        destination: "Puerto Montt",
        travelDate: "2025-11-26",
        departureTime: "12:00 AM",
        seatNumbers: "33",
        fare: 2000,
        monto_boleto: 2200,
        confirmedAt: "2025-11-25T16:38:58.962Z",
        id_User: 99999,
        monto_devolucion: 0,
        nombre_pasajero: "Test User",
      };

      const res = await request(app)
        .post("/tickets")
        .set("Authorization", superuserToken)
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body && (res.body.message || res.body.error)).toBe(
        "Usuario no existe"
      );
    });
  });

  describe("GET /tickets", () => {
    it("debe listar tickets como superuser", async () => {
      const res = await request(app)
        .get("/tickets")
        .set("Authorization", superuserToken);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe("PUT /tickets/:id", () => {
    it("debe actualizar un ticket existente", async () => {
      expect(testTicket).not.toBeNull();
      const res = await request(app)
        .put(`/tickets/${testTicket!.id}`)
        .set("Authorization", superuserToken)
        .send({ origin: "Valdivia" });

      expect(res.status).toBe(200);
      expect(res.body.origin).toBe("Valdivia");
    });

    it("no debe actualizar ticket inexistente", async () => {
      const res = await request(app)
        .put(`/tickets/99999`)
        .set("Authorization", superuserToken)
        .send({ origin: "Valdivia" });

      expect(res.status).toBe(404);
      expect(res.body && (res.body.message || res.body.error)).toBe(
        "Ticket no existe"
      );
    });
  });

  describe("PATCH /tickets/:id/status", () => {
    it("debe cambiar el estado del ticket", async () => {
      expect(testTicket).not.toBeNull();
      const res = await request(app)
        .patch(`/tickets/${testTicket!.id}/status`)
        .set("Authorization", superuserToken)
        .send({ ticketStatus: "Anulado" });

      expect(res.status).toBe(200);
      expect(res.body.ticketStatus).toBe("Anulado");
    });

    it("no debe cambiar estado de ticket inexistente", async () => {
      const res = await request(app)
        .patch(`/tickets/99999/status`)
        .set("Authorization", superuserToken)
        .send({ ticketStatus: "Anulado" });

      expect(res.status).toBe(404);
      expect(res.body && (res.body.message || res.body.error)).toBe(
        "Ticket no existe"
      );
    });
  });

  describe("DELETE /tickets/:id", () => {
    it("debe eliminar un ticket existente", async () => {
      expect(testTicket).not.toBeNull();
      const res = await request(app)
        .delete(`/tickets/${testTicket!.id}`)
        .set("Authorization", superuserToken);

      expect(res.status).toBe(200);
      expect(res.body && (res.body.message || res.body.result)).toBe(
        "Eliminado"
      );
    });

    it("no debe eliminar ticket inexistente", async () => {
      const res = await request(app)
        .delete(`/tickets/99999`)
        .set("Authorization", superuserToken);

      expect(res.status).toBe(404);
      expect(res.body && (res.body.message || res.body.error)).toBe(
        "Ticket no existe"
      );
    });
  });
});
