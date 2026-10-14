'use strict';
/* Pulse Motion – compilation réelle des shaders d'une vidéo (pulse-motion controler --gpu) : la page assemblée est ouverte
 * dans Chrome ou Edge sans fenêtre avec WebGPU ; le moteur y compile chaque shader (fonds, transitions, post-traitements) et
 * chaque module WGSL des effets, comme dans l'aperçu ; ses erreurs (ligne, colonne, message) deviennent des problèmes
 * « shader-ne-compile-pas ». Sans navigateur ou sans WebGPU : « shaders-non-compiles » (information). */
const { trouverNavigateur } = require('./navigateur.js');
const { mesurerPage } = require('./page-mesures.js');

/** Vrai si la page assemblée (pm-donnees) a des shaders ou des modules WGSL à compiler. */
function aDesShaders(donnees) {
  return !!donnees && ((donnees.shaders || []).length > 0 || Object.keys(donnees.modules || {}).length > 0);
}

const nonCompiles = (message) => ({ verifie: false, problemes: [{ regle: 'shaders-non-compiles', gravite: 'info', message }] });

/** -> Promise<{ verifie, problemes }> ; jamais d'exception. */
async function compilerShadersGPU({ html, navigateur = trouverNavigateur(), delai = 90000 }) {
  if (!navigateur) return nonCompiles('Chrome ou Edge introuvable : les shaders n\'ont pas été compilés ici ; ils le seront à l\'ouverture de l\'aperçu.');
  const r = await mesurerPage({ html, navigateur, gpu: true, delai, script: `
    await M.particules.pret;
    if (!M.particules.disponible) return { gpu: false };
    return { gpu: true, erreurs: M.shaders.erreurs() };` });
  if (r.erreur) return nonCompiles(`Les shaders n'ont pas pu être compilés dans le navigateur (${r.erreur}) ; ils le seront à l'ouverture de l'aperçu.`);
  if (!r.resultat || !r.resultat.gpu) return nonCompiles('WebGPU indisponible dans Chrome sans fenêtre : les shaders n\'ont pas été compilés ici ; ils le seront à l\'ouverture de l\'aperçu.');
  return {
    verifie: true,
    problemes: r.resultat.erreurs.map((e) => ({ regle: 'shader-ne-compile-pas', gravite: 'erreur', ...(e.scene ? { scene: e.scene } : {}), message: e.message })),
  };
}

module.exports = { aDesShaders, compilerShadersGPU };
