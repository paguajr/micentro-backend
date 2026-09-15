const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const verificarAdmin = require('../middleware/auth');

router.use(verificarAdmin);

// Formatea una fecha como YYYY-MM-DD usando sus componentes LOCALES,
// nunca toISOString() (que convierte a UTC y puede correr el día,
// ej. 30/9 23:59:59.999 local en UTC-3 se convierte a 1/10 en UTC).
function formatearFechaLocal(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// Devuelve el inicio (00:00:00.000 local) y el fin (23:59:59.999 local) del
// día que contiene `fecha`. Nunca usar 'Z'/UTC - regla del proyecto.
function rangoDelDia(fecha) {
  const inicio = new Date(fecha);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fecha);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

// Devuelve el inicio (lunes 00:00:00.000) y el fin (domingo 23:59:59.999) de
// la semana calendario que contiene `fecha`.
function rangoDeLaSemana(fecha) {
  const dia = new Date(fecha);
  const diaSemanaJs = dia.getDay(); // 0 = domingo, 1 = lunes, ...
  // Distancia en días hasta el lunes de esta semana
  const offsetHastaLunes = diaSemanaJs === 0 ? 6 : diaSemanaJs - 1;

  const inicio = new Date(dia);
  inicio.setDate(dia.getDate() - offsetHastaLunes);
  inicio.setHours(0, 0, 0, 0);

  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  fin.setHours(23, 59, 59, 999);

  return { inicio, fin };
}

// Devuelve el inicio (día 1, 00:00:00.000) y el fin (último día, 23:59:59.999)
// del mes calendario que contiene `fecha`.
function rangoDelMes(fecha) {
  const dia = new Date(fecha);
  const inicio = new Date(dia.getFullYear(), dia.getMonth(), 1, 0, 0, 0, 0);
  const fin = new Date(dia.getFullYear(), dia.getMonth() + 1, 0, 23, 59, 59, 999);
  return { inicio, fin };
}

// Calcula los totales de negocio (ingresos, egresos, ganancia neta, conteos)
// para un negocio en un rango [inicio, fin] dado. No incluye rankings
// (servicio más vendido / producto más usado) - eso lo agrega /rango aparte.
async function calcularTotales(negocioId, inicio, fin) {
  const [reservasCompletadas, ventas, compras] = await Promise.all([
    prisma.reserva.findMany({
      where: {
        negocioId,
        estado: 'COMPLETADA',
        fecha: { gte: inicio, lte: fin },
      },
      include: { servicio: { select: { precio: true } } },
    }),
    prisma.ventaProducto.findMany({
      where: { negocioId, fecha: { gte: inicio, lte: fin } },
    }),
    prisma.compraStock.findMany({
      where: { negocioId, fecha: { gte: inicio, lte: fin } },
    }),
  ]);

  const ingresosServicios = reservasCompletadas.reduce(
    (total, reserva) => total + Number(reserva.servicio.precio),
    0
  );

  const ingresosVentas = ventas.reduce(
    (total, venta) => total + Number(venta.precioUnit) * venta.cantidad,
    0
  );

  const egresosCompras = compras.reduce(
    (total, compra) => total + (compra.costoTotal ? Number(compra.costoTotal) : 0),
    0
  );

  const ingresosTotales = ingresosServicios + ingresosVentas;
  const gananciaNeta = ingresosTotales - egresosCompras;

  return {
    ingresosServicios,
    ingresosVentas,
    egresosCompras,
    gananciaNeta,
    cantidadReservasCompletadas: reservasCompletadas.length,
    cantidadVentas: ventas.length,
  };
}

// GET /dia?fecha= - resumen de un día puntual, calculado al vuelo (no persiste nada).
// fecha es opcional; por defecto es hoy.
router.get('/dia', async (req, res) => {
  try {
    const fechaBase = req.query.fecha ? new Date(req.query.fecha) : new Date();
    const { inicio, fin } = rangoDelDia(fechaBase);

    const totales = await calcularTotales(req.negocioId, inicio, fin);

    res.json({ fecha: formatearFechaLocal(inicio), ...totales });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' });
  }
});

// GET /rango - resumen agregado sobre un período.
// Admite ?desde=&hasta= (fechas libres) o ?periodo=semana|mes&fecha= (preset).
// Si no se manda nada, el default es el mes calendario actual.
router.get('/rango', async (req, res) => {
  try {
    const { desde, hasta, periodo, fecha } = req.query;

    let inicio;
    let fin;

    if (desde || hasta) {
      inicio = desde ? new Date(desde) : new Date(0);
      const finBase = hasta ? new Date(hasta) : new Date();
      inicio.setHours(0, 0, 0, 0);
      fin = new Date(finBase);
      fin.setHours(23, 59, 59, 999);
    } else {
      const fechaBase = fecha ? new Date(fecha) : new Date();
      if (periodo === 'semana') {
        ({ inicio, fin } = rangoDeLaSemana(fechaBase));
      } else {
        // 'mes' es el default
        ({ inicio, fin } = rangoDelMes(fechaBase));
      }
    }

    const [totales, insumosUsados, reservasCompletadas] = await Promise.all([
      calcularTotales(req.negocioId, inicio, fin),
      prisma.insumoUsado.findMany({
        where: { negocioId: req.negocioId, fecha: { gte: inicio, lte: fin } },
        include: { producto: { select: { nombre: true } } },
      }),
      prisma.reserva.findMany({
        where: {
          negocioId: req.negocioId,
          estado: 'COMPLETADA',
          fecha: { gte: inicio, lte: fin },
        },
        include: { servicio: { select: { id: true, nombre: true } } },
      }),
    ]);

    // Producto más usado: agrupa InsumoUsado por producto y suma cantidades
    const cantidadPorProducto = {};
    for (const insumo of insumosUsados) {
      const clave = insumo.productoId;
      if (!cantidadPorProducto[clave]) {
        cantidadPorProducto[clave] = { nombre: insumo.producto.nombre, cantidad: 0 };
      }
      cantidadPorProducto[clave].cantidad += insumo.cantidad;
    }
    const productoMasUsado = Object.values(cantidadPorProducto).sort(
      (a, b) => b.cantidad - a.cantidad
    )[0] || null;

    // Servicio más vendido: agrupa reservas completadas por servicio
    const cantidadPorServicio = {};
    for (const reserva of reservasCompletadas) {
      const clave = reserva.servicioId;
      if (!cantidadPorServicio[clave]) {
        cantidadPorServicio[clave] = { nombre: reserva.servicio.nombre, cantidad: 0 };
      }
      cantidadPorServicio[clave].cantidad += 1;
    }
    const servicioMasVendido = Object.values(cantidadPorServicio).sort(
      (a, b) => b.cantidad - a.cantidad
    )[0] || null;

    res.json({
      desde: formatearFechaLocal(inicio),
      hasta: formatearFechaLocal(fin),
      ...totales,
      servicioMasVendido,
      productoMasUsado,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' });
  }
});

module.exports = router;
