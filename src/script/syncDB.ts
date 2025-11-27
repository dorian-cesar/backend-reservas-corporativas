import { connectDB, sequelize } from '../database';

(async () => {
    await connectDB();
    await sequelize.sync({ alter: true });
    console.log('¡Base de datos sincronizada y actualizada con los modelos nuevos sin eliminar datos!');
    process.exit(0);
})();
