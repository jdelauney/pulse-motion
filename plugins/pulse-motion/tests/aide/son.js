'use strict';
/* Fichier WAV de test : un son sinusoïdal stéréo de quelques secondes (aucune dépendance). */

function wavSinus({ secondes = 4, frequence = 440, taux = 44100 } = {}) {
  const echantillons = Math.round(secondes * taux);
  const donnees = Buffer.alloc(echantillons * 4);
  for (let i = 0; i < echantillons; i++) {
    const v = Math.round(Math.sin(2 * Math.PI * frequence * i / taux) * 0.3 * 32767);
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

module.exports = { wavSinus };
