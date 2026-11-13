#!/usr/bin/env node
'use strict';
/* Pulse Motion – musique de la vidéo, et bibliothèque personnelle de musiques (spec S9, 5.13).
 *
 *   node scripts/musique.js ecouter [dossier] [--ouvrir]   rend la musique seule dans sortie/musique.wav (--ouvrir : l'ouvre ensuite)
 *   node scripts/musique.js ajouter <fichier> --ambiance calme[,inspirant] --licence <licence> [--titre t] [--auteur a]
 *                           [--source s] [--attribution a]
 *        garde la musique dans ~/.pulse-motion/musiques/<id>/ ; licence : personnelle, cc0, cc-by (avec --attribution),
 *        achetee, ou autre:<texte> ; durée, tempo et sonie mesurés dans le navigateur (sans ffmpeg)
 *   node scripts/musique.js liste [--ambiance <a>]          musiques gardées (d'une ambiance)
 *   node scripts/musique.js utiliser <id> [dossier] [--remplacer]
 *        copie la musique dans assets/musique/ de la vidéo, écrit musique.fichier et musique.origine, note sa licence
 *   node scripts/musique.js retirer <id>                     la retire de la bibliothèque (les vidéos gardent leur copie)
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
  fs.writeFileSync(page, a.html, 'utf8');
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

const USAGE = [
  'Usage : pulse-motion musique ecouter [dossier] [--ouvrir]',
  '        pulse-motion musique ajouter <fichier> --ambiance calme[,inspirant] --licence personnelle|cc0|cc-by|achetee|autre:<texte> [--titre t] [--auteur a] [--source s] [--attribution a]',
  '        pulse-motion musique liste [--ambiance <a>] | utiliser <id> [dossier] [--remplacer] | retirer <id>',
].join('\n');
const AVEC_VALEUR = ['--ambiance', '--licence', '--titre', '--auteur', '--source', '--attribution'];

/** -> Promise<résultat> | null (usage incorrect) */
function executer(action, args) {
  const M = require('./lib/musiques.js');
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : undefined; };
  const libres = args.filter((a, i) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[i - 1]));
  if (action === 'ecouter') return ecouterMusique({ dossier: libres[0] || '.', ouvrir: args.includes('--ouvrir') });
  if (action === 'ajouter' && libres[0]) {
    return M.ajouterMusique({ fichier: libres[0], ambiances: valeur('--ambiance'), licence: valeur('--licence'), titre: valeur('--titre'), auteur: valeur('--auteur'),
      source: valeur('--source'), attribution: valeur('--attribution') });
  }
  if (action === 'liste') return Promise.resolve(M.listerMusiques({ ambiance: valeur('--ambiance') || null }));
  if (action === 'utiliser' && libres[0]) return Promise.resolve(M.utiliserMusique({ id: libres[0], projet: libres[1] || '.', remplacer: args.includes('--remplacer') }));
  if (action === 'retirer' && libres[0]) return Promise.resolve(M.retirerMusique({ id: libres[0] }));
  return null;
}

if (require.main === module) {
  const [action, ...args] = process.argv.slice(2);
  const r = executer(action, args);
  if (!r) {
    console.error(USAGE);
    process.exit(2);
  }
  r.then((x) => { console.log(JSON.stringify(x, null, 2)); process.exit(x.ok ? 0 : 1); },
    (e) => { console.log(JSON.stringify({ ok: false, message: e.message }, null, 2)); process.exit(1); });
}

module.exports = { ecouterMusique, executer, USAGE };
