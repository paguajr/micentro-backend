const { normalizarTelefono } = require('../lib/telefono');

const casos = [
  ['099123456', '+59899123456', 'nacional simple'],
  ['099 123 456', '+59899123456', 'nacional con espacios'],
  ['099-123-456', '+59899123456', 'nacional con guiones'],
  ['+59899123456', '+59899123456', 'internacional ya normalizado'],
  ['+598 99 123 456', '+59899123456', 'internacional con espacios'],
  ['099123', null, 'nacional demasiado corto'],
  ['0991234567', null, 'nacional demasiado largo'],
  ['+5989912345', null, 'internacional demasiado corto'],
  ['088123456', null, 'no empieza con 09'],
  ['+598089123456', null, 'internacional con el 0 (no debe aceptarse)'],
  ['abc123456', null, 'contiene letras'],
  ['', null, 'string vacío'],
  [null, null, 'input null'],
  [undefined, null, 'input undefined'],
];

let pasaron = 0;
let fallaron = 0;

for (const [input, esperado, descripcion] of casos) {
  const resultado = normalizarTelefono(input);
  const ok = resultado === esperado;

  console.log(
    `${ok ? '✅' : '❌'} ${descripcion} | input: ${JSON.stringify(input)} → resultado: ${JSON.stringify(resultado)} (esperado: ${JSON.stringify(esperado)})`
  );

  if (ok) pasaron++;
  else fallaron++;
}

console.log(`\n${pasaron} pasaron, ${fallaron} fallaron`);