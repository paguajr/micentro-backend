const prisma = require('./prisma');

const DIAS_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

function seSolapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && finA > inicioB;
}

function calcularHuecosLibres(horario, bloqueos) {
  const huecos = [];
  let cursor = horario.inicio;

  for (const bloqueo of bloqueos) {
    if (cursor < bloqueo.inicio) {
      huecos.push({ inicio: cursor, fin: bloqueo.inicio });
    }
    cursor = Math.max(cursor, bloqueo.fin);
  }

  if (cursor < horario.fin) {
    huecos.push({ inicio: cursor, fin: horario.fin });
  }

  return huecos;
}

function generarCandidatos(hueco, duracionServicio) {
  const candidatos = [];
  let inicio = hueco.inicio;

  while (inicio + duracionServicio <= hueco.fin) {
    candidatos.push(inicio);
    inicio += duracionServicio;
  }

  return candidatos;
}

function horaAMinutos(fecha) {
  return fecha.getHours() * 60 + fecha.getMinutes();
}

async function obtenerDisponibilidadRecurso(recursoId, fecha, duracionServicio, cliente = prisma) {
  const diaSemana = DIAS_SEMANA[fecha.getDay()];

  const horario = await cliente.horarioRecurso.findFirst({
    where: { recursoId, diaSemana },
  });

  if (!horario) {
    return [];
  }

  const pausas = await cliente.pausaRecurso.findMany({
    where: { recursoId, diaSemana },
  });

  const inicioDia = new Date(fecha);
  inicioDia.setHours(0, 0, 0, 0);
  const finDia = new Date(fecha);
  finDia.setHours(23, 59, 59, 999);

  const reservas = await cliente.reserva.findMany({
    where: {
      recursoId,
      estado: 'VIGENTE',
      fecha: { gte: inicioDia, lte: finDia },
    },
    include: { servicio: true },
  });

  const bloqueosPausas = pausas.map(p => ({ inicio: p.horaInicio, fin: p.horaFin }));
  const bloqueosReservas = reservas.map(r => {
    const inicio = horaAMinutos(r.fecha);
    return { inicio, fin: inicio + r.servicio.duracionMin };
  });

  const bloqueos = [...bloqueosPausas, ...bloqueosReservas]
    .sort((a, b) => a.inicio - b.inicio);

  const huecos = calcularHuecosLibres(
    { inicio: horario.horaInicio, fin: horario.horaFin },
    bloqueos
  );

  let candidatos = [];
  for (const hueco of huecos) {
    candidatos = candidatos.concat(generarCandidatos(hueco, duracionServicio));
  }

  return candidatos;
}

async function obtenerDisponibilidadNegocio(negocioId, fecha, servicioId) {
  const servicio = await prisma.servicio.findFirst({
    where: { id: servicioId, negocioId },
  });

  if (!servicio) {
    throw new Error('Servicio no encontrado para este negocio');
  }

  const recursos = await prisma.recurso.findMany({
    where: { negocioId, disponible: true },
  });

  const porHorario = {};

  for (const recurso of recursos) {
    const candidatos = await obtenerDisponibilidadRecurso(recurso.id, fecha, servicio.duracionMin);

    for (const horario of candidatos) {
      if (!porHorario[horario]) {
        porHorario[horario] = [];
      }
      porHorario[horario].push(recurso.nombre);
    }
  }

  return porHorario;
}

module.exports = { seSolapan, calcularHuecosLibres, generarCandidatos, obtenerDisponibilidadRecurso, obtenerDisponibilidadNegocio, horaAMinutos, DIAS_SEMANA };