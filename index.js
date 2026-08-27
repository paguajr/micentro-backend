const express = require('express');
const adminRoutes = require('./routes/admin');

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

app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});