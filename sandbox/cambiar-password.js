require('dotenv/config');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');

async function main() {
  const emailAdmin = 'admin@prueba.com'; // cambiá esto por el email del admin que quieras actualizar
  const passwordNuevo = 'nuevoPassword123'; // cambiá esto por el password nuevo

  const hash = await bcrypt.hash(passwordNuevo, 10);

  const admin = await prisma.admin.update({
    where: { email: emailAdmin },
    data: { password: hash },
  });

  console.log('Password actualizado para:', admin.email);
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    prisma.$disconnect();
  });