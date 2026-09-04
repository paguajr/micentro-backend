/**
 * Normaliza un teléfono uruguayo a formato E.164 (+598XXXXXXXX).
 *
 * Acepta:
 *   - Formato nacional: 09X XXX XXX (con o sin espacios/guiones)
 *   - Formato internacional ya en E.164: +598 9X XXX XXX
 *
 * Devuelve el string normalizado (ej. "+59899123456") si es válido,
 * o null si el formato no es reconocido.
 */
function normalizarTelefono(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // 1. Limpiar: sacar todo lo que no sea dígito o "+"
  const limpio = input.replace(/[^\d+]/g, '');

  // 2. Ya viene en formato internacional (+598 9XXXXXXX)
  if (/^\+5989\d{7}$/.test(limpio)) {
    return limpio;
  }

  // 3. Viene en formato nacional (09XXXXXXX)
  if (/^09\d{7}$/.test(limpio)) {
    return '+598' + limpio.slice(1); // saca el "0" inicial, antepone "+598"
  }

  // 4. Formato no reconocido
  return null;
}

module.exports = { normalizarTelefono };