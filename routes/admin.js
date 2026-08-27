const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const verificarAdmin = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const admin = await prisma.admin.findUnique({
    where: { email },
  });

  if (!admin) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const passwordCorrecta = await bcrypt.compare(password, admin.password);

  if (!passwordCorrecta) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = jwt.sign(
    { adminId: admin.id, negocioId: admin.negocioId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token });
});

router.get('/perfil', verificarAdmin, async (req, res) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.adminId },
    select: { id: true, email: true, activo: true, negocioId: true },
  });

  res.json({ admin });
});

module.exports = router;