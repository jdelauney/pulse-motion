'use strict';
/* Signaux de test du son réactif (P7) : clics réguliers, notes, syllabes, WAV mono (aucune dépendance). */

/** Clics : salve de 10 ms (sinus de 1 kHz amorti) à chaque instant. */
function clics({ duree, taux = 48000, instants, frequence = 1000, longueur = 0.01, amplitude = 0.8 }) {
  const x = new Float32Array(Math.round(duree * taux));
  const n = Math.round(longueur * taux);
  for (const t0 of instants) {
    const d = Math.round(t0 * taux);
    for (let i = 0; i < n && d + i < x.length; i++) x[d + i] += amplitude * Math.exp(-i / (n / 4)) * Math.sin(2 * Math.PI * frequence * i / taux);
  }
  return x;
}

/** Notes tenues : plages [{ debut, fin, frequence }]. */
function notes({ taux = 48000, plages, amplitude = 0.5 }) {
  const duree = Math.max(...plages.map((p) => p.fin));
  const x = new Float32Array(Math.round(duree * taux));
  for (const p of plages) {
    for (let i = Math.round(p.debut * taux); i < Math.round(p.fin * taux); i++) x[i] += amplitude * Math.sin(2 * Math.PI * p.frequence * i / taux);
  }
  return x;
}

/** Syllabes : bosses en cosinus surélevé (demi-largeur « largeur ») d'un sinus de 1 kHz, centrées sur chaque instant. */
function syllabes({ duree, taux = 48000, instants, frequence = 1000, largeur = 0.08, amplitude = 0.6 }) {
  const x = new Float32Array(Math.round(duree * taux));
  for (const t0 of instants) {
    for (let i = Math.max(0, Math.round((t0 - largeur) * taux)); i < Math.min(x.length, Math.round((t0 + largeur) * taux)); i++) {
      const u = (i / taux - t0) / largeur;
      x[i] += amplitude * 0.5 * (1 + Math.cos(Math.PI * u)) * Math.sin(2 * Math.PI * frequence * i / taux);
    }
  }
  return x;
}

/** WAV 16 bits stéréo (deux canaux identiques) d'échantillons mono. */
function wavMono(echantillons, taux = 48000) {
  const donnees = Buffer.alloc(echantillons.length * 4);
  for (let i = 0; i < echantillons.length; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(echantillons[i] * 32767)));
    donnees.writeInt16LE(v, i * 4);
    donnees.writeInt16LE(v, i * 4 + 2);
  }
  const entete = Buffer.alloc(44);
  entete.write('RIFF', 0);
  entete.writeUInt32LE(36 + donnees.length, 4);
  entete.write('WAVE', 8);
  entete.write('fmt ', 12);
  entete.writeUInt32LE(16, 16);
  entete.writeUInt16LE(1, 20);
  entete.writeUInt16LE(2, 22);
  entete.writeUInt32LE(taux, 24);
  entete.writeUInt32LE(taux * 4, 28);
  entete.writeUInt16LE(4, 32);
  entete.writeUInt16LE(16, 34);
  entete.write('data', 36);
  entete.writeUInt32LE(donnees.length, 40);
  return Buffer.concat([entete, donnees]);
}

module.exports = { clics, notes, syllabes, wavMono };
