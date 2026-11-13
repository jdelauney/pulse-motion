'use strict';
/* Musique d'essai (spec S9, 5.13) : un WAV fabriqué ici, sans aucun fichier téléchargé. Une note tenue douce, et une frappe
 * (bruit bref qui décroît, tiré d'une graine fixe) sur chaque temps, au tempo demandé : le tempo et la durée sont connus. */
const W = require('../../moteur/wav.js');

/** -> Buffer (WAV PCM 16 bits stéréo, 44,1 kHz) de duree secondes à tempo battements par minute. */
function musiqueEssai({ duree = 12, tempo = 120, taux = 44100 } = {}) {
  const n = Math.round(duree * taux);
  const gauche = new Float32Array(n);
  const droite = new Float32Array(n);
  let graine = 12345;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648 - 0.5; };
  const periode = (60 / tempo) * taux;
  const frappe = Math.round(0.04 * taux);
  for (let i = 0; i < n; i++) {
    const note = 0.08 * Math.sin((2 * Math.PI * 220 * i) / taux);
    const depuis = i % periode;
    const coup = depuis < frappe ? 0.8 * hasard() * Math.exp(-depuis / (0.008 * taux)) : 0;
    gauche[i] = note + coup;
    droite[i] = note + coup;
  }
  return Buffer.from(W.ecrire({ taux, canaux: [gauche, droite] }));
}

module.exports = { musiqueEssai };
