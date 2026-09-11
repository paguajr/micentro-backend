// routes/productos.js
//
// CRUD de Producto (inventario) para el panel de administración.
// Todas las rutas están protegidas por verificarAdmin: el negocio se identifica
// siempre por req.negocioId (viene del JWT), nunca por un id que mande el cliente.
//
// Reglas de negocio implementadas en este archivo:
// - PUT /:id edita nombre y costo. NUNCA toca cantidad (ver justificación en el chat).
// - PATCH /:id/stock ajusta cantidad sumando/restando un delta. Nunca permite negativo.
// - DELETE /:id borra físicamente solo si el producto no tiene historial
//   (ni VentaProducto ni InsumoUsado asociados). Si tiene historial, 409.
// - GET /  lista solo productos activos por defecto; ?incluirInactivos=true trae todos.

const express = require('express');
const prisma = require('../lib/prisma');
const verificarAdmin = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// Diccionario de errores conocidos (mismo patrón que routes/publico.js)
// ─────────────────────────────────────────────────────────────
const erroresConocidos = {
  PRODUCTO_NO_ENCONTRADO: {
    status: 404,
    mensaje: 'Producto no encontrado.',
  },
  STOCK_INSUFICIENTE: {
    status: 409,
    mensaje: 'El ajuste dejaría el stock en negativo.',
  },
  PRODUCTO_CON_HISTORIAL: {
    status: 409,
    mensaje:
      'No se puede eliminar: el producto tiene ventas o insumos usados registrados. ' +
      'Podés desactivarlo en su lugar (PATCH /api/admin/productos/:id/estado).',
  },
};

function responderError(res, error) {
  const conocido = erroresConocidos[error.message];
  if (conocido) {
    return res.status(conocido.status).json({ error: conocido.mensaje });
  }
  console.error(error);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}

// ─────────────────────────────────────────────────────────────
// POST /api/admin/productos — crear producto
// ─────────────────────────────────────────────────────────────
router.post('/', verificarAdmin, async (req, res) => {
  try {
    const { nombre, cantidad, costo } = req.body;

    if (!nombre || cantidad === undefined || costo === undefined) {
      return res
        .status(400)
        .json({ error: 'Faltan campos: nombre, cantidad y costo son obligatorios.' });
    }

    if (cantidad < 0) {
      return res.status(400).json({ error: 'La cantidad inicial no puede ser negativa.' });
    }

    const producto = await prisma.producto.create({
      data: {
        nombre,
        cantidad,
        costo,
        negocioId: req.negocioId,
      },
    });

    return res.status(201).json(producto);
  } catch (error) {
    return responderError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/productos — listar productos del negocio
// Por defecto solo activos. ?incluirInactivos=true trae todos.
// ─────────────────────────────────────────────────────────────
router.get('/', verificarAdmin, async (req, res) => {
  try {
    const incluirInactivos = req.query.incluirInactivos === 'true';

    const where = { negocioId: req.negocioId };
    if (!incluirInactivos) {
      where.activo = true;
    }

    const productos = await prisma.producto.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });

    return res.json(productos);
  } catch (error) {
    return responderError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/productos/:id — ver un producto puntual
// ─────────────────────────────────────────────────────────────
router.get('/:id', verificarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const producto = await prisma.producto.findFirst({
      where: { id, negocioId: req.negocioId },
    });

    if (!producto) {
      throw new Error('PRODUCTO_NO_ENCONTRADO');
    }

    return res.json(producto);
  } catch (error) {
    return responderError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/admin/productos/:id — editar nombre y costo
// NUNCA toca cantidad — para eso está PATCH /:id/stock.
// ─────────────────────────────────────────────────────────────
router.put('/:id', verificarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, costo } = req.body;

    if (!nombre && costo === undefined) {
      return res
        .status(400)
        .json({ error: 'Debés enviar al menos nombre o costo para actualizar.' });
    }

    const existente = await prisma.producto.findFirst({
      where: { id, negocioId: req.negocioId },
    });

    if (!existente) {
      throw new Error('PRODUCTO_NO_ENCONTRADO');
    }

    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (costo !== undefined) data.costo = costo;

    const actualizado = await prisma.producto.update({
      where: { id },
      data,
    });

    return res.json(actualizado);
  } catch (error) {
    return responderError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/productos/:id/stock — ajustar cantidad
// Body: { ajuste: number } — positivo suma, negativo resta.
// Nunca permite que la cantidad resultante sea negativa.
// ─────────────────────────────────────────────────────────────
router.patch('/:id/stock', verificarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ajuste } = req.body;

    if (ajuste === undefined || typeof ajuste !== 'number' || !Number.isInteger(ajuste)) {
      return res
        .status(400)
        .json({ error: 'El campo ajuste es obligatorio y debe ser un número entero.' });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const producto = await tx.producto.findFirst({
        where: { id, negocioId: req.negocioId },
      });

      if (!producto) {
        throw new Error('PRODUCTO_NO_ENCONTRADO');
      }

      const nuevaCantidad = producto.cantidad + ajuste;

      if (nuevaCantidad < 0) {
        throw new Error('STOCK_INSUFICIENTE');
      }

      return tx.producto.update({
        where: { id },
        data: { cantidad: nuevaCantidad },
      });
    });

    return res.json(resultado);
  } catch (error) {
    return responderError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/productos/:id/estado — activar/desactivar
// Body: { activo: boolean }
// ─────────────────────────────────────────────────────────────
router.patch('/:id/estado', verificarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { activo } = req.body;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo activo es obligatorio y debe ser boolean.' });
    }

    const existente = await prisma.producto.findFirst({
      where: { id, negocioId: req.negocioId },
    });

    if (!existente) {
      throw new Error('PRODUCTO_NO_ENCONTRADO');
    }

    const actualizado = await prisma.producto.update({
      where: { id },
      data: { activo },
    });

    return res.json(actualizado);
  } catch (error) {
    return responderError(res, error);
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/admin/productos/:id — borrado físico
// Solo si el producto no tiene historial (VentaProducto ni InsumoUsado).
// Si tiene historial → 409, sugiriendo desactivar.
// ─────────────────────────────────────────────────────────────
router.delete('/:id', verificarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const producto = await prisma.producto.findFirst({
      where: { id, negocioId: req.negocioId },
      include: {
        _count: {
          select: { ventas: true, insumos: true },
        },
      },
    });

    if (!producto) {
      throw new Error('PRODUCTO_NO_ENCONTRADO');
    }

    const tieneHistorial = producto._count.ventas > 0 || producto._count.insumos > 0;

    if (tieneHistorial) {
      throw new Error('PRODUCTO_CON_HISTORIAL');
    }

    await prisma.producto.delete({ where: { id } });

    return res.status(204).send();
  } catch (error) {
    return responderError(res, error);
  }
});

module.exports = router;