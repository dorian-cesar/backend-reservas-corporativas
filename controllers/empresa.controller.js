import {
  getAllEmpresas,
  getEmpresaById,
  createEmpresa,
  updateEmpresa,
  deleteEmpresa,
} from "../models/empresa.model.js";

export const listarEmpresas = async (req, res) => {
  const empresas = await getAllEmpresas();
  res.json(empresas);
};

export const obtenerEmpresa = async (req, res) => {
  const empresa = await getEmpresaById(req.params.id);
  if (!empresa) return res.status(404).json({ message: "No encontrada" });
  res.json(empresa);
};

export const crearEmpresa = async (req, res) => {
  const { nombre, estado } = req.body;
  const id = await createEmpresa({ nombre, estado });
  res.json({ id, message: "Empresa creada" });
};

export const actualizarEmpresa = async (req, res) => {
  const fila = await updateEmpresa(req.params.id, req.body);
  if (!fila) return res.status(404).json({ message: "No encontrada" });
  res.json({ message: "Empresa actualizada" });
};

export const eliminarEmpresa = async (req, res) => {
  const fila = await deleteEmpresa(req.params.id);
  if (!fila) return res.status(404).json({ message: "No encontrada" });
  res.json({ message: "Empresa eliminada" });
};
