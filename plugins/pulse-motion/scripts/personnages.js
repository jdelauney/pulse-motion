#!/usr/bin/env node
'use strict';
/* Pulse Motion – personnages : bibliothèque des poses, clips et gabarits.
 *
 *   node scripts/personnages.js liste [--dossier <d>]                                   JSON des poses, clips, gabarits
 *   node scripts/personnages.js afficher <nom> [--type pose|clip|gabarit] [--dossier <d>]   le fichier JSON
 *   node scripts/personnages.js verifier [--dossier <d>]                                 erreurs de la bibliothèque et de la vidéo
 *
 * --dossier : dossier de la vidéo (par défaut le dossier courant) ; ses fichiers personnages/ l'emportent sur la bibliothèque.
 */
const P = require('./lib/personnages.js');

const USAGE = [
  'Usage : pulse-motion personnages liste [--dossier <d>]',
  '        pulse-motion personnages afficher <nom> [--type pose|clip|gabarit] [--dossier <d>]',
  '        pulse-motion personnages verifier [--dossier <d>]',
].join('\n');

// Options suivies d'une valeur (les autres, comme --ouvrir ou --bibliotheque, sont de simples drapeaux).
const AVEC_VALEUR = ['--dossier', '--type', '--vues', '--images', '--gabarit', '--sortie', '--port'];

function options(args) {
  const valeur = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
  const libres = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && AVEC_VALEUR.includes(args[i - 1])));
  return { valeur, libres, drapeau: (nom) => args.includes(nom) };
}

const resume = (lu, pluriel, plus = () => ({})) => Object.keys(lu[pluriel]).sort().map((nom) => Object.assign(
  { nom, source: lu.sources[pluriel][nom], description: lu[pluriel][nom].description || '' }, plus(lu[pluriel][nom])));

async function executer(args, { bibliotheque } = {}) {
  const [sous, ...reste] = args;
  const o = options(reste);
  const lu = () => P.lire(o.valeur('--dossier') || '.', bibliotheque ? { bibliotheque } : {});
  if (sous === 'liste') {
    const l = lu();
    return { code: 0, sortie: JSON.stringify({
      poses: resume(l, 'poses'),
      clips: resume(l, 'clips', (c) => ({ boucle: c.boucle, duree: c.boucle ? c.duree : c.cles[c.cles.length - 1].t })),
      gabarits: resume(l, 'gabarits'),
      erreurs: l.erreurs.map((e) => e.message),
    }, null, 2), erreur: '' };
  }
  if (sous === 'afficher' && o.libres.length === 1) {
    const l = lu();
    const nom = o.libres[0];
    const type = o.valeur('--type');
    if (type && !P.TYPES[type]) return { code: 2, sortie: '', erreur: `Type « ${type} » inconnu (pose, clip ou gabarit).` };
    for (const t of type ? [type] : ['clip', 'pose', 'gabarit']) {
      const objet = l[P.TYPES[t]][nom];
      if (objet) return { code: 0, sortie: P.serialiser(t, objet).trimEnd(), erreur: '' };
    }
    const tous = ['clips', 'poses', 'gabarits'].flatMap((p) => Object.keys(l[p]));
    return { code: 1, sortie: '', erreur: `Personnage : « ${nom} » introuvable. Disponibles : ${tous.sort().join(', ')}.` };
  }
  if (sous === 'verifier') {
    const l = lu();
    const bilan = `${Object.keys(l.poses).length} poses, ${Object.keys(l.clips).length} clips, ${Object.keys(l.gabarits).length} gabarits`;
    if (!l.erreurs.length) return { code: 0, sortie: `Personnages : ${bilan}, aucune erreur.`, erreur: '' };
    return { code: 1, sortie: `Personnages : ${bilan}.`, erreur: l.erreurs.map((e) => e.message).join('\n') };
  }
  return { code: 2, sortie: '', erreur: USAGE };
}

if (require.main === module) {
  executer(process.argv.slice(2)).then((r) => {
    if (r.sortie) console.log(r.sortie);
    if (r.erreur) console.error(r.erreur);
    process.exitCode = r.code;
  }, (e) => { console.error(e.message); process.exitCode = 1; });
}

module.exports = { executer, USAGE };
