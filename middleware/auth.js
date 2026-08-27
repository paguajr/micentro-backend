const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

async function verificarAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await prisma.admin.findUnique({
      where: { id: payload.adminId },
    });

    if (!admin || !admin.activo) {
      return res.status(401).json({ error: 'Cuenta inactiva o inexistente' });
    }

    req.adminId = admin.id;
    req.negocioId = admin.negocioId;

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = verificarAdmin;