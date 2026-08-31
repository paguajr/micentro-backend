const { generarCandidatos } = require('../lib/disponibilidad');

// Caso 1: el ejemplo que acabamos de ver
console.log('Caso 1:', generarCandidatos({ inicio: 630, fin: 840 }, 45));
// Esperado: [630, 675, 720, 765, 810]

// Caso 2: servicio que entra justo exacto una sola vez
console.log('Caso 2:', generarCandidatos({ inicio: 540, fin: 600 }, 60));
// Esperado: [540]  (540+60=600, justo entra)

// Caso 3: servicio más largo que el hueco completo
console.log('Caso 3:', generarCandidatos({ inicio: 540, fin: 570 }, 60));
// Esperado: []  (no entra ni una vez)

// Caso 4: hueco vacío (inicio == fin)
console.log('Caso 4:', generarCandidatos({ inicio: 600, fin: 600 }, 30));
// Esperado: []

// Caso 5: servicio de 30 min en un hueco de 90 min
console.log('Caso 5:', generarCandidatos({ inicio: 540, fin: 630 }, 30));
// Esperado: [540, 570, 600]