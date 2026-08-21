require('dotenv/config');
const { PrismaClient } = require('../generated/prisma/client.ts');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const nuevoNegocio = await prisma.negocio.create({
    data: {
      slug: 'peluqueria-prueba',
      nombre: 'Peluquería de Prueba',
    },
  });
  console.log('Negocio creado:', nuevoNegocio);

  const todosLosNegocios = await prisma.negocio.findMany();
  console.log('Todos los negocios:', todosLosNegocios);
}

main()
  .catch((error) => console.error('Error:', error))
  .finally(async () => {
    await prisma.$disconnect();
  });