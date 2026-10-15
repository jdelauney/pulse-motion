#!/usr/bin/env node
'use strict';
/* Pulse Motion – personnages : bibliothèque des poses, clips et gabarits.
 *
 *   node scripts/personnages.js liste [--dossier <d>]                                   JSON des poses, clips, gabarits
 *   node scripts/personnages.js afficher <nom> [--type pose|clip|gabarit|dessin|expression] [--dossier <d>]   le fichier JSON
 *   node scripts/personnages.js verifier [--dossier <d>]                                 erreurs de la bibliothèque et de la vidéo
 *   node scripts/personnages.js planche <nom> [--type pose|clip] [--vues 0,45,90] [--images 8] [--gabarit standard]
 *                                  [--dossier <d>] [--sortie <fichier.png>] [--ouvrir]   PNG des vignettes
 *
 *   node scripts/personnages.js atelier [<nom>] [--bibliotheque] [--dossier <d>] [--port 4321]
 *        atelier des personnages (page de l'aperçu) ; dans une vidéo : enregistre dans ses personnages/ ;
 *        --bibliotheque : enregistre dans la bibliothèque du plugin ; le processus reste ouvert s'il sert l'aperçu
 * --dossier : dossier de la vidéo (par défaut le dossier courant) ; ses fichiers personnages/ l'emportent sur la bibliothèque.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('./lib/personnages.js');

const USAGE_PLANCHE = 'Usage : pulse-motion personnages planche <nom> [--type pose|clip] [--vues 0,45,90] [--images 1 à 16] [--gabarit standard] [--dossier <d>] [--sortie <fichier.png>] [--ouvrir]';
const USAGE = [
  'Usage : pulse-motion personnages liste [--dossier <d>]',
  '        pulse-motion personnages afficher <nom> [--type pose|clip|gabarit|dessin|expression] [--dossier <d>]',
  '        pulse-motion personnages verifier [--dossier <d>]',
  `        ${USAGE_PLANCHE.slice('Usage : '.length)}`,
  '        pulse-motion personnages atelier [<nom>] [--bibliotheque] [--dossier <d>] [--port 4321]',
].join('\n');
const USAGE_ATELIER = 'Usage : pulse-motion personnages atelier [<nom>] [--bibliotheque] [--dossier <d>] [--port 4321]';


// Options suivies d'une valeur (les autres, comme --ouvrir ou --bibliotheque, sont de simples drapeaux).
const AVEC_VALEUR = ['--dossier', '--type', '--vues', '--images', '--gabarit', '--sortie', '--port'];

function options(args) {
  const valeur = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
  const libres = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && AVEC_VALEUR.includes(args[i - 1])));
  // Une option à valeur placée en dernier, ou suivie d'une autre option : elle est incomplète.
  const incomplete = args.some((a, i) => AVEC_VALEUR.includes(a) && (i + 1 >= args.length || args[i + 1].startsWith('--')));
  return { valeur, libres, incomplete, drapeau: (nom) => args.includes(nom) };
}

const resume = (lu, pluriel, plus = () => ({})) => Object.keys(lu[pluriel]).sort().map((nom) => Object.assign(
  { nom, source: lu.sources[pluriel][nom], description: lu[pluriel][nom].description || '' }, plus(lu[pluriel][nom])));

const NOM = /^[a-z0-9-]+$/;

function dossierNomme(nom) {
  const d = path.join(os.tmpdir(), nom);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Ouvre l'atelier dans l'aperçu (rouvert s'il tourne déjà). -> { url, deja, cible } */
async function lancerAtelierPersonnages({ dossier = '.', nom = null, bibliotheque = false, port = 4321, lancer, ouvrirUrl } = {}) {
  if (nom !== null && !NOM.test(nom)) throw new Error(`Nom « ${nom} » invalide (minuscules, chiffres, tirets ; exemple : marche).`);
  const A = require('./apercu.js');
  const projet = !bibliotheque && fs.existsSync(path.join(dossier, 'deroule.json'));
  const cible = bibliotheque ? dossierNomme('pm-personnages-bibliotheque') : projet ? dossier : dossierNomme('pm-personnages');
  const options = { dossier: cible, port, ouvrir: false };
  if (bibliotheque) options.demarrer = (o) => A.demarrerApercu(Object.assign({}, o, { ecrireBibliothequePersonnages: true }));
  const { url, deja } = await (lancer || A.lancerApercu)(options);
  const adresse = `${url}_pm/personnages${nom ? `?nom=${encodeURIComponent(nom)}` : ''}`;
  (ouvrirUrl || A.ouvrirNavigateur)(adresse);
  return { url: adresse, deja, cible: bibliotheque ? 'bibliotheque' : projet ? 'video' : null };
}


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
      dessins: resume(l, 'dessins'),
      expressions: resume(l, 'expressions'),
      erreurs: l.erreurs.map((e) => e.message),
    }, null, 2), erreur: '' };
  }
  if (sous === 'afficher' && o.libres.length === 1) {
    const l = lu();
    const nom = o.libres[0];
    const type = o.valeur('--type');
    if (type && !P.TYPES[type]) return { code: 2, sortie: '', erreur: `Type « ${type} » inconnu (pose, clip, gabarit, dessin ou expression).` };
    for (const t of type ? [type] : ['clip', 'pose', 'gabarit', 'dessin', 'expression']) {
      const objet = Object.hasOwn(l[P.TYPES[t]], nom) ? l[P.TYPES[t]][nom] : null;
      if (objet) return { code: 0, sortie: P.serialiser(t, objet).trimEnd(), erreur: '' };
    }
    const tous = ['clips', 'poses', 'gabarits', 'dessins', 'expressions'].flatMap((p) => Object.keys(l[p]));
    return { code: 1, sortie: '', erreur: `Personnage : « ${nom} » introuvable. Disponibles : ${tous.sort().join(', ')}.` };
  }
  if (sous === 'verifier') {
    const l = lu();
    const bilan = `${Object.keys(l.poses).length} poses, ${Object.keys(l.clips).length} clips, ${Object.keys(l.gabarits).length} gabarits, ${Object.keys(l.expressions).length} expressions, ${Object.keys(l.dessins).length} dessins`;
    if (!l.erreurs.length) return { code: 0, sortie: `Personnages : ${bilan}, aucune erreur.`, erreur: '' };
    return { code: 1, sortie: `Personnages : ${bilan}.`, erreur: l.erreurs.map((e) => e.message).join('\n') };
  }
  if (o.incomplete) return { code: 2, sortie: '', erreur: sous === 'planche' ? USAGE_PLANCHE : sous === 'atelier' ? USAGE_ATELIER : USAGE };
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
    const trouve = (type ? [type] : ['clip', 'pose']).map((t) => [t, Object.hasOwn(l[P.TYPES[t]], nom) ? l[P.TYPES[t]][nom] : null]).find(([, x]) => x);
    if (!trouve) return { code: 1, sortie: '', erreur: `Personnage : « ${nom} » introuvable (clips : ${Object.keys(l.clips).join(', ')} ; poses : ${Object.keys(l.poses).join(', ')}).` };
    const nomGabarit = o.valeur('--gabarit') || 'standard';
    const gabarit = Object.hasOwn(l.gabarits, nomGabarit) ? l.gabarits[nomGabarit] : null;
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
  if (sous === 'atelier') {
    const port = o.valeur('--port') === undefined ? 4321 : parseInt(o.valeur('--port'), 10);
    if (o.libres.length > 1 || !Number.isInteger(port) || (o.libres[0] !== undefined && !NOM.test(o.libres[0]))) return { code: 2, sortie: '', erreur: USAGE_ATELIER };
    try {
      const r = await lancerAtelierPersonnages({ dossier: o.valeur('--dossier') || '.', nom: o.libres[0] || null, bibliotheque: o.drapeau('--bibliotheque'), port });
      const lignes = [`Atelier des personnages : ${r.url}`];
      if (r.cible === null) lignes.push('Aucune vidéo dans ce dossier : on peut poser et animer, mais pour enregistrer, lancez l\'atelier depuis le dossier d\'une vidéo.');
      if (r.cible === 'bibliotheque') lignes.push('Mode bibliothèque : les enregistrements vont dans la bibliothèque du plugin.');
      return { code: 0, sortie: lignes.join('\n'), erreur: '', garder: !r.deja };
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
    // atelier : le processus reste ouvert tant qu'il sert l'aperçu qu'il a démarré (r.garder).
    process.exitCode = r.code;
  }, (e) => { console.error(e.message); process.exitCode = 1; });
}

module.exports = { executer, lancerAtelierPersonnages, USAGE };
