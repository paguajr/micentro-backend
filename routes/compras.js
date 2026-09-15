const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const verificarAdmin = require('../middleware/auth');

router.use(verificarAdmin);

const erroresConocidos = {
  PRODUCTO_NO_ENCONTRADO: { status: 404, mensaje: 'El producto indicado no existe.' },
  STOCK_INSUFICIENTE: { status: 409, mensaje: 'No hay stock suficiente para revertir esta compra.' },
  COMPRA_NO_ENCONTRADA: { status: 404, mensaje: 'El registro de compra no existe.' },
};

function responderError(res, error) {
  const info = erroresConocidos[error.message];
  if (info) {
    return res.status(info.status).json({ error: error.message, mensaje: info.mensaje });
  }
  console.error(error);
  return res.status(500).json({ error: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' });
}

// POST / - registra una reposición de stock. costoTotal es opcional: si no se
// manda, solo se actualiza la cantidad sin registrar gasto en estadísticas.
router.post('/', async (req, res) => {
  const { productoId, cantidad, costoTotal, fecha } = req.body;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findFirst({
        where: { id: productoId, negocioId: req.negocioId },
      });
      if (!producto) throw new Error('PRODUCTO_NO_ENCONTRADO');

      await tx.producto.update({
        where: { id: productoId },
        data: { cantidad: { increment: cantidad } },
      });

      const compra = await tx.compraStock.create({
        data: {
          cantidad,
          costoTotal: costoTotal !== undefined ? costoTotal : undefined,
          fecha: fecha ? new Date(fecha) : undefined,
          negocioId: req.negocioId,
          productoId,
        },
      });

      return compra;
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
    const compras = await prisma.compraStock.findMany({
      where,
      include: { producto: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' },
    });
    res.json(compras);
  } catch (error) {
    responderError(res, error);
  }
});

// DELETE /:id - revierte la cantidad sumada y borra el registro.
// Puede fallar con STOCK_INSUFICIENTE si ya se consumió lo comprado.
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);

  try {
    await prisma.$transaction(async (tx) => {
      const compra = await tx.compraStock.findFirst({
        where: { id, negocioId: req.negocioId },
      });
      if (!compra) throw new Error('COMPRA_NO_ENCONTRADA');

      const producto = await tx.producto.findUnique({ where: { id: compra.productoId } });
      if (producto.cantidad - compra.cantidad < 0) {
        throw new Error('STOCK_INSUFICIENTE');
      }

      await tx.producto.update({
        where: { id: compra.productoId },
        data: { cantidad: { decrement: compra.cantidad } },
      });

      await tx.compraStock.delete({ where: { id } });
    });

    res.status(204).send();
  } catch (error) {
    responderError(res, error);
  }
});

module.exports = router;
