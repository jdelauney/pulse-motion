'use strict';
/* Pulse Motion – empreintes des scènes assemblées (spec Rapidité 5.9, partagé avec l'export en S1-4).
 *
 * empreintesControle(assemblage, { seuils, moteur, options }) -> { moteur, seuils, commun, scenes: { id: sha256 } }
 *   L'empreinte de contrôle d'une scène hache ce qui la fait voir à l'écran : sa section assemblée (textes, logo,
 *   ressources injectés), ses scripts, son minutage (début, fin, entrée, transition, rythme), ses données (voix, effets,
 *   milieux, shaders, obstacles, sous-titres qui la recouvrent), celles de la scène précédente quand son entrée la
 *   chevauche et celles de la suivante quand l'entrée de la suivante la chevauche (un flash pendant l'entrée est attribué
 *   à la première scène visible), le CSS de la page (style, charte, moteur), le moteur, les seuils et le format.
 *   Dans le doute, l'empreinte invalide : le son réactif (des visuels qui suivent le son de toute la vidéo), les
 *   post-traitements de toute la vidéo, les obstacles de la vidéo et les personnages entrent dans le commun.
 * plagesScenes(minutage, ids, marge) -> [[debut, fin]] : plages de temps où les scènes ids sont visibles, élargies de
 *   marge secondes, fusionnées.
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

function empreintesControle(assemblage, { seuils, moteur, options = {} }) {
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
  const scenes = {};
  d.scenes.forEach((s, i) => {
    const m = min.scenes[i] || {};
    const suivante = min.scenes[i + 1];
    scenes[s.id] = sha(stable({
      commun,
      propre: propres[i],
      precedente: i > 0 && m.entree > 0 ? propres[i - 1] : null,
      suivante: suivante && suivante.entree > 0 ? propres[i + 1] : null,
    }));
  });
  return { moteur: empreinteMoteur, seuils: empreinteSeuils, commun, scenes };
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

module.exports = { empreintesControle, plagesScenes, stable, sha };
