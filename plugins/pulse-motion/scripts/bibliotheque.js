#!/usr/bin/env node
'use strict';
/* Pulse Motion – bibliothèque personnelle (chantier H) : effets gardés, et toute la bibliothèque emportée sur un autre
 * ordinateur.
 *
 *   node scripts/bibliotheque.js liste                       chartes, styles, effets, personnages, musiques et goûts gardés
 *   node scripts/bibliotheque.js exporter [<fichier.zip>] [--chartes a,b|tout] [--styles …] [--effets …] [--personnages …]
 *                                [--musiques …] [--gouts] [--remplacer]     archive ZIP (sans choix : tout ; par défaut dans Documents)
 *   node scripts/bibliotheque.js importer <fichier.zip> [--voir] [--remplacer tout|<sorte>:<nom>,…]
 *                                                            un nom déjà pris n'est jamais écrasé sans --remplacer
 *   node scripts/bibliotheque.js effet liste [--dossier <d>]                       effets : vidéo, bibliothèque, plugin
 *   node scripts/bibliotheque.js effet enregistrer <nom> [<dossier>] [--sous <autre>] [--remplacer]
 *   node scripts/bibliotheque.js effet utiliser <nom> [<dossier>] [--remplacer]   copie dans la vidéo
 *
 * Résumé JSON ; code 1 avec { ok: false, message } en cas de refus, 2 pour un usage incorrect.
 */
const path = require('node:path');
const B = require('./lib/bibliotheque.js');

const USAGE = [
  'Usage : pulse-motion bibliotheque liste',
  '        pulse-motion bibliotheque exporter [<fichier.zip>] [--chartes a,b|tout] [--styles …] [--effets …] [--personnages …] [--musiques …] [--gouts] [--remplacer]',
  '        pulse-motion bibliotheque importer <fichier.zip> [--voir] [--remplacer tout|<sorte>:<nom>,…]',
  '        pulse-motion effet liste [--dossier <d>] | enregistrer <nom> [<dossier>] [--sous <autre>] [--remplacer] | utiliser <nom> [<dossier>] [--remplacer]',
].join('\n');

const AVEC_VALEUR = ['--chartes', '--styles', '--effets', '--personnages', '--musiques', '--sous', '--dossier'];

function lireOptions(args) {
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
  const libres = args.filter((a, i) => !a.startsWith('--') && !(AVEC_VALEUR.includes(args[i - 1])) && !(args[i - 1] === '--remplacer' && /[:,]|^tout$/.test(a)));
  return { valeur, libres, drapeau: (o) => args.includes(o) };
}

function executer(args) {
  const [commande, ...reste] = args;
  const o = lireOptions(reste);
  if (commande === 'liste') return B.listerBibliotheque();
  if (commande === 'exporter') {
    const selection = {};
    for (const k of ['chartes', 'styles', 'effets', 'personnages', 'musiques']) if (o.drapeau(`--${k}`)) selection[k] = o.valeur(`--${k}`) || 'tout';
    if (o.drapeau('--gouts')) selection.gouts = true;
    return B.exporterBibliotheque({ fichier: o.libres[0] || null, selection, remplacer: o.drapeau('--remplacer') });
  }
  if (commande === 'importer') {
    if (!o.libres[0]) return null;
    const i = reste.indexOf('--remplacer');
    const liste = i >= 0 && reste[i + 1] && !reste[i + 1].startsWith('--') ? reste[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (i >= 0 && !liste.length) return null;
    return B.importerBibliotheque({ fichier: o.libres[0], voir: o.drapeau('--voir'), remplacer: liste });
  }
  if (commande === 'effet') {
    const [action, nom, dossier = '.'] = o.libres;
    if (action === 'liste') return { ok: true, effets: B.listerEffets({ projet: path.resolve(o.valeur('--dossier') || '.') }) };
    if (action === 'enregistrer' && nom) return B.enregistrerEffet({ nom, projet: dossier, sous: o.valeur('--sous') || null, remplacer: o.drapeau('--remplacer') });
    if (action === 'utiliser' && nom) return B.utiliserEffet({ nom, projet: dossier, remplacer: o.drapeau('--remplacer') });
  }
  return null;
}

if (require.main === module) {
  const r = executer(process.argv.slice(2));
  if (!r) { console.error(USAGE); process.exit(2); }
  console.log(JSON.stringify(r, null, 2));
  process.exitCode = r.ok ? 0 : 1;
}

module.exports = { executer, USAGE };
