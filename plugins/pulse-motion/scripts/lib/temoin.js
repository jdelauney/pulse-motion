'use strict';
/* Pulse Motion – contenu témoin des styles (spec Styles et réalisation, 5.6) : le même petit film, « la chaîne du froid »
 * (references/styles/temoin.json), montre chaque style, livré ou personnel, par deux images de composition fixe et par la
 * boucle de ses neuf scènes toutes faites.
 *   A : scène « titre » à 80 % de sa durée ; B : scène « chiffre » à 80 %, compteur arrivé à 1 250.
 * Les images sont prises par la capture fidèle du plugin (planche des instants), jamais dessinées à part. Sert à
 * « pulse-motion style planche --temoin | --avec-base », à « pulse-motion styles choisir » et à la galerie du wiki.
 *
 * Idée de l'histoire témoin unique : take-one (assets/previews-src/BOAT-BRIEF.md, MIT), voir THIRD-PARTY-NOTICES.md. */
const fs = require('node:fs');
const path = require('node:path');
const { projetEssai, TEMOIN } = require('./projet-essai.js');
const { calculerMinutage } = require('../../moteur/minutage.js');

const IMAGES = Object.keys(TEMOIN.images);

/** Instants (s) des images témoin dans le déroulé donné : { A: t, B: t }. */
function instantsTemoin(deroule) {
  const min = calculerMinutage(deroule.scenes, {});
  const instants = {};
  for (const [cle, image] of Object.entries(TEMOIN.images)) {
    const s = min.scenes.find((x) => x.id === image.scene);
    if (!s) throw new Error(`scène « ${image.scene} » absente du témoin`);
    instants[cle] = s.debut + (s.fin - s.debut) * image.part;
  }
  return instants;
}

/** Projet des images témoin : les scènes de A et de B, aux durées du catalogue, textes d'exemple, compteur à 1 250. */
function projetTemoin({ dossierStyle, ratio = '16:9', ton }) {
  const types = [...new Set(Object.values(TEMOIN.images).map((i) => i.scene))];
  return projetEssai({ dossierStyle, ratio, ton, types, textes: 'exemple', valeurChiffre: TEMOIN.images.B.valeur });
}

/** Projet de la boucle témoin : les neuf scènes, 2,5 s chacune, mêmes textes. */
function projetBoucle({ dossierStyle, ratio = '16:9', ton }) {
  return projetEssai({ dossierStyle, ratio, ton, textes: 'exemple', valeurChiffre: TEMOIN.images.B.valeur, dureeScene: TEMOIN.boucle.dureeScene });
}

/**
 * Rend les images A et B d'un style dans `sortie` (temoin-a.png, temoin-b.png, précédés de `prefixe`).
 * -> Promise<{ ok, images: { A, B }, message? }> ; le projet temporaire est toujours supprimé.
 * plancheInstants : injectable (tests) ; par défaut celle du plugin (capture fidèle, 960 px de large).
 */
async function imagesTemoin({ dossierStyle, sortie, prefixe = '', ratio = '16:9', ton, navigateur, plancheInstants }) {
  const planche = plancheInstants || require('../planche-retouche.js').plancheInstants;
  const projet = projetTemoin({ dossierStyle, ratio, ton });
  try {
    const instants = instantsTemoin(JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8')));
    const r = await planche({ dossier: projet, instants: IMAGES.map((k) => instants[k]), ...(navigateur !== undefined ? { navigateur } : {}) });
    if (!r.ok) return { ok: false, message: r.message };
    fs.mkdirSync(sortie, { recursive: true });
    const images = {};
    IMAGES.forEach((k, i) => {
      images[k] = path.join(sortie, `${prefixe}temoin-${k.toLowerCase()}.png`);
      fs.copyFileSync(path.join(projet, r.images[i].fichier), images[k]);
    });
    return { ok: true, images };
  } finally {
    fs.rmSync(projet, { recursive: true, force: true, maxRetries: 3 });
  }
}

module.exports = { TEMOIN, IMAGES, instantsTemoin, projetTemoin, projetBoucle, imagesTemoin };
