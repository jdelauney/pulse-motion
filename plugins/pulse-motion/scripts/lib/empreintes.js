'use strict';
/* Pulse Motion – empreintes des scènes assemblées (spec Rapidité 5.9 pour le contrôle, 5.16 pour l'export).
 *
 * empreintesControle(assemblage, { seuils, moteur, options }) -> { moteur, seuils, commun, scenes: { id: sha256 }, propres: { id: sha256 } }
 *   L'empreinte de contrôle d'une scène hache ce qui la fait voir à l'écran : sa section assemblée (textes, logo,
 *   ressources injectés), ses scripts, son minutage (début, fin, entrée, transition, rythme), ses données (voix, effets,
 *   milieux, shaders, obstacles, sous-titres qui la recouvrent), celles de la scène précédente quand son entrée la
 *   chevauche et celles de la suivante quand l'entrée de la suivante la chevauche (un flash pendant l'entrée est attribué
 *   à la première scène visible), le CSS de la page (style, charte, moteur), le moteur, les seuils et le format.
 *   Dans le doute, l'empreinte invalide : le son réactif (des visuels qui suivent le son de toute la vidéo), les
 *   post-traitements de toute la vidéo, les obstacles de la vidéo et les personnages entrent dans le commun.
 * plagesScenes(minutage, ids, marge) -> [[debut, fin]] : plages de temps où les scènes ids sont visibles, élargies de
 *   marge secondes, fusionnées.
 *
 * Export (5.16) : deux empreintes séparées (revue de la campagne, conflit 4).
 * decouperSegments(minutage, cadence, dureeMax) -> [{ scene, morceau, debut, fin }] : images [debut, fin[ de chaque segment.
 *   Le segment d'une scène va de la première image de son entrée (chevauchement compris) à la dernière image avant l'entrée
 *   de la suivante ; une scène plus longue que dureeMax est coupée en morceaux égaux d'au plus dureeMax secondes.
 * empreintesPixels(assemblage, { moteur, options, segments, cadence, largeur, hauteur, extra }) -> [sha256] (une par segment) :
 *   empreinte de contrôle de la scène sans les seuils (sa scène, la précédente quand son entrée la chevauche, le commun),
 *   le squelette de la page (tout ce qu'elle montre hors des scènes), cadence, taille, première image et nombre d'images,
 *   extra (navigateur, GPU, réglages de pixels de S5). Aucun réglage d'encodage. Elle nomme l'intermédiaire du segment.
 * empreinteDerivee(pixels, encodage) -> sha256 : empreinte des pixels + réglages d'encodage ; elle nomme le fichier dérivé.
 * Module pur (aucun accès au disque).
 */
const crypto = require('node:crypto');
const { calculerMinutage } = require('../../moteur/minutage.js');

const sha = (texte) => crypto.createHash('sha256').update(texte).digest('hex');

/** JSON stable : clés triées (l'ordre d'écriture d'un objet ne change pas l'empreinte). */
function stable(valeur) {
  if (valeur === undefined) return 'null';
  if (valeur === null || typeof valeur !== 'object') return JSON.stringify(valeur);
  if (ArrayBuffer.isView(valeur)) return stable(Array.from(valeur));
  if (Array.isArray(valeur)) return `[${valeur.map(stable).join(',')}]`;
  return `{${Object.keys(valeur).sort().map((k) => `${JSON.stringify(k)}:${stable(valeur[k])}`).join(',')}}`;
}

/** Parties communes aux empreintes du contrôle et de l'export : commun, empreinte propre de chaque scène, minutage. */
function composer(assemblage, { seuils, moteur, options = {} }) {
  const d = assemblage.donnees;
  const empreinteMoteur = sha(String(moteur));
  const empreinteSeuils = sha(stable(seuils));
  const commun = sha(stable({
    css: assemblage.cssPage,
    format: d.format,
    tempo: d.tempo,
    son: d.son || null,
    // Son réactif : des visuels suivent le son de toute la vidéo ; la page entière entre dans l'empreinte.
    page: d.son ? sha(assemblage.html) : null,
    obstaclesVideo: d.obstaclesVideo,
    modules: d.modules,
    personnages: d.personnages || null,
    shadersVideo: (assemblage.shaders || []).filter((s) => !s.scene),
    sousTitres: d.sousTitres ? { mode: d.sousTitres.mode, incrustes: d.sousTitres.incrustes, position: d.sousTitres.position } : null,
    moteur: empreinteMoteur,
    seuils: empreinteSeuils,
  }));
  const min = calculerMinutage(d.scenes, {}, options);
  const cartons = (d.sousTitres && d.sousTitres.cartons) || [];
  const propres = d.scenes.map((s, i) => {
    const m = min.scenes[i] || {};
    const partie = (assemblage.parScene || []).find((x) => x.id === s.id) || {};
    return sha(stable({
      id: s.id,
      section: partie.section || null,
      scripts: partie.scripts || [],
      minutage: { debut: m.debut, fin: m.fin, entree: m.entree, transition: m.transition, rythme: m.rythme, dureeEffective: m.dureeEffective },
      donnees: s,
      effets: (assemblage.effets || []).filter((e) => e.scene === s.id),
      milieux: (assemblage.milieux || []).filter((e) => e.scene === s.id),
      shaders: (assemblage.shaders || []).filter((e) => e.scene === s.id),
      obstacles: (d.obstacles || []).filter((e) => e.scene === s.id),
      sousTitres: cartons.filter((c) => c.scene === s.id || (c.fin > m.debut && c.debut < m.fin)),
    }));
  });
  return { empreinteMoteur, empreinteSeuils, commun, propres, min };
}

function empreintesControle(assemblage, { seuils, moteur, options = {} }) {
  const d = assemblage.donnees;
  const { empreinteMoteur, empreinteSeuils, commun, propres, min } = composer(assemblage, { seuils, moteur, options });
  const scenes = {};
  const parId = {};
  d.scenes.forEach((s, i) => {
    parId[s.id] = propres[i];
    const m = min.scenes[i] || {};
    const suivante = min.scenes[i + 1];
    scenes[s.id] = sha(stable({
      commun,
      propre: propres[i],
      precedente: i > 0 && m.entree > 0 ? propres[i - 1] : null,
      suivante: suivante && suivante.entree > 0 ? propres[i + 1] : null,
    }));
  });
  return { moteur: empreinteMoteur, seuils: empreinteSeuils, commun, scenes, propres: parId };
}

/** Ce qui ne touche que le son (volumes, partition) : retiré des données (changer un volume ne refait pas les images). */
function sansReglagesSon(d) {
  const x = { ...d };
  if (x.musique) { x.musique = { ...x.musique }; delete x.musique.volume; delete x.musique.partition; }
  if (x.voix) { x.voix = { ...x.voix }; delete x.voix.volume; }
  if (x.bruitages) { x.bruitages = { ...x.bruitages }; delete x.bruitages.volume; }
  return x;
}

/**
 * Squelette de la page : la page assemblée sans ses scènes (sections et scripts remplacés par une marque), sans ses
 * sources sonores, et ses données sans ce que les empreintes propres des scènes portent déjà (scènes, effets, milieux,
 * obstacles et shaders d'une scène, cartons de sous-titres) ni les réglages du seul son. Tout ce que la page montre
 * hors des scènes (styles, attributs de #pm-scene, une caméra qui enjamberait des scènes, moteur, démarrage) y reste.
 */
function squelettePage(assemblage) {
  let h = String(assemblage.html || '');
  for (const p of assemblage.parScene || []) {
    if (p.section) h = h.split(p.section).join(`<!--pm-scene ${p.id}-->`);
    for (const code of p.scripts || []) if (code) h = h.split(code).join('/*pm-script*/');
  }
  h = h.replace(/<script type="text\/plain" id="pm-son-[a-z0-9-]+">[^<]*<\/script>/g, '');
  const d = assemblage.donnees || {};
  const donnees = sansReglagesSon({
    ...d,
    scenes: null,
    effets: (assemblage.effets || []).filter((e) => !e.scene),
    milieux: (assemblage.milieux || []).filter((e) => !e.scene),
    obstacles: (d.obstacles || []).filter((e) => !e.scene),
    shaders: (d.shaders || []).filter((e) => !e.scene),
    sousTitres: d.sousTitres ? { ...d.sousTitres, cartons: null } : null,
  });
  h = h.replace(/(<script type="application\/json" id="pm-donnees">)[\s\S]*?(<\/script>)/, (tout, a, b) => a + stable(donnees) + b);
  return h;
}

/** Segments d'export alignés sur les scènes (minutage de la page : { duree, scenes: [{ id, debut }] }). */
function decouperSegments(minutage, cadence, dureeMax = 10) {
  const total = Math.round(minutage.duree * cadence);
  const parSegment = Math.max(1, Math.round(dureeMax * cadence));
  const scenes = minutage.scenes && minutage.scenes.length ? minutage.scenes : [{ id: null, debut: 0 }];
  const premieres = [];
  scenes.forEach((s, i) => {
    const n = i === 0 ? 0 : Math.ceil(s.debut * cadence - 1e-6);
    premieres.push(Math.min(total, Math.max(i ? premieres[i - 1] : 0, n)));
  });
  const segments = [];
  scenes.forEach((s, i) => {
    const a = premieres[i];
    const b = i + 1 < scenes.length ? premieres[i + 1] : total;
    if (b <= a) return;
    const morceaux = Math.ceil((b - a) / parSegment);
    const taille = Math.ceil((b - a) / morceaux);
    for (let k = 0; k < morceaux; k++) segments.push({ scene: s.id, morceau: k, debut: a + k * taille, fin: Math.min(b, a + (k + 1) * taille) });
  });
  return segments;
}

function empreintesPixels(assemblage, { moteur, options = {}, segments, cadence, largeur, hauteur, extra = {} }) {
  const d = assemblage.donnees;
  // Sans les seuils : ils ne changent aucune image.
  const { commun, propres, min } = composer(assemblage, { seuils: null, moteur, options });
  const squelette = sha(squelettePage(assemblage));
  const parScene = {};
  d.scenes.forEach((s, i) => {
    const m = min.scenes[i] || {};
    parScene[s.id] = sha(stable({ commun, propre: propres[i], precedente: i > 0 && m.entree > 0 ? propres[i - 1] : null }));
  });
  // Scène inconnue du minutage de Node (ne devrait pas arriver) : rattachée à toute la page.
  const page = sha(stable({ commun, propres }));
  return segments.map((g) => sha(stable({
    version: 1,
    scene: g.scene,
    controle: parScene[g.scene] || page,
    squelette,
    cadence,
    taille: [largeur, hauteur],
    premiere: g.debut,
    images: g.fin - g.debut,
    extra,
  })));
}

function empreinteDerivee(pixels, encodage) {
  return sha(stable({ pixels, encodage }));
}

/** Plages où les scènes ids sont visibles (minutage du moteur : { scenes: [{ id, debut, fin }], duree }), élargies, fusionnées. */
function plagesScenes(minutage, ids, marge = 0) {
  const voulues = new Set(ids);
  const duree = minutage.duree !== undefined ? minutage.duree : Math.max(0, ...minutage.scenes.map((s) => s.fin));
  const plages = minutage.scenes.filter((s) => voulues.has(s.id))
    .map((s) => [Math.max(0, s.debut - marge), Math.min(duree, s.fin + marge)])
    .sort((a, b) => a[0] - b[0]);
  const fusion = [];
  for (const p of plages) {
    const dernier = fusion[fusion.length - 1];
    if (dernier && p[0] <= dernier[1]) dernier[1] = Math.max(dernier[1], p[1]); else fusion.push(p.slice());
  }
  return fusion;
}

module.exports = { empreintesControle, plagesScenes, decouperSegments, empreintesPixels, empreinteDerivee, squelettePage, stable, sha };

/**
 * Son au contrôle (spec S2, 5.11) : faut-il mesurer le son de cette page, et l'empreinte de ce qui le fait entendre.
 * besoinEcoute(assemblage) -> bool : une voix avec une musique ou des bruitages (voix couverte), ou une musique (silences).
 * empreinteSonore(assemblage, { seuils, code, humeurs }) -> sha256 : sources sonores de la page (blocs « pm-son-… »), données
 *   du son (musique, voix, bruitages, scènes et leurs voix), sections qui jouent un son, humeurs de la musique par scène,
 *   seuils et code du son. Inchangée : le son mesuré au contrôle précédent est repris sans être rendu.
 */
function besoinEcoute(assemblage) {
  const d = assemblage.donnees || {};
  const voix = (d.scenes || []).some((s) => s.voix && s.voix.source);
  const musique = !!(d.musique && (d.musique.source || d.musique.partition) && d.musique.volume !== 0);
  const bruitages = !!(d.bruitages && d.bruitages.transitions) || (assemblage.parScene || []).some((p) => /\sdata-(?:son\s*=|moment-fort[\s=>])/.test(p.section || ''));
  return musique || (voix && bruitages);
}

function empreinteSonore(assemblage, { seuils, code = '', humeurs = {} } = {}) {
  const d = assemblage.donnees || {};
  const blocs = String(assemblage.html || '').match(/<script type="text\/plain" id="pm-son-[^"]*">[^<]*<\/script>/g) || [];
  const S = Object.fromEntries(Object.entries(seuils || {}).filter(([k]) => /^(voix|silence)/.test(k)));
  return sha(stable({
    blocs: blocs.map(sha),
    musique: d.musique || null, voix: d.voix || null, bruitages: d.bruitages || null, tempo: d.tempo || null,
    scenes: (d.scenes || []).map((s) => ({ id: s.id, duree: s.duree, rythme: s.rythme, transition: s.transition, voix: s.voix || null })),
    sections: (assemblage.parScene || []).filter((p) => /\sdata-(?:son\s*=|moment-fort[\s=>])/.test(p.section || '')).map((p) => ({ id: p.id, section: sha(p.section) })),
    humeurs, seuils: S, code: sha(String(code)),
    // Moment fort (spec Styles et réalisation, 5.8) : son fort du style, seulement s'il y en a un.
    ...(d.momentFort ? { momentFort: d.momentFort } : {}),
  }));
}

module.exports.besoinEcoute = besoinEcoute;
module.exports.empreinteSonore = empreinteSonore;
