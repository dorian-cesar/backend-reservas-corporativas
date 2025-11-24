import pool from "../config/db.js";

export const getAllEmpresas = async () => {
  const [rows] = await pool.query("SELECT * FROM empresas ORDER BY id DESC");
  return rows;
};

export const getEmpresaById = async (id) => {
  const [rows] = await pool.query(
    "SELECT * FROM empresas WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0];
};

export const createEmpresa = async ({ nombre, estado }) => {
  const [result] = await pool.query(
    "INSERT INTO empresas (nombre, estado) VALUES (?, ?)",
    [nombre, estado]
  );
  return result.insertId;
};

export const updateEmpresa = async (id, { nombre, estado }) => {
  const [result] = await pool.query(
    "UPDATE empresas SET nombre = ?, estado = ? WHERE id = ?",
    [nombre, estado, id]
  );
  return result.affectedRows;
};

export const deleteEmpresa = async (id) => {
  const [result] = await pool.query("DELETE FROM empresas WHERE id = ?", [id]);
  return result.affectedRows;
};
