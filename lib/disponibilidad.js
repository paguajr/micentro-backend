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

module.exports = { seSolapan, calcularHuecosLibres, generarCandidatos };