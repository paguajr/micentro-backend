const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const verificarAdmin = require('../middleware/auth');

router.use(verificarAdmin);

// Diccionario de errores conocidos -> status HTTP + mensaje
const erroresConocidos = {
  CIERRE_YA_EXISTE: { status: 409, mensaje: 'Ya existe un cierre de día para esa fecha. Usá PUT para corregirlo.' },
  CIERRE_NO_ENCONTRADO: { status: 404, mensaje: 'Cierre de día no encontrado.' },
  PRODUCTO_NO_ENCONTRADO: { status: 404, mensaje: 'Uno de los productos indicados no existe o no pertenece al negocio.' },
  STOCK_INSUFICIENTE: { status: 409, mensaje: 'No hay stock suficiente para descontar la cantidad indicada.' },
};

function responderError(res, error) {
  const conocido = erroresConocidos[error.message];
  if (conocido) {
    return res.status(conocido.status).json({ error: conocido.mensaje, codigo: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}

// Normaliza el body de fecha: si no viene, usa "hoy" a las 00:00:00 local
function normalizarFechaDia(fechaBody) {
  const fecha = fechaBody ? new Date(fechaBody) : new Date();
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

// Descuenta stock de una lista de insumos dentro de una transacción.
// Lanza STOCK_INSUFICIENTE o PRODUCTO_NO_ENCONTRADO si corresponde.
async function descontarStockInsumos(tx, negocioId, insumos) {
  for (const insumo of insumos) {
    const producto = await tx.producto.findFirst({
      where: { id: insumo.productoId, negocioId },
    });

    if (!producto) {
      throw new Error('PRODUCTO_NO_ENCONTRADO');
    }

    const nuevaCantidad = producto.cantidad - insumo.cantidad;
    if (nuevaCantidad < 0) {
      throw new Error('STOCK_INSUFICIENTE');
    }

    await tx.producto.update({
      where: { id: producto.id },
      data: { cantidad: nuevaCantidad },
    });
  }
}

// Devuelve al stock una lista de insumos ya cargados (usado al editar/revertir)
async function devolverStockInsumos(tx, negocioId, insumosViejos) {
  for (const insumo of insumosViejos) {
    await tx.producto.update({
      where: { id: insumo.productoId },
      data: { cantidad: { increment: insumo.cantidad } },
    });
  }
}

// Calcula la ganancia neta del día para un CierreDia ya cargado.
async function calcularGananciaDia(negocioId, fecha, insumos) {
  const inicioDia = new Date(fecha);
  inicioDia.setHours(0, 0, 0, 0);
  const finDia = new Date(fecha);
  finDia.setHours(23, 59, 59, 999);

  const reservasCompletadas = await prisma.reserva.findMany({
    where: {
      negocioId,
      estado: 'COMPLETADA',
      fecha: { gte: inicioDia, lte: finDia },
    },
    include: { servicio: true },
  });

  const ventasDelDia = await prisma.ventaProducto.findMany({
    where: {
      negocioId,
      fecha: { gte: inicioDia, lte: finDia },
    },
  });

  const ingresosServicios = reservasCompletadas.reduce(
    (total, r) => total + Number(r.servicio.precio),
    0
  );

  const ingresosVentas = ventasDelDia.reduce(
    (total, v) => total + Number(v.precioUnit) * v.cantidad,
    0
  );

  const productosUsados = await prisma.producto.findMany({
    where: { id: { in: insumos.map((i) => i.productoId) } },
  });
  const costoPorProducto = Object.fromEntries(
    productosUsados.map((p) => [p.id, Number(p.costo)])
  );

  const egresosInsumos = insumos.reduce(
    (total, i) => total + (costoPorProducto[i.productoId] ?? 0) * i.cantidad,
    0
  );

  return {
    ingresosServicios,
    ingresosVentas,
    egresosInsumos,
    gananciaNeta: ingresosServicios + ingresosVentas - egresosInsumos,
  };
}

// POST / — crea un CierreDia nuevo con sus insumos, descontando stock
router.post('/', async (req, res) => {
  const negocioId = req.negocioId;
  const { fecha: fechaBody, insumos } = req.body;

  if (!Array.isArray(insumos) || insumos.length === 0) {
    return res.status(400).json({ error: 'Debe indicarse al menos un insumo usado.' });
  }

  const fecha = normalizarFechaDia(fechaBody);

  try {
    const cierre = await prisma.$transaction(async (tx) => {
      const existente = await tx.cierreDia.findUnique({
        where: { negocioId_fecha: { negocioId, fecha } },
      });
      if (existente) {
        throw new Error('CIERRE_YA_EXISTE');
      }

      await descontarStockInsumos(tx, negocioId, insumos);

      return tx.cierreDia.create({
        data: {
          fecha,
          negocioId,
          insumos: {
            create: insumos.map((i) => ({
              productoId: i.productoId,
              cantidad: i.cantidad,
            })),
          },
        },
        include: { insumos: true },
      });
    });

    res.status(201).json(cierre);
  } catch (error) {
    responderError(res, error);
  }
});

// PUT /:id — reemplaza los insumos de un cierre existente (revierte stock viejo, aplica el nuevo)
router.put('/:id', async (req, res) => {
  const negocioId = req.negocioId;
  const id = Number(req.params.id);
  const { insumos } = req.body;

  if (!Array.isArray(insumos) || insumos.length === 0) {
    return res.status(400).json({ error: 'Debe indicarse al menos un insumo usado.' });
  }

  try {
    const cierre = await prisma.$transaction(async (tx) => {
      const existente = await tx.cierreDia.findFirst({
        where: { id, negocioId },
        include: { insumos: true },
      });
      if (!existente) {
        throw new Error('CIERRE_NO_ENCONTRADO');
      }

      // Revertir stock de los insumos viejos antes de aplicar los nuevos
      await devolverStockInsumos(tx, negocioId, existente.insumos);

      // Descontar stock de los insumos nuevos (puede fallar y hacer rollback de todo, incluida la reversión)
      await descontarStockInsumos(tx, negocioId, insumos);

      // Reemplazar los InsumoUsado viejos por los nuevos
      await tx.insumoUsado.deleteMany({ where: { cierreDiaId: id } });

      return tx.cierreDia.update({
        where: { id },
        data: {
          insumos: {
            create: insumos.map((i) => ({
              productoId: i.productoId,
              cantidad: i.cantidad,
            })),
          },
        },
        include: { insumos: true },
      });
    });

    res.json(cierre);
  } catch (error) {
    responderError(res, error);
  }
});

// GET /:id — detalle de un cierre + cálculo de ganancia neta del día
router.get('/:id', async (req, res) => {
  const negocioId = req.negocioId;
  const id = Number(req.params.id);

  try {
    const cierre = await prisma.cierreDia.findFirst({
      where: { id, negocioId },
      include: { insumos: { include: { producto: true } } },
    });

    if (!cierre) {
      throw new Error('CIERRE_NO_ENCONTRADO');
    }

    const ganancia = await calcularGananciaDia(negocioId, cierre.fecha, cierre.insumos);

    res.json({ ...cierre, ganancia });
  } catch (error) {
    responderError(res, error);
  }
});

// GET / — listado de cierres del negocio, con filtro opcional de fechas
router.get('/', async (req, res) => {
  const negocioId = req.negocioId;
  const { desde, hasta } = req.query;

  const where = { negocioId };
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }

  try {
    const cierres = await prisma.cierreDia.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: { insumos: true },
    });

    res.json(cierres);
  } catch (error) {
    responderError(res, error);
  }
});

module.exports = router;