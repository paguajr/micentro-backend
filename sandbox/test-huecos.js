const { calcularHuecosLibres } = require('../lib/disponibilidad');

// Caso 1: sin bloqueos, todo el día libre
console.log('Caso 1:', calcularHuecosLibres({ inicio: 540, fin: 840 }, []));
// Esperado: [{ inicio: 540, fin: 840 }]

// Caso 2: un solo bloqueo (Juan con una reserva 10:00-10:30)
console.log('Caso 2:', calcularHuecosLibres({ inicio: 540, fin: 840 }, [
  { inicio: 600, fin: 630 },
]));
// Esperado: [{ inicio: 540, fin: 600 }, { inicio: 630, fin: 840 }]

// Caso 3: dos bloqueos (el ejemplo que acabamos de ver)
console.log('Caso 3:', calcularHuecosLibres({ inicio: 540, fin: 840 }, [
  { inicio: 600, fin: 630 },
  { inicio: 720, fin: 750 },
]));
// Esperado: [{540,600}, {630,720}, {750,840}]

// Caso 4: un bloqueo que ocupa el día completo
console.log('Caso 4:', calcularHuecosLibres({ inicio: 540, fin: 840 }, [
  { inicio: 540, fin: 840 },
]));
// Esperado: [] (ningún hueco libre)

// Caso 5: bloqueo que empieza antes del horario laboral (caso raro pero posible)
console.log('Caso 5:', calcularHuecosLibres({ inicio: 540, fin: 840 }, [
  { inicio: 500, fin: 600 },
]));
// Esperado: [{ inicio: 600, fin: 840 }] (no debería haber hueco negativo antes)