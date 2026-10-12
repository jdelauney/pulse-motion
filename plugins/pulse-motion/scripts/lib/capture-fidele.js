'use strict';
/* Pulse Motion – capture fidèle : la page assemblée (autonome) ouverte dans Chrome ou Edge sans fenêtre, à la
 * taille exacte de la vidéo ; chaque image est une vraie capture d'écran de l'instant t (rendu exact : flous,
 * modes de fusion, filtres, emoji, particules). */
const { pathToFileURL } = require('node:url');
const { ouvrirPage } = require('./cdp.js');

// Scène calée sur toute la zone d'affichage ; barre du lecteur et bandeau masqués ; temps de la page suivant t.
const PREPARER = `(async function () {
  await M.pret;
  if (document.fonts) await document.fonts.ready;
  var style = document.createElement('style');
  style.textContent = 'html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #000 !important; }'
    + ' #pm-scene { position: fixed !important; left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important;'
    + ' max-width: none !important; max-height: none !important; margin: 0 !important; transform: none !important; }'
    + ' #pm-lecteur, #pm-bandeau { display: none !important; }';
  document.head.appendChild(style);
  document.documentElement.classList.add('pm-export');
  M.modeCapture(true);
  return M.duree;
})()`;

const instant = (t) => `(async function () {
  await M.seek(${Number(t)});
  if (M.particules && M.particules.preparerCapture) await M.particules.preparerCapture();
  return true;
})()`;

/** -> Promise<{ duree, capturer(t), fermer() }> */
async function ouvrirCapture({ fichierHtml, largeur, hauteur, navigateur, gpu = false, delai = 30000 }) {
  const page = await ouvrirPage({ navigateur, largeur, hauteur, gpu, delai });
  try {
    await page.aller(pathToFileURL(fichierHtml).href);
    const duree = await page.evaluer(PREPARER);
    return {
      duree,
      async capturer(t) {
        await page.evaluer(instant(t));
        return page.capturer();
      },
      fermer: () => page.fermer(),
    };
  } catch (e) {
    await page.fermer();
    throw e;
  }
}

module.exports = { ouvrirCapture };
