require('dotenv/config');
const prisma = require('../lib/prisma');
const { normalizarTelefono } = require('../lib/telefono');

async function migrarTelefonos() {
  const clientes = await prisma.cliente.findMany();

  console.log(`Encontrados ${clientes.length} clientes.\n`);

  let actualizados = 0;
  let yaOk = 0;
  let noReconocidos = 0;

  for (const cliente of clientes) {
    const normalizado = normalizarTelefono(cliente.telefono);

    if (!normalizado) {
      console.log(`⚠️  Cliente ${cliente.id} (${cliente.nombre}): teléfono "${cliente.telefono}" no reconocido, revisar a mano.`);
      noReconocidos++;
      continue;
    }

    if (normalizado === cliente.telefono) {
      yaOk++;
      continue;
    }

    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { telefono: normalizado },
    });

    console.log(`✅ Cliente ${cliente.id} (${cliente.nombre}): "${cliente.telefono}" → "${normalizado}"`);
    actualizados++;
  }

  console.log(`\nResumen: ${actualizados} actualizados, ${yaOk} ya estaban ok, ${noReconocidos} no reconocidos.`);
}

migrarTelefonos()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });