'use strict';
/* Pulse Motion – son réactif à l'assemblage (P7) : pistes lues par les effets (effet.pistes : modulation, salves au
 * battement), les shaders (donnee.pistes : iSon, texture audio) et le CSS des scènes et du style (variables --son-…,
 * --voix-enveloppe) ; contrôles piste-inconnue et son-sans-piste ; M.donnees.son = { pistes, css } | null.
 *
 * besoinsSon({ effets, shaders, css, presentes }) -> { son, erreurs }
 *   effets : [{ scene, effet }] ; shaders : entrées de M.donnees.shaders ; css : [{ scene | null, texte }] ;
 *   presentes : { musique: bool, voix: bool } (pistes de la vidéo).
 */
const PISTES = ['musique', 'voix'];
const CSS_MUSIQUE = /--son-(?:volume|basses|mediums|aigus|battement|phase)\b/;
const CSS_VOIX = /--voix-enveloppe\b/;
const CONSEILS = {
  musique: 'ajouter une musique au déroulé (« musique » : fichier, ambiance générée ou partition), ou retirer ce qui suit la musique.',
  voix: 'enregistrer la voix d\'une scène (/pulse-motion:voix), ou retirer ce qui suit la voix.',
};

function pistesCSS(texte) {
  const r = [];
  if (CSS_MUSIQUE.test(texte)) r.push('musique');
  if (CSS_VOIX.test(texte)) r.push('voix');
  return r;
}

function besoinsSon({ effets = [], shaders = [], css = [], presentes }) {
  const erreurs = [];
  const utilisees = new Set();
  let avecCSS = false;
  const verifier = (pistes, contexte, scene, gravite) => {
    for (const p of pistes || []) {
      const ou = scene ? { scene } : {};
      if (!PISTES.includes(p)) {
        erreurs.push({ regle: 'piste-inconnue', gravite: 'erreur', ...ou, message: `${contexte} : piste « ${p} » inconnue (pistes : ${PISTES.join(', ')}).` });
      } else if (!presentes[p]) {
        erreurs.push({ regle: 'son-sans-piste', gravite, ...ou, message: `${contexte} suit la ${p}, mais la vidéo n'en a pas : ${CONSEILS[p]}` });
      } else utilisees.add(p);
    }
  };
  effets.forEach(({ scene, effet }) => verifier(effet.pistes, `Scène « ${scene} », effet « ${effet.nom} »`, scene, 'erreur'));
  shaders.forEach((d) => verifier(d.pistes, d.scene ? `Scène « ${d.scene} », shader « ${d.nom} »` : `Shader « ${d.nom} »`, d.scene, 'erreur'));
  css.forEach(({ scene, texte }) => {
    const ps = pistesCSS(texte);
    if (!ps.length) return;
    avecCSS = true;
    verifier(ps, scene ? `Scène « ${scene} », variables CSS du son` : 'Style de la vidéo, variables CSS du son', scene, 'alerte');
  });
  const pistes = PISTES.filter((p) => utilisees.has(p));
  return { son: pistes.length || avecCSS ? { pistes, css: avecCSS } : null, erreurs };
}

module.exports = { PISTES, pistesCSS, besoinsSon };
