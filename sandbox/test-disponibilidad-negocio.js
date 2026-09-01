const { obtenerDisponibilidadNegocio } = require('../lib/disponibilidad');
const prisma = require('../lib/prisma');

async function main() {
  const fecha = new Date('2026-09-01'); // martes
  const negocioId = 2;
  const servicioId = 1;

  const disponibilidad = await obtenerDisponibilidadNegocio(negocioId, fecha, servicioId);
  console.log('Disponibilidad del negocio (martes, Corte de pelo 45 min):');
  console.log(disponibilidad);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());