const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const {
  obtenerDisponibilidadNegocio,
  obtenerDisponibilidadRecurso,
  horaAMinutos,
} = require('../lib/disponibilidad');
const { normalizarTelefono } = require('../lib/telefono');

const LIMITE_RESERVAS_VIGENTES = 3;
const LIMITE_HORAS_ANTICIPACION = 2;
const MILISEGUNDOS_POR_HORA = 60 * 60 * 1000;

const limiteDisponibilidad = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 30,
  message: { error: 'Demasiadas consultas desde esta conexión. Probá de nuevo en unos minutos.' },
});

const limiteReservas = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: { error: 'Demasiadas reservas desde esta conexión. Probá de nuevo en unos minutos.' },
});

// Diccionario compartido de errores conocidos, usado por POST, PUT y DELETE de reservas.
// Centralizarlo acá evita repetir las mismas traducciones código-interno -> HTTP en cada ruta.
const erroresConocidos = {
  NEGOCIO_NO_ENCONTRADO: { status: 404, mensaje: 'Negocio no encontrado' },
  SERVICIO_NO_ENCONTRADO: { status: 404, mensaje: 'Servicio no encontrado para este negocio' },
  RECURSO_NO_ENCONTRADO: { status: 404, mensaje: 'Recurso no encontrado o no disponible' },
  HORARIO_NO_DISPONIBLE: { status: 409, mensaje: 'El horario solicitado ya no está disponible' },
  LIMITE_RESERVAS_ALCANZADO: {
    status: 409,
    mensaje: `Ya tenés el máximo de reservas activas permitidas (${LIMITE_RESERVAS_VIGENTES}) en este negocio`,
  },
  RESERVA_NO_ENCONTRADA: { status: 404, mensaje: 'Reserva no encontrada' },
  RESERVA_NO_VIGENTE: { status: 409, mensaje: 'Esta reserva ya fue cancelada o completada' },
  ANTICIPACION_INSUFICIENTE: {
    status: 409,
    mensaje: `No se puede modificar ni cancelar una reserva con menos de ${LIMITE_HORAS_ANTICIPACION} horas de anticipación`,
  },
};

function responderError(res, error) {
  console.error(error);

  const conocido = erroresConocidos[error.message];

  if (conocido) {
    return res.status(conocido.status).json({ error: conocido.mensaje });
  }

  res.status(500).json({ error: 'Error interno' });
}

router.get('/negocios/:slug/disponibilidad', limiteDisponibilidad, async (req, res) => {
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

router.post('/negocios/:slug/reservas', limiteReservas, async (req, res) => {
  try {
    const { servicioId, fecha, recursoId, cliente } = req.body;

    // Validación básica de campos requeridos
    if (!servicioId || !fecha || !cliente || !cliente.nombre || !cliente.telefono) {
      return res.status(400).json({
        error: 'Faltan datos requeridos: servicioId, fecha, cliente.nombre y cliente.telefono son obligatorios',
      });
    }

    // Validar y normalizar el teléfono a formato E.164 (+598XXXXXXXX)
    const telefonoNormalizado = normalizarTelefono(cliente.telefono);

    if (!telefonoNormalizado) {
      return res.status(400).json({
        error: 'El formato de teléfono no es válido. Usá 09X XXX XXX o +598 9X XXX XXX.',
      });
    }

    cliente.telefono = telefonoNormalizado;

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

      // 4.5. Verificar que el cliente no supere el límite de reservas VIGENTE en este negocio
      const reservasVigentes = await tx.reserva.count({
        where: {
          negocioId: negocio.id,
          clienteId: clienteRegistro.id,
          estado: 'VIGENTE',
        },
      });

      if (reservasVigentes >= LIMITE_RESERVAS_VIGENTES) {
        throw new Error('LIMITE_RESERVAS_ALCANZADO');
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
    responderError(res, error);
  }
});

// PUT /negocios/:slug/reservas/:id — modificar fecha/hora y, opcionalmente, el recurso
// de una reserva existente. El cliente se identifica con negocioId + id de la reserva +
// teléfono (verificación liviana, sin login, ver definición conversacional de esta sesión).
router.put('/negocios/:slug/reservas/:id', limiteReservas, async (req, res) => {
  try {
    const { telefono, fecha, recursoId } = req.body;
    const reservaId = Number(req.params.id);

    if (!telefono || !fecha) {
      return res.status(400).json({
        error: 'Faltan datos requeridos: telefono y fecha son obligatorios',
      });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);

    if (!telefonoNormalizado) {
      return res.status(400).json({
        error: 'El formato de teléfono no es válido. Usá 09X XXX XXX o +598 9X XXX XXX.',
      });
    }

    const fechaNueva = new Date(fecha);

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Buscar el negocio
      const negocio = await tx.negocio.findUnique({
        where: { slug: req.params.slug },
      });

      if (!negocio) {
        throw new Error('NEGOCIO_NO_ENCONTRADO');
      }

      // 2. Buscar la reserva, incluyendo su cliente y servicio.
      //    Se filtra por negocioId además del id, para que una reserva de otro
      //    negocio nunca sea alcanzable desde acá (aislamiento multi-tenant).
      const reserva = await tx.reserva.findFirst({
        where: { id: reservaId, negocioId: negocio.id },
        include: { cliente: true, servicio: true },
      });

      // Nota de seguridad: si la reserva no existe O el teléfono no coincide con
      // el dueño, devolvemos el mismo error (RESERVA_NO_ENCONTRADA -> 404) en
      // ambos casos. Así no le confirmamos a quien pregunta si un ID existe o no.
      if (!reserva || reserva.cliente.telefono !== telefonoNormalizado) {
        throw new Error('RESERVA_NO_ENCONTRADA');
      }

      // 3. Solo se puede modificar una reserva VIGENTE
      if (reserva.estado !== 'VIGENTE') {
        throw new Error('RESERVA_NO_VIGENTE');
      }

      // 4. Anticipación mínima: se calcula sobre la fecha ACTUAL de la reserva
      //    (antes de cambiarla), no sobre la fecha nueva pedida.
      const ahora = new Date();
      const horasHastaReserva = (reserva.fecha - ahora) / MILISEGUNDOS_POR_HORA;

      if (horasHastaReserva < LIMITE_HORAS_ANTICIPACION) {
        throw new Error('ANTICIPACION_INSUFICIENTE');
      }

      const minutoPedido = horaAMinutos(fechaNueva);

      // 5. Determinar el recurso final: el mismo que ya tenía, o uno nuevo si
      //    el cliente pidió cambiarlo explícitamente.
      let recursoElegido;

      if (recursoId) {
        const recurso = await tx.recurso.findFirst({
          where: { id: Number(recursoId), negocioId: negocio.id, disponible: true },
        });

        if (!recurso) {
          throw new Error('RECURSO_NO_ENCONTRADO');
        }

        recursoElegido = recurso;

      } else {
        recursoElegido = await tx.recurso.findFirst({
          where: { id: reserva.recursoId, negocioId: negocio.id, disponible: true },
        });

        if (!recursoElegido) {
          throw new Error('RECURSO_NO_ENCONTRADO');
        }
      }

      // 6. Revalidar disponibilidad del recurso elegido para el horario nuevo.
      //    IMPORTANTE: hay que excluir la propia reserva del cálculo de huecos
      //    libres — si no, la reserva chocaría contra sí misma y jamás podría
      //    "moverse" dentro de su propio bloque de tiempo.
      const candidatos = await obtenerDisponibilidadRecurso(
        recursoElegido.id, fechaNueva, reserva.servicio.duracionMin, tx, reserva.id
      );

      if (!candidatos.includes(minutoPedido)) {
        throw new Error('HORARIO_NO_DISPONIBLE');
      }

      // 7. Actualizar la reserva
      const reservaActualizada = await tx.reserva.update({
        where: { id: reserva.id },
        data: {
          fecha: fechaNueva,
          recursoId: recursoElegido.id,
        },
      });

      return reservaActualizada;
    });

    res.json(resultado);

  } catch (error) {
    responderError(res, error);
  }
});

// DELETE /negocios/:slug/reservas/:id — cancelar una reserva existente.
// Misma verificación de identidad que el PUT (negocioId + id + teléfono).
router.delete('/negocios/:slug/reservas/:id', limiteReservas, async (req, res) => {
  try {
    const { telefono } = req.body;
    const reservaId = Number(req.params.id);

    if (!telefono) {
      return res.status(400).json({ error: 'Falta el dato requerido: telefono' });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);

    if (!telefonoNormalizado) {
      return res.status(400).json({
        error: 'El formato de teléfono no es válido. Usá 09X XXX XXX o +598 9X XXX XXX.',
      });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const negocio = await tx.negocio.findUnique({
        where: { slug: req.params.slug },
      });

      if (!negocio) {
        throw new Error('NEGOCIO_NO_ENCONTRADO');
      }

      const reserva = await tx.reserva.findFirst({
        where: { id: reservaId, negocioId: negocio.id },
        include: { cliente: true },
      });

      if (!reserva || reserva.cliente.telefono !== telefonoNormalizado) {
        throw new Error('RESERVA_NO_ENCONTRADA');
      }

      if (reserva.estado !== 'VIGENTE') {
        throw new Error('RESERVA_NO_VIGENTE');
      }

      const ahora = new Date();
      const horasHastaReserva = (reserva.fecha - ahora) / MILISEGUNDOS_POR_HORA;

      if (horasHastaReserva < LIMITE_HORAS_ANTICIPACION) {
        throw new Error('ANTICIPACION_INSUFICIENTE');
      }

      const reservaCancelada = await tx.reserva.update({
        where: { id: reserva.id },
        data: { estado: 'CANCELADA' },
      });

      return reservaCancelada;
    });

    res.json(resultado);

  } catch (error) {
    responderError(res, error);
  }
});

module.exports = router;