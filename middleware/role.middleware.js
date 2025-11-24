export const onlySuperUser = (req, res, next) => {
  if (req.user?.rol !== "superuser") {
    return res.status(403).json({ message: "Acceso denegado: Solo SUPERUSER" });
  }
  next();
};
