const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const verificarAdmin = require('../middleware/auth');

router.use(verificarAdmin);

// Diccionario de errores conocidos -> status HTTP + mensaje para el cliente
const erroresConocidos = {
  PRODUCTO_NO_ENCONTRADO: { status: 404, mensaje: 'El producto indicado no existe.' },
  STOCK_INSUFICIENTE: { status: 409, mensaje: 'No hay stock suficiente para registrar este consumo.' },
  INSUMO_NO_ENCONTRADO: { status: 404, mensaje: 'El registro de insumo usado no existe.' },
};

function responderError(res, error) {
  const info = erroresConocidos[error.message];
  if (info) {
    return res.status(info.status).json({ error: error.message, mensaje: info.mensaje });
  }
  console.error(error);
  return res.status(500).json({ error: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' });
}

// POST / - registra que se terminó/agotó una unidad (o más) de un producto.
// No genera egreso en plata (eso lo maneja CompraStock) - solo descuenta stock.
router.post('/', async (req, res) => {
  const { productoId, cantidad, fecha } = req.body;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findFirst({
        where: { id: productoId, negocioId: req.negocioId },
      });
      if (!producto) throw new Error('PRODUCTO_NO_ENCONTRADO');

      if (producto.cantidad - cantidad < 0) {
        throw new Error('STOCK_INSUFICIENTE');
      }

      await tx.producto.update({
        where: { id: productoId },
        data: { cantidad: { decrement: cantidad } },
      });

      const insumoUsado = await tx.insumoUsado.create({
        data: {
          cantidad,
          fecha: fecha ? new Date(fecha) : undefined,
          negocioId: req.negocioId,
          productoId,
        },
      });

      return insumoUsado;
    });

    res.status(201).json(resultado);
  } catch (error) {
    responderError(res, error);
  }
});

// GET / - listado con filtros opcionales por fecha y producto
router.get('/', async (req, res) => {
  const { desde, hasta, productoId } = req.query;

  const where = { negocioId: req.negocioId };
  if (productoId) where.productoId = Number(productoId);
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }

  try {
    const insumosUsados = await prisma.insumoUsado.findMany({
      where,
      include: { producto: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' },
    });
    res.json(insumosUsados);
  } catch (error) {
    responderError(res, error);
  }
});

// DELETE /:id - revierte el stock devuelto y borra el registro
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);

  try {
    await prisma.$transaction(async (tx) => {
      const insumoUsado = await tx.insumoUsado.findFirst({
        where: { id, negocioId: req.negocioId },
      });
      if (!insumoUsado) throw new Error('INSUMO_NO_ENCONTRADO');

      await tx.producto.update({
        where: { id: insumoUsado.productoId },
        data: { cantidad: { increment: insumoUsado.cantidad } },
      });

      await tx.insumoUsado.delete({ where: { id } });
    });

    res.status(204).send();
  } catch (error) {
    responderError(res, error);
  }
});

module.exports = router;
