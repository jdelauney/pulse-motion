'use strict';
/* Film figé écrit à la main (spec S6, 5.7) : des images d'une seule couleur, pour lire dans la page quelle image l'horloge
 * montre à chaque instant. Les étapes : 1 clic (avant rouge, survol vert, réaction bleue puis jaune, après magenta),
 * 2 aller (fondu vers cyan), 3 clic (réaction grise, après blanc). */
const fs = require('node:fs');
const path = require('node:path');
const { encoder } = require('../../scripts/lib/png.js');

const COULEURS = {
  '0001.png': [220, 30, 30], '0002.png': [30, 180, 60], 'r01-0001.png': [30, 60, 220], 'r01-0002.png': [230, 210, 30],
  '0003.png': [200, 40, 200], '0004.png': [40, 200, 210], 'r03-0001.png': [128, 128, 128], '0005.png': [250, 250, 250],
};

function image(rgb, largeur, hauteur) {
  const donnees = Buffer.alloc(largeur * hauteur * 3);
  for (let i = 0; i < largeur * hauteur; i++) { donnees[i * 3] = rgb[0]; donnees[i * 3 + 1] = rgb[1]; donnees[i * 3 + 2] = rgb[2]; }
  return encoder({ largeur, hauteur, canaux: 3, donnees });
}

function filmSynthetique({ largeur = 640, hauteur = 400 } = {}) {
  const e = (n, faire, extra) => ({ n, faire, dit: '', url: 'appli-essai/factures.html', flous: { auto: 0, cible: 0, apres: 0 }, alertes: [], coupes: [], ...extra });
  return {
    version: 1, source: 'tournage', date: '2026-11-10T10:00:00.000Z', navigateur: 'Essai', appareil: 'ordinateur', largeur, hauteur, echelle: 1, cadence: 30,
    bords: ['#102030', '#a0b0c0'],
    etapes: [
      e(1, 'cliquer', { cible: { libelle: 'Bouton', boite: [400, 250, 120, 50] }, point: [409.6, 289], avant: '0001.png', survol: '0002.png', reaction: [[0, 'r01-0001.png'], [500, 'r01-0002.png']], apres: '0003.png' }),
      e(2, 'aller', { cible: null, point: null, avant: '0003.png', reaction: [], apres: '0004.png' }),
      e(3, 'cliquer', { cible: { libelle: 'Total', boite: [60, 60, 200, 60] }, point: [76, 106.8], avant: '0004.png', survol: '0004.png', reaction: [[0, 'r03-0001.png']], apres: '0005.png' }),
    ],
    alertes: [],
  };
}

/** Écrit films/<nom>/ dans le projet : parcours (prise choisie ou non), prise-01 (film.json et images). */
function ecrireFilm(dir, { nom = 'essai', choisie = true, film = filmSynthetique() } = {}) {
  const racine = path.join(dir, 'films', nom);
  fs.mkdirSync(path.join(racine, 'prise-01', 'images'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'parcours.json'), JSON.stringify({ nom, depart: 'appli-essai/factures.html', etapes: [{ faire: 'cliquer', cible: 'Bouton' }], ...(choisie ? { prise: 'prise-01' } : {}) }, null, 2));
  fs.writeFileSync(path.join(racine, 'prise-01', 'film.json'), JSON.stringify(film, null, 2));
  for (const [n, rgb] of Object.entries(COULEURS)) fs.writeFileSync(path.join(racine, 'prise-01', 'images', n), image(rgb, film.largeur, film.hauteur));
  return racine;
}

module.exports = { filmSynthetique, ecrireFilm, COULEURS };
