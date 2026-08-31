const { seSolapan } = require('../lib/disponibilidad');

// Caso 1: no se solapan (10:00-10:30 vs pausa 13:00-14:00)
console.log('Caso 1 (esperado: false):', seSolapan(600, 630, 780, 840));

// Caso 2: se solapan parcialmente (13:30-14:00 vs pausa 13:00-14:00)
console.log('Caso 2 (esperado: true):', seSolapan(810, 840, 780, 840));

// Caso 3: A contiene completamente a B
console.log('Caso 3 (esperado: true):', seSolapan(540, 1140, 780, 840));

// Caso 4: se tocan justo en el borde (A termina cuando B empieza)
console.log('Caso 4 (esperado: false):', seSolapan(600, 780, 780, 840));