#!/usr/bin/env node
'use strict';
/* Pulse Motion – imiter une animation ou une vidéo fournie (spec S9, 5.15) : on imite une manière, jamais une œuvre. Commandes
 * de Claude, jamais montrées à la personne ; résultats en JSON sur la sortie standard (code 1 si ok est faux).
 *
 *   node scripts/imiter.js niveau "<phrase de la personne>"     niveau de fidélité (dans l'esprit, même mouvement), refus
 *                                                              (au pixel, personnage, logo, musique) et annonce à dire
 *   node scripts/imiter.js analyser <fichier | films/<nom>[/prise-NN]> [--de <s>] [--a <s>] [--zone x,y,l,h] [--couleurs #hex,…]
 *                                   [--etape <n>] [--niveau esprit|mouvement] [--nom <nom>] [<dossier>]
 *                                                              mesure la référence : sortie/imiter/<nom>/ (planches, activité,
 *                                                              fenêtres, suivi, couleurs, main, fiche à compléter)
 *   node scripts/imiter.js comparer <nom> --scene <id> [--niveau esprit|mouvement] [<dossier>]
 *                                                              la scène contre la référence : écarts, planche côte à côte
 *   node scripts/imiter.js fiche <nom> [<dossier>]             la fiche est-elle complète (aucun « ? », une source par chiffre) ?
 *
 * Méthode : references/imiter.md. Une adresse internet est refusée (rien n'est téléchargé) ; un site se filme d'abord, avec
 * l'accord de la personne (/pulse-motion:filmer), puis sa prise s'imite. */
const { trouverNavigateur } = require('./lib/navigateur.js');
const M = require('./lib/imiter.js');
const A = require('./lib/imiter-analyse.js');

const AVEC_VALEUR = ['--de', '--a', '--zone', '--couleurs', '--etape', '--niveau', '--nom', '--scene'];

function lireArguments(args) {
  const options = {};
  const libres = [];
  for (let i = 0; i < args.length; i++) {
    if (AVEC_VALEUR.includes(args[i])) { options[args[i].slice(2)] = args[i + 1]; i++; continue; }
    if (args[i].startsWith('--')) { options[args[i].slice(2)] = true; continue; }
    libres.push(args[i]);
  }
  return { options, libres };
}

async function principal(args) {
  const [commande, ...reste] = args;
  if (commande === 'niveau') return { ok: true, ...A.niveauFidelite(reste.join(' ')) };
  const { options, libres } = lireArguments(reste);
  if (commande === 'analyser') {
    const [source, dossier = '.'] = libres;
    if (!source) return { ok: false, message: 'Usage : imiter analyser <fichier | films/<nom>> [--de s --a s] [--zone x,y,l,h] [--couleurs #hex,…] [<dossier>]' };
    return M.analyser({ projet: dossier, source, de: options.de, a: options.a, zone: options.zone, couleurs: options.couleurs,
      etape: options.etape, nom: options.nom, niveau: options.niveau || 'esprit', navigateur: trouverNavigateur() });
  }
  if (commande === 'comparer') {
    const [nom, dossier = '.'] = libres;
    return M.comparer({ projet: dossier, nom, scene: options.scene, niveau: options.niveau, navigateur: trouverNavigateur() });
  }
  if (commande === 'fiche') {
    const [nom, dossier = '.'] = libres;
    return M.verifierFicheImitation({ projet: dossier, nom });
  }
  return { ok: false, message: 'Usage : imiter niveau "<phrase>" | analyser <fichier> [options] [<dossier>] | comparer <nom> --scene <id> [<dossier>] | fiche <nom> [<dossier>]' };
}

if (require.main === module) {
  principal(process.argv.slice(2)).then((r) => {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    process.exitCode = r && r.ok === false ? 1 : 0;
  }, (e) => {
    process.stdout.write(`${JSON.stringify({ ok: false, message: e.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { principal, lireArguments };
