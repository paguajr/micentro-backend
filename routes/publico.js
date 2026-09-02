const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const {
  obtenerDisponibilidadNegocio,
  obtenerDisponibilidadRecurso,
  horaAMinutos,
} = require('../lib/disponibilidad');

router.get('/negocios/:slug/disponibilidad', async (req, res) => {
  try {
    const negocio = await prisma.negocio.findUnique({
      where: { slug: req.params.slug },
    });

    if (!negocio) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    const { fecha, servicioId } = req.query;

    if (!fecha || !servicioId) {
      return res.status(400).json({ error: 'Faltan parámetros: fecha y servicioId son requeridos' });
    }

    const fechaConvertida = new Date(fecha);
    const servicioIdConvertido = Number(servicioId);

    const disponibilidad = await obtenerDisponibilidadNegocio(
      negocio.id,
      fechaConvertida,
      servicioIdConvertido
    );

    res.json(disponibilidad);

  } catch (error) {
    console.error(error);
    res.status(404).json({ error: error.message });
  }
});

router.post('/negocios/:slug/reservas', async (req, res) => {
  try {
    const { servicioId, fecha, recursoId, cliente } = req.body;

    // Validación básica de campos requeridos
    if (!servicioId || !fecha || !cliente || !cliente.nombre || !cliente.telefono) {
      return res.status(400).json({
        error: 'Faltan datos requeridos: servicioId, fecha, cliente.nombre y cliente.telefono son obligatorios',
      });
    }

    const fechaReserva = new Date(fecha);

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Buscar el negocio
      const negocio = await tx.negocio.findUnique({
        where: { slug: req.params.slug },
      });

      if (!negocio) {
        throw new Error('NEGOCIO_NO_ENCONTRADO');
      }

      // 2. Buscar el servicio, validando que pertenezca a este negocio
      const servicio = await tx.servicio.findFirst({
        where: { id: Number(servicioId), negocioId: negocio.id },
      });

      if (!servicio) {
        throw new Error('SERVICIO_NO_ENCONTRADO');
      }

      const minutoPedido = horaAMinutos(fechaReserva);

      // 3. Determinar qué recurso usar
      let recursoElegido = null;

      if (recursoId) {
        // El cliente pidió un recurso específico: validamos que esté libre
        const recurso = await tx.recurso.findFirst({
          where: { id: Number(recursoId), negocioId: negocio.id, disponible: true },
        });

        if (!recurso) {
          throw new Error('RECURSO_NO_ENCONTRADO');
        }

        const candidatos = await obtenerDisponibilidadRecurso(
          recurso.id, fechaReserva, servicio.duracionMin, tx
        );

        if (!candidatos.includes(minutoPedido)) {
          throw new Error('HORARIO_NO_DISPONIBLE');
        }

        recursoElegido = recurso;

      } else {
        // Asignación automática: buscamos el primer recurso libre a esa hora
        const recursos = await tx.recurso.findMany({
          where: { negocioId: negocio.id, disponible: true },
        });

        for (const recurso of recursos) {
          const candidatos = await obtenerDisponibilidadRecurso(
            recurso.id, fechaReserva, servicio.duracionMin, tx
          );

          if (candidatos.includes(minutoPedido)) {
            recursoElegido = recurso;
            break;
          }
        }

        if (!recursoElegido) {
          throw new Error('HORARIO_NO_DISPONIBLE');
        }
      }

      // 4. Buscar o crear el cliente
      let clienteRegistro = await tx.cliente.findFirst({
        where: { negocioId: negocio.id, telefono: cliente.telefono },
      });

      if (!clienteRegistro) {
        clienteRegistro = await tx.cliente.create({
          data: {
            negocioId: negocio.id,
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            email: cliente.email || null,
          },
        });
      }

      // 5. Crear la reserva
      const reserva = await tx.reserva.create({
        data: {
          negocioId: negocio.id,
          servicioId: servicio.id,
          clienteId: clienteRegistro.id,
          recursoId: recursoElegido.id,
          fecha: fechaReserva,
        },
      });

      return { reserva, recurso: recursoElegido, cliente: clienteRegistro };
    });

    res.status(201).json(resultado);

  } catch (error) {
    console.error(error);

    const erroresConocidos = {
      NEGOCIO_NO_ENCONTRADO: { status: 404, mensaje: 'Negocio no encontrado' },
      SERVICIO_NO_ENCONTRADO: { status: 404, mensaje: 'Servicio no encontrado para este negocio' },
      RECURSO_NO_ENCONTRADO: { status: 404, mensaje: 'Recurso no encontrado o no disponible' },
      HORARIO_NO_DISPONIBLE: { status: 409, mensaje: 'El horario solicitado ya no está disponible' },
    };

    const conocido = erroresConocidos[error.message];

    if (conocido) {
      return res.status(conocido.status).json({ error: conocido.mensaje });
    }

    res.status(500).json({ error: 'Error interno al crear la reserva' });
  }
});

module.exports = router;