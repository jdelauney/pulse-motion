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

// Son de la page (mixage du moteur) en WAV base64, gardé dans la page puis lu par morceaux.
const SON = (options) => `(async function () {
  var r = await M.rendreSon(${JSON.stringify(options || null)});
  window.__pmSon = null;
  if (!r.buffer) return { longueur: 0, sonie: r.sonie, avertissements: r.avertissements };
  var b = r.buffer;
  window.__pmSon = M.wav.base64(M.wav.ecrire({ taux: b.sampleRate, canaux: [b.getChannelData(0), b.getChannelData(1)] }));
  return { longueur: window.__pmSon.length, sonie: r.sonie, avertissements: r.avertissements };
})()`;

/** -> Promise<{ duree, capturer(t), rendreSon(), fermer() }> */
async function ouvrirCapture({ fichierHtml, largeur, hauteur, navigateur, gpu = false, delai = 30000 }) {
  const page = await ouvrirPage({ navigateur, largeur, hauteur, gpu, delai });
  try {
    // ?capture=1 : le lecteur ne prépare pas le son d'avance (il n'est rendu que si l'export le demande).
    await page.aller(`${pathToFileURL(fichierHtml).href}?capture=1`);
    const duree = await page.evaluer(PREPARER);
    return {
      duree,
      async capturer(t) {
        await page.evaluer(instant(t));
        return page.capturer();
      },
      /** -> { wav: Buffer|null, sonie, avertissements } ; rapatrié par morceaux (messages CDP de taille bornée). */
      async rendreSon({ morceau = 4 * 1024 * 1024, seulement } = {}) {
        const info = await page.evaluer(SON(seulement ? { seulement } : null));
        if (!info.longueur) return { wav: null, sonie: info.sonie, avertissements: info.avertissements };
        const parts = [];
        for (let i = 0; i < info.longueur; i += morceau) parts.push(await page.evaluer(`window.__pmSon.slice(${i}, ${i + morceau})`));
        await page.evaluer('window.__pmSon = null, true');
        return { wav: Buffer.from(parts.join(''), 'base64'), sonie: info.sonie, avertissements: info.avertissements };
      },
      evaluer: (code) => page.evaluer(code),
      fermer: () => page.fermer(),
    };
  } catch (e) {
    await page.fermer();
    throw e;
  }
}

module.exports = { ouvrirCapture };
