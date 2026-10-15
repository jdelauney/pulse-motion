#!/usr/bin/env node
'use strict';
/* Pulse Motion – personnages : bibliothèque des poses, clips et gabarits.
 *
 *   node scripts/personnages.js liste [--dossier <d>]                                   JSON des poses, clips, gabarits
 *   node scripts/personnages.js afficher <nom> [--type pose|clip|gabarit] [--dossier <d>]   le fichier JSON
 *   node scripts/personnages.js verifier [--dossier <d>]                                 erreurs de la bibliothèque et de la vidéo
 *   node scripts/personnages.js planche <nom> [--type pose|clip] [--vues 0,45,90] [--images 8] [--gabarit standard]
 *                                  [--dossier <d>] [--sortie <fichier.png>] [--ouvrir]   PNG des vignettes
 *
 * --dossier : dossier de la vidéo (par défaut le dossier courant) ; ses fichiers personnages/ l'emportent sur la bibliothèque.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('./lib/personnages.js');

const USAGE_PLANCHE = 'Usage : pulse-motion personnages planche <nom> [--type pose|clip] [--vues 0,45,90] [--images 1 à 16] [--gabarit standard] [--dossier <d>] [--sortie <fichier.png>] [--ouvrir]';
const USAGE = [
  'Usage : pulse-motion personnages liste [--dossier <d>]',
  '        pulse-motion personnages afficher <nom> [--type pose|clip|gabarit] [--dossier <d>]',
  '        pulse-motion personnages verifier [--dossier <d>]',
  `        ${USAGE_PLANCHE.slice('Usage : '.length)}`,
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
  if (sous === 'planche') {
    const vues = String(o.valeur('--vues') || '0,45,90').split(',').map((v) => (/^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN));
    const images = o.valeur('--images') === undefined ? 8 : Number(o.valeur('--images'));
    const type = o.valeur('--type');
    if (o.libres.length !== 1 || !vues.length || vues.some((v) => !Number.isFinite(v) || v < -180 || v > 180)
      || !Number.isInteger(images) || images < 1 || images > 16 || (type && !['pose', 'clip'].includes(type))) {
      return { code: 2, sortie: '', erreur: USAGE_PLANCHE };
    }
    const dossier = o.valeur('--dossier') || '.';
    const l = lu();
    const nom = o.libres[0];
    const trouve = (type ? [type] : ['clip', 'pose']).map((t) => [t, l[P.TYPES[t]][nom]]).find(([, x]) => x);
    if (!trouve) return { code: 1, sortie: '', erreur: `Personnage : « ${nom} » introuvable (clips : ${Object.keys(l.clips).join(', ')} ; poses : ${Object.keys(l.poses).join(', ')}).` };
    const nomGabarit = o.valeur('--gabarit') || 'standard';
    const gabarit = l.gabarits[nomGabarit];
    if (!gabarit) return { code: 1, sortie: '', erreur: `Personnage : gabarit « ${nomGabarit} » introuvable (gabarits : ${Object.keys(l.gabarits).join(', ')}).` };
    const sortie = o.valeur('--sortie') || (fs.existsSync(path.join(dossier, 'deroule.json'))
      ? path.join(dossier, 'sortie', 'personnages', `${nom}.png`)
      : path.join(os.tmpdir(), 'pm-personnages', `${nom}.png`));
    const { rendrePlanche } = require('./lib/planche-personnages.js');
    try {
      const r = await rendrePlanche({ nom, type: trouve[0], objet: trouve[1], lu: l, gabarit, vues, images, sortie: path.resolve(sortie) });
      if (o.drapeau('--ouvrir')) require('./apercu.js').ouvrirNavigateur(r.fichier);
      return { code: 0, sortie: `Planche : ${r.fichier}`, erreur: '' };
    } catch (e) {
      return { code: 1, sortie: '', erreur: e.message };
    }
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
