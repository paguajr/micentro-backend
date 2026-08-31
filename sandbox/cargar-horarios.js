const prisma = require('../lib/prisma');

const NEGOCIO_ID = 2; // Peluquería de Prueba

async function main() {
  // 1. Crear los dos recursos de prueba
  const maria = await prisma.recurso.create({
    data: { nombre: 'María', negocioId: NEGOCIO_ID },
  });
  const juan = await prisma.recurso.create({
    data: { nombre: 'Juan', negocioId: NEGOCIO_ID },
  });
  console.log('Recursos creados:', maria.id, juan.id);

  // 2. Horario del negocio: Lunes a Viernes 09:00-19:00, Sábado 09:00-13:00
  await prisma.horarioNegocio.createMany({
    data: [
      { negocioId: NEGOCIO_ID, diaSemana: 'LUNES', horaInicio: 540, horaFin: 1140 },
      { negocioId: NEGOCIO_ID, diaSemana: 'MARTES', horaInicio: 540, horaFin: 1140 },
      { negocioId: NEGOCIO_ID, diaSemana: 'MIERCOLES', horaInicio: 540, horaFin: 1140 },
      { negocioId: NEGOCIO_ID, diaSemana: 'JUEVES', horaInicio: 540, horaFin: 1140 },
      { negocioId: NEGOCIO_ID, diaSemana: 'VIERNES', horaInicio: 540, horaFin: 1140 },
      { negocioId: NEGOCIO_ID, diaSemana: 'SABADO', horaInicio: 540, horaFin: 780 },
    ],
  });

  // 3. Horario de María: igual al negocio, Lunes a Viernes 09:00-19:00
  await prisma.horarioRecurso.createMany({
    data: [
      { recursoId: maria.id, diaSemana: 'LUNES', horaInicio: 540, horaFin: 1140 },
      { recursoId: maria.id, diaSemana: 'MARTES', horaInicio: 540, horaFin: 1140 },
      { recursoId: maria.id, diaSemana: 'MIERCOLES', horaInicio: 540, horaFin: 1140 },
      { recursoId: maria.id, diaSemana: 'JUEVES', horaInicio: 540, horaFin: 1140 },
      { recursoId: maria.id, diaSemana: 'VIERNES', horaInicio: 540, horaFin: 1140 },
    ],
  });

  // 4. Horario de Juan: más acotado, Lunes a Viernes 09:00-14:00
  await prisma.horarioRecurso.createMany({
    data: [
      { recursoId: juan.id, diaSemana: 'LUNES', horaInicio: 540, horaFin: 840 },
      { recursoId: juan.id, diaSemana: 'MARTES', horaInicio: 540, horaFin: 840 },
      { recursoId: juan.id, diaSemana: 'MIERCOLES', horaInicio: 540, horaFin: 840 },
      { recursoId: juan.id, diaSemana: 'JUEVES', horaInicio: 540, horaFin: 840 },
      { recursoId: juan.id, diaSemana: 'VIERNES', horaInicio: 540, horaFin: 840 },
    ],
  });

  // 5. Pausa de almuerzo para María, Lunes a Viernes 13:00-14:00
  await prisma.pausaRecurso.createMany({
    data: [
      { recursoId: maria.id, diaSemana: 'LUNES', horaInicio: 780, horaFin: 840 },
      { recursoId: maria.id, diaSemana: 'MARTES', horaInicio: 780, horaFin: 840 },
      { recursoId: maria.id, diaSemana: 'MIERCOLES', horaInicio: 780, horaFin: 840 },
      { recursoId: maria.id, diaSemana: 'JUEVES', horaInicio: 780, horaFin: 840 },
      { recursoId: maria.id, diaSemana: 'VIERNES', horaInicio: 780, horaFin: 840 },
    ],
  });

  console.log('Horarios y pausas cargados correctamente.');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());