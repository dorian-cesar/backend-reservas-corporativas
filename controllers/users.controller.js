import bcrypt from "bcryptjs";
import {
  findAll,
  findById,
  findByEmpresa,
  createUser,
  updateUser,
  deleteUser,
} from "../models/user.model.js";

export const getUsers = async (req, res) => {
  try {
    if (req.user.rol === "superuser") {
      const users = await findAll();
      return res.json(users);
    }

    if (req.user.rol === "admin") {
      const users = await findByEmpresa(req.user.empresa);
      return res.json(users);
    }

    return res.status(403).json({ message: "No autorizado" });
  } catch (err) {
    res.status(500).json({ message: "Error en servidor" });
  }
};

export const create = async (req, res) => {
  try {
    const { nombre, rut, email, password, rol, empresa } = req.body;

    let targetEmpresa = empresa;
    if (req.user.rol === "admin") targetEmpresa = req.user.empresa;

    if (rol === "superuser" && req.user.rol !== "superuser")
      return res
        .status(403)
        .json({ message: "Solo el superuser puede crear superusers" });

    const hashed = await bcrypt.hash(password, 10);

    const id = await createUser({
      nombre,
      rut,
      email,
      password: hashed,
      rol,
      empresa: targetEmpresa,
    });

    const user = await findById(id);
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ message: "Error en servidor" });
  }
};

export const update = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    const user = await findById(id);

    if (!user) return res.status(404).json({ message: "Usuario no existe" });

    if (req.user.rol === "admin" && req.user.empresa !== user.empresa)
      return res.status(403).json({ message: "No autorizado" });

    if (data.password) data.password = await bcrypt.hash(data.password, 10);
    else data.password = user.password;

    if (data.rol === "superuser" && req.user.rol !== "superuser")
      return res
        .status(403)
        .json({ message: "No puedes asignar rol superuser" });

    if (req.user.rol === "admin") data.empresa = user.empresa;

    await updateUser(id, data);

    const updated = await findById(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Error en servidor" });
  }
};

export const remove = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await findById(id);

    if (!user) return res.status(404).json({ message: "Usuario inexistente" });

    if (req.user.rol === "admin" && req.user.empresa !== user.empresa)
      return res.status(403).json({ message: "No autorizado" });

    await deleteUser(id);
    res.json({ message: "Eliminado" });
  } catch (err) {
    res.status(500).json({ message: "Error en servidor" });
  }
};
