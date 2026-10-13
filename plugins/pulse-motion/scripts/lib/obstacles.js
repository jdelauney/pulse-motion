'use strict';
/* Pulse Motion – obstacles des collisions de particules à l'assemblage.
 *
 * preparerObstacles(html, { scene, premierIndex }) : chaque balise data-obstacle ou data-obstacle-forme valide reçoit
 * data-pm-obstacle="N" (index dans M.donnees.obstacles) ; une balise fautive reçoit data-pm-obstacle-erreur et une
 * erreur obstacle-introuvable ; au-delà de 16 obstacles dans la scène, alerte trop-d-obstacles (les premiers gardés).
 * obstaclesVideo(deroule) : « obstacles » du déroulé (8 au plus), erreurs obstacles-video et trop-d-obstacles.
 * Les erreurs ne bloquent pas la page : l'obstacle fautif est ignoré.
 */
const { lireAttributs } = require('./extraire.js');
const { echapperHTML } = require('./scenes.js');
const O = require('../../moteur/particules/obstacles.js');

const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

function preparerObstacles(html, { scene, premierIndex = 0 }) {
  const obstacles = [];
  const erreurs = [];
  let declares = 0;
  const sortie = String(html).replace(BALISE, (tout, balise, texteAttributs) => {
    const a = lireAttributs(texteAttributs);
    const d = O.lireDeclaration(a);
    if (!d) return tout;
    const fermante = /\/\s*$/.test(texteAttributs) ? ' /' : '';
    const attributs = texteAttributs.replace(/\s*\/\s*$/, '');
    if (d.erreur) {
      erreurs.push({ regle: 'obstacle-introuvable', gravite: 'erreur', scene, ...(a.id ? { element: a.id } : {}), message: `Scène « ${scene} » : ${d.erreur}` });
      return `<${balise}${attributs} data-pm-obstacle-erreur="${echapperHTML(d.erreur)}"${fermante}>`;
    }
    declares++;
    if (obstacles.length >= O.MAX_SCENE) return tout;
    const index = premierIndex + obstacles.length;
    obstacles.push({ scene, ...d.obstacle });
    return `<${balise}${attributs} data-pm-obstacle="${index}"${fermante}>`;
  });
  if (declares > O.MAX_SCENE) {
    erreurs.push({ regle: 'trop-d-obstacles', gravite: 'alerte', scene,
      message: `Scène « ${scene} » : ${declares} obstacles déclarés ; seuls les ${O.MAX_SCENE} premiers (ordre du document) comptent.` });
  }
  return { html: sortie, obstacles, erreurs };
}

function obstaclesVideo(deroule) {
  const r = O.lireObstaclesVideo(deroule && deroule.obstacles);
  const erreurs = r.erreurs.map((message) => ({ regle: 'obstacles-video', gravite: 'erreur', message: `Déroulé : ${message}` }));
  if (r.enTrop) {
    erreurs.push({ regle: 'trop-d-obstacles', gravite: 'alerte',
      message: `Déroulé : ${r.obstacles.length + r.enTrop} obstacles de vidéo ; seuls les ${O.MAX_VIDEO} premiers comptent.` });
  }
  return { obstacles: r.obstacles, erreurs };
}

module.exports = { preparerObstacles, obstaclesVideo };
