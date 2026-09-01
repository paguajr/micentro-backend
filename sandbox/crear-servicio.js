const prisma = require('../lib/prisma');

async function main() {
  const servicio = await prisma.servicio.create({
    data: {
      nombre: 'Corte de pelo',
      duracionMin: 45,
      precio: 1500,
      negocioId: 2,
    },
  });

  console.log('Servicio creado:', servicio);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());