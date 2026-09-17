// routes/reservas.js
//
// Acciones administrativas sobre reservas individuales del negocio.
// Todas las rutas están protegidas por verificarAdmin: la reserva se busca
// siempre filtrando por req.negocioId (viene del JWT), nunca por un id de
// negocio que mande el cliente.
//
// Reglas de negocio implementadas en este archivo:
// - PATCH /:id/estado marca una reserva como AUSENTE (cliente no se presentó).
//   Es la única transición manual soportada por ahora.
//   - Se puede marcar AUSENTE una reserva en estado VIGENTE o COMPLETADA
//     (COMPLETADA porque hoy ese estado se asigna automáticamente al pasar
//     el horario del turno — ver lib/reservas.js — así que el admin necesita
//     poder corregirla a AUSENTE después de que eso ocurra).
//   - Si la reserva ya está CANCELADA o ya está AUSENTE → 409.
//   - Antes de buscar la reserva, se corre marcarReservasVencidasComoCompletadas
//     para que el estado esté al día (una reserva que acaba de vencer debe
//     verse como COMPLETADA, no como VIGENTE, al momento de esta validación).

const express = require('express');
const prisma = require('../lib/prisma');
const verificarAdmin = require('../middleware/auth');
const { marcarReservasVencidasComoCompletadas } = require('../lib/reservas');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// Diccionario de errores conocidos (mismo patrón que routes/productos.js)
// ─────────────────────────────────────────────────────────────
const erroresConocidos = {
  RESERVA_NO_ENCONTRADA: {
    status: 404,
    mensaje: 'Reserva no encontrada.',
  },
  TRANSICION_NO_PERMITIDA: {
    status: 409,
    mensaje: 'La reserva ya está cancelada o ya está marcada como ausente.',
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
// PATCH /api/admin/reservas/:id/estado — marcar reserva como AUSENTE
// Body: { estado: 'AUSENTE' } — por ahora es el único valor aceptado.
// Transición permitida: VIGENTE → AUSENTE, COMPLETADA → AUSENTE.
// Si ya está CANCELADA o AUSENTE → 409.
// ─────────────────────────────────────────────────────────────
router.patch('/:id/estado', verificarAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;

    if (estado !== 'AUSENTE') {
      return res
        .status(400)
        .json({ error: "El único valor aceptado para 'estado' es 'AUSENTE'." });
    }

    // Corrige el estado de reservas vencidas antes de validar la transición,
    // para que una reserva recién vencida se trate como COMPLETADA y no VIGENTE.
    await marcarReservasVencidasComoCompletadas(req.negocioId);

    const actualizada = await prisma.$transaction(async (tx) => {
      const reserva = await tx.reserva.findFirst({
        where: { id, negocioId: req.negocioId },
      });

      if (!reserva) {
        throw new Error('RESERVA_NO_ENCONTRADA');
      }

      if (reserva.estado === 'CANCELADA' || reserva.estado === 'AUSENTE') {
        throw new Error('TRANSICION_NO_PERMITIDA');
      }

      return tx.reserva.update({
        where: { id },
        data: { estado: 'AUSENTE' },
      });
    });

    return res.json(actualizada);
  } catch (error) {
    return responderError(res, error);
  }
});

module.exports = router;