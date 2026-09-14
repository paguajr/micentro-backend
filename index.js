const express = require('express');
const adminRoutes = require('./routes/admin');
const publicoRoutes = require('./routes/publico');
const productosRouter = require('./routes/productos');
const ventasRouter = require('./routes/ventas');
const cierresRouter = require('./routes/cierres');

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('¡Hola, MiCentro!');
});

app.get('/api/test', (req, res) => {
  res.json({
    mensaje: 'La API está funcionando',
    fecha: new Date()
  });
});

app.use('/api/admin/productos', productosRouter);
app.use('/api/admin/ventas', ventasRouter);
app.use('/api/admin/cierres', cierresRouter);
app.use('/api/admin', adminRoutes);
app.use('/api', publicoRoutes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});