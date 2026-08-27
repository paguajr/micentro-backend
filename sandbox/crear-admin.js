require('dotenv/config');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');

async function main() {
  const passwordPlano = 'test1234'; // cambiá esto por un password real
  const hash = await bcrypt.hash(passwordPlano, 10);

  const negocio = await prisma.negocio.create({
    data: {
      nombre: 'Peluquería de Prueba',
      slug: 'peluqueria-prueba',
    },
  });

  const admin = await prisma.admin.create({
    data: {
      email: 'admin@prueba.com',
      password: hash,
      negocioId: negocio.id,
    },
  });

  console.log('Negocio creado:', negocio);
  console.log('Admin creado:', admin);
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    prisma.$disconnect();
  });