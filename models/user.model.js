import pool from "../config/db.js";

export const findByEmail = async (email) => {
  const [rows] = await pool.query(
    `SELECT 
        u.*, 
        e.nombre AS empresa_nombre
     FROM users u
     LEFT JOIN empresas e ON u.empresa = e.id
     WHERE u.email = ?`,
    [email]
  );
  return rows[0];
};

export const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT 
        u.id, u.nombre, u.rut, u.email, u.rol, u.empresa,
        e.nombre AS empresa_nombre
     FROM users u
     LEFT JOIN empresas e ON u.empresa = e.id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0];
};

export const findAll = async () => {
  const [rows] = await pool.query(
    `SELECT 
        u.id, u.nombre, u.rut, u.email, u.rol, u.empresa,
        e.nombre AS empresa_nombre
     FROM users u
     LEFT JOIN empresas e ON u.empresa = e.id`
  );
  return rows;
};

export const findByEmpresa = async (empresa) => {
  const [rows] = await pool.query(
    `SELECT 
        u.id, u.nombre, u.rut, u.email, u.rol, u.empresa,
        e.nombre AS empresa_nombre
     FROM users u
     LEFT JOIN empresas e ON u.empresa = e.id
     WHERE u.empresa = ?`,
    [empresa]
  );
  return rows;
};

export const createUser = async (data) => {
  const { nombre, rut, email, password, rol, empresa } = data;
  const [result] = await pool.query(
    `INSERT INTO users (nombre, rut, email, password, rol, empresa) 
     VALUES (?, ?, ?, ?, ?, ?)`,
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
