#!/usr/bin/env node
'use strict';
/* Pulse Motion – musique de la vidéo.
 *
 *   node scripts/musique.js ecouter [dossier] [--ouvrir]   rend la musique seule dans sortie/musique.wav (--ouvrir : l'ouvre ensuite)
 *
 * La musique générée est fabriquée par le synthétiseur de la page : elle se rend dans Chrome ou Edge sans fenêtre.
 * Résumé JSON ; code 1 en cas d'échec.
 */
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('./assembler.js');
const { lireDeroule } = require('./lib/deroule.js');
const { trouverNavigateur } = require('./lib/navigateur.js');
const { ouvrirCapture } = require('./lib/capture-fidele.js');

/** -> { ok, fichier?, duree?, message? } */
async function ecouterMusique({ dossier, navigateur = trouverNavigateur(), dossierStyles, ouvrir = false, ouvrirFichier }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  if (!deroule.musique) return { ok: false, message: 'La vidéo n\'a pas de musique : en choisir une (« musique » dans le déroulé).' };
  if (!navigateur) return { ok: false, message: 'Chrome ou Edge introuvable : la musique se fabrique dans le navigateur.' };
  const a = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!a.ok) return { ok: false, message: `La page ne s'assemble pas : ${a.erreurs.map((e) => e.message).join(' ')}` };
  const sortie = path.join(projet, 'sortie');
  fs.mkdirSync(sortie, { recursive: true });
  const page = path.join(sortie, '.musique.html');
  fs.writeFileSync(page, a.html);
  let capture;
  try {
    capture = await ouvrirCapture({ fichierHtml: page, largeur: 640, hauteur: 360, navigateur });
    const son = await capture.rendreSon({ seulement: 'musique' });
    if (!son.wav) return { ok: false, message: `La musique n'a pas pu être fabriquée${son.avertissements.length ? ` (${son.avertissements.join(' ')})` : ''}.` };
    fs.writeFileSync(path.join(sortie, 'musique.wav'), son.wav);
    // --ouvrir : le fichier s'ouvre dans le lecteur de l'ordinateur (la personne l'écoute sans le chercher).
    if (ouvrir) (ouvrirFichier || require('./apercu.js').ouvrirNavigateur)(path.join(sortie, 'musique.wav'));
    return { ok: true, fichier: 'sortie/musique.wav', duree: Math.round(capture.duree * 100) / 100 };
  } finally {
    if (capture) await capture.fermer();
    fs.rmSync(page, { force: true });
  }
}

if (require.main === module) {
  const [action, ...args] = process.argv.slice(2);
  const dossier = args.find((a) => !a.startsWith('--')) || '.';
  if (action !== 'ecouter') {
    console.error('Usage : pulse-motion musique ecouter [dossier] [--ouvrir]');
    process.exit(2);
  }
  ecouterMusique({ dossier, ouvrir: args.includes('--ouvrir') }).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); },
    (e) => { console.log(JSON.stringify({ ok: false, message: e.message }, null, 2)); process.exit(1); });
}

module.exports = { ecouterMusique };
