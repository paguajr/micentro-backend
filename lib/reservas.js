// lib/reservas.js
//
// Lógica compartida sobre el ciclo de vida de una Reserva, más allá del
// algoritmo de disponibilidad (que vive en lib/disponibilidad.js).
//
// No existe ningún proceso (cron/scheduler) que marque reservas como
// COMPLETADA automáticamente. En su lugar, se usa un enfoque "lazy":
// marcarReservasVencidasComoCompletadas() se llama al principio de
// cualquier endpoint que lea o escriba sobre el estado de las reservas
// (estadísticas, PATCH /reservas/:id/estado), y corrige en ese momento
// cualquier reserva VIGENTE cuyo horario ya terminó. Así el estado
// siempre queda consistente antes de usarse, sin ventanas de espera ni
// infraestructura de scheduler nueva.

const prisma = require('./prisma');

// Marca como COMPLETADA toda reserva VIGENTE de un negocio cuyo horario
// (fecha + duración del servicio) ya haya terminado al momento de llamarse.
//
// `cliente` permite pasar un `tx` de una transacción de Prisma (mismo
// patrón que obtenerDisponibilidadRecurso en lib/disponibilidad.js);
// por defecto usa el cliente normal.
async function marcarReservasVencidasComoCompletadas(negocioId, cliente = prisma) {
  const ahora = new Date();

  // No se puede comparar "fecha + duracionMin" directamente en el `where`
  // de Prisma porque duracionMin vive en otra tabla (Servicio). Por eso
  // se traen las VIGENTE y se filtra en JS cuáles ya vencieron.
  const vigentes = await cliente.reserva.findMany({
    where: { negocioId, estado: 'VIGENTE' },
    include: { servicio: { select: { duracionMin: true } } },
  });

  const idsVencidas = vigentes
    .filter((reserva) => {
      const finReserva = new Date(
        reserva.fecha.getTime() + reserva.servicio.duracionMin * 60000
      );
      return finReserva < ahora;
    })
    .map((reserva) => reserva.id);

  if (idsVencidas.length > 0) {
    await cliente.reserva.updateMany({
      where: { id: { in: idsVencidas } },
      data: { estado: 'COMPLETADA' },
    });
  }

  return idsVencidas.length;
}

module.exports = { marcarReservasVencidasComoCompletadas };