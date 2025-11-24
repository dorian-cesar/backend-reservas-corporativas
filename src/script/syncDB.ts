import { connectDB, sequelize } from '../database';

(async () => {
    await connectDB();
    await sequelize.sync({ alter: true });
    console.log('¡Base de datos sincronizada!');
    process.exit(0);
})();
