import pool from "../config/db.js";

export const findByEmail = async (email) => {
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);
  return rows[0];
};

export const findById = async (id) => {
  const [rows] = await pool.query(
    "SELECT id, nombre, rut, email, rol, empresa FROM users WHERE id = ?",
    [id]
  );
  return rows[0];
};

export const findAll = async () => {
  const [rows] = await pool.query(
    "SELECT id, nombre, rut, email, rol, empresa FROM users"
  );
  return rows;
};

export const findByEmpresa = async (empresa) => {
  const [rows] = await pool.query(
    "SELECT id, nombre, rut, email, rol, empresa FROM users WHERE empresa = ?",
    [empresa]
  );
  return rows;
};

export const createUser = async (data) => {
  const { nombre, rut, email, password, rol, empresa } = data;
  const [result] = await pool.query(
    "INSERT INTO users (nombre, rut, email, password, rol, empresa) VALUES (?, ?, ?, ?, ?, ?)",
    [nombre, rut, email, password, rol, empresa]
  );
  return result.insertId;
};

export const updateUser = async (id, data) => {
  const { nombre, rut, email, password, rol, empresa } = data;

  await pool.query(
    `UPDATE users 
     SET nombre=?, rut=?, email=?, password=?, rol=?, empresa=? 
     WHERE id=?`,
    [nombre, rut, email, password, rol, empresa, id]
  );
};

export const deleteUser = async (id) => {
  await pool.query("DELETE FROM users WHERE id = ?", [id]);
};
