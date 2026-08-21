const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('¡Hola, MiCentro!');
});

app.get('/api/test', (req, res) => {
  res.json({
    mensaje: 'La API está funcionando',
    fecha: new Date()
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});