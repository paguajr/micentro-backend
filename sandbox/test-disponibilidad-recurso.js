const { obtenerDisponibilidadRecurso } = require('../lib/disponibilidad');

async function main() {
  // Probamos con Juan (id: 2), un martes, servicio de 45 minutos
  const fecha = new Date('2026-09-01'); // martes 1 de septiembre 2026
  const duracionServicio = 45;

  const disponibilidadJuan = await obtenerDisponibilidadRecurso(2, fecha, duracionServicio);
  console.log('Disponibilidad de Juan (martes, servicio 45 min):', disponibilidadJuan);

  const disponibilidadMaria = await obtenerDisponibilidadRecurso(1, fecha, duracionServicio);
  console.log('Disponibilidad de María (martes, servicio 45 min):', disponibilidadMaria);
}

main().catch(console.error);