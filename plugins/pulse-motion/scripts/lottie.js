#!/usr/bin/env node
'use strict';
/* Pulse Motion – animations Lottie fournies par la personne (spec S9, 5.11). Le plugin n'en livre aucune.
 *
 *   node scripts/lottie.js importer <fichier.json|.lottie> [--nom fusee] [--source "<d'où il vient>"] [--licence "<licence>"]
 *                          [--auteur "<auteur>"] [<dossier>]
 *        copie dans assets/lottie/<nom>.json (une archive .lottie est ouverte sans dépendance, ses images embarquées),
 *        source et licence dans assets/lottie/<nom>.licence.json et dans les crédits ; rapport : durée, cadence, taille,
 *        couleurs trouvées, avertissements, exemple de balise.
 *   node scripts/lottie.js analyser <fichier> [<dossier>]   le même rapport, sans rien copier
 *
 * Dans une scène : <div data-lottie="assets/lottie/fusee.json" data-start="0.5"></div> (references/lottie.md).
 * Résumé JSON ; code 1 en cas d'échec.
 */
const path = require('node:path');
const Lo = require('./lib/lottie.js');
const L = require('../moteur/lottie.js');

const USAGE = 'Usage : pulse-motion lottie importer <fichier.json|.lottie> [--nom fusee] [--source "<source>"] [--licence "<licence>"] [--auteur "<auteur>"] [<dossier>] | analyser <fichier> [<dossier>]';

function principal(args) {
  const AVEC_VALEUR = ['--nom', '--source', '--licence', '--auteur'];
  const valeur = (o) => { const k = args.indexOf(o); return k >= 0 ? args[k + 1] : undefined; };
  const libres = args.filter((a, k) => !a.startsWith('--') && !AVEC_VALEUR.includes(args[k - 1]));
  const [commande, fichier, dossier = '.'] = libres;
  if (commande === 'importer' && fichier) {
    return Lo.importer({ projet: path.resolve(dossier), fichier, nom: valeur('--nom'), source: valeur('--source'), licence: valeur('--licence'), auteur: valeur('--auteur') });
  }
  if (commande === 'analyser' && fichier) {
    const lu = Lo.lireLottie(path.resolve(dossier, fichier));
    if (!lu.ok) return lu;
    const a = L.analyserLottie(lu.anim);
    return { ok: true, duree: a.duree, ips: a.ips, images: a.images, largeur: a.largeur, hauteur: a.hauteur, couleurs: a.couleurs.slice(0, 8),
      poidsKo: Math.round(lu.octets.length / 1024), avertissements: Lo.avertissements(a, lu.octets.length) };
  }
  return { ok: false, message: USAGE };
}

if (require.main === module) {
  const r = principal(process.argv.slice(2));
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.ok ? 0 : 1;
}

module.exports = { principal };
