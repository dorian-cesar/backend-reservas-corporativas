import { connectDB, sequelize } from '../database';

(async () => {
    await connectDB();
    await sequelize.sync({ alter: false });
    console.log('¡Base de datos sincronizada sin eliminar datos!');
    process.exit(0);
})();
