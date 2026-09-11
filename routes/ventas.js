const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const verificarAdmin = require('../middleware/auth');

// Diccionario de errores conocidos, mismo patrón usado en routes/publico.js y routes/productos.js
const erroresConocidos = {
  PRODUCTO_NO_ENCONTRADO: { status: 404, mensaje: 'Producto no encontrado.' },
  PRODUCTO_INACTIVO: { status: 409, mensaje: 'No se puede registrar una venta de un producto inactivo.' },
  STOCK_INSUFICIENTE: { status: 409, mensaje: 'No hay stock suficiente para esta venta.' },
  VENTA_NO_ENCONTRADA: { status: 404, mensaje: 'Venta no encontrada.' },
};

function responderError(res, error) {
  const conocido = erroresConocidos[error.message];
  if (conocido) {
    return res.status(conocido.status).json({ error: conocido.mensaje });
  }
  console.error(error);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}

// POST / — Registrar una venta de producto (descuenta stock automáticamente)
router.post('/', verificarAdmin, async (req, res) => {
  const { productoId, cantidad, precioUnit, fecha } = req.body;

  if (!productoId || !cantidad || precioUnit === undefined) {
    return res.status(400).json({ error: 'Faltan campos requeridos: productoId, cantidad, precioUnit.' });
  }

  if (cantidad <= 0) {
    return res.status(400).json({ error: 'La cantidad debe ser mayor a cero.' });
  }

  try {
    const venta = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findFirst({
        where: { id: productoId, negocioId: req.negocioId },
      });

      if (!producto) {
        throw new Error('PRODUCTO_NO_ENCONTRADO');
      }

      if (!producto.activo) {
        throw new Error('PRODUCTO_INACTIVO');
      }

      if (producto.cantidad - cantidad < 0) {
        throw new Error('STOCK_INSUFICIENTE');
      }

      await tx.producto.update({
        where: { id: productoId },
        data: { cantidad: { decrement: cantidad } },
      });

      const datosVenta = {
        negocioId: req.negocioId,
        productoId,
        cantidad,
        precioUnit,
      };

      // fecha es opcional: si no se manda, Prisma usa @default(now())
      if (fecha) {
        datosVenta.fecha = new Date(fecha);
      }

      return tx.ventaProducto.create({ data: datosVenta });
    });

    return res.status(201).json(venta);
  } catch (error) {
    return responderError(res, error);
  }
});

// GET / — Listar ventas del negocio, con filtros opcionales de fecha y producto
router.get('/', verificarAdmin, async (req, res) => {
  const { desde, hasta, productoId } = req.query;

  const where = { negocioId: req.negocioId };

  if (productoId) {
    where.productoId = Number(productoId);
  }

  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }

  try {
    const ventas = await prisma.ventaProducto.findMany({
      where,
      include: { producto: { select: { nombre: true } } },
      orderBy: { fecha: 'desc' },
    });

    return res.json(ventas);
  } catch (error) {
    return responderError(res, error);
  }
});

// DELETE /:id — Anular una venta, devolviendo el stock descontado
router.delete('/:id', verificarAdmin, async (req, res) => {
  const ventaId = Number(req.params.id);

  try {
    await prisma.$transaction(async (tx) => {
      const venta = await tx.ventaProducto.findFirst({
        where: { id: ventaId, negocioId: req.negocioId },
      });

      if (!venta) {
        throw new Error('VENTA_NO_ENCONTRADA');
      }

      await tx.producto.update({
        where: { id: venta.productoId },
        data: { cantidad: { increment: venta.cantidad } },
      });

      await tx.ventaProducto.delete({ where: { id: ventaId } });
    });

    return res.status(204).send();
  } catch (error) {
    return responderError(res, error);
  }
});

module.exports = router;