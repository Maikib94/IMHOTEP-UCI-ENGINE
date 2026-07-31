// tests/helpers/seededRandom.ts
//
// C1.7 commit 3, paso 3A — PRNG determinista para controlar el experimento
// de biseccion de dt. CardiovascularEngine usa Math.random() sin semilla
// (ruido de FC) y otros motores pueden usar generadores gaussianos
// derivados de el; sin fijar la fuente de aleatoriedad, dos corridas del
// mismo escenario difieren tambien por azar, no solo por dt — la
// biseccion no significaria nada.
//
// mulberry32: PRNG de 32 bits, rapido, buena distribucion para tests
// (no criptografico). Implementado a mano, sin dependencia nueva.
// Ref: https://gist.github.com/tommyettinger/46a874533244883189143505d203312

export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let originalRandom: (() => number) | null = null;

/** Sustituye Math.random globalmente por mulberry32(seed). Determinista:
 *  la misma semilla produce la misma secuencia siempre. */
export function installSeededRandom(seed: number): void {
  if (originalRandom !== null) {
    throw new Error('installSeededRandom: ya hay un RNG instalado — llamar restoreRandom() primero');
  }
  originalRandom = Math.random;
  Math.random = mulberry32(seed);
}

/** Restaura Math.random original. Idempotente si no hay nada instalado. */
export function restoreRandom(): void {
  if (originalRandom !== null) {
    Math.random = originalRandom;
    originalRandom = null;
  }
}
