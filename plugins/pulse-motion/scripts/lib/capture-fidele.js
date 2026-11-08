'use strict';
/* Pulse Motion – capture fidèle : la page assemblée (autonome) ouverte dans Chrome ou Edge sans fenêtre, à la
 * taille exacte de la vidéo ; chaque image est une vraie capture d'écran de l'instant t (rendu exact : flous,
 * modes de fusion, filtres, emoji, particules). PNG sans perte, compressé au plus vite (optimizeForSpeed). */
const { pathToFileURL } = require('node:url');
const { ouvrirPage } = require('./cdp.js');

/** Drapeaux des pages de capture (spec Rapidité 5.14, 5.15) : page jamais ralentie en arrière-plan, et capture sans attendre
 *  la cadence d'affichage (une capture attend sinon une image du navigateur, ≈ 48 ms au lieu de 17). Aucun ne change les pixels. */
const OPTIONS_CAPTURE = ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-frame-rate-limit'];

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
  // Horloge réelle gardée pour le profil : en mode capture, performance.now suit le temps de la vidéo.
  window.__pmMaintenant = performance.now.bind(performance);
  M.modeCapture(true);
  var scenes = ((M.minutage && M.minutage.scenes) || []).map(function (s) { return { id: s.id, debut: s.debut, fin: s.fin, entree: s.entree }; });
  return { duree: M.duree, scenes: scenes };
})()`;

// Instant t : temps passés dans M.seek et dans la préparation des particules, mesurés dans la page à l'horloge réelle
// (profil d'export).
const instant = (t) => `(async function () {
  var maintenant = window.__pmMaintenant;
  var a = maintenant();
  await M.seek(${Number(t)});
  var b = maintenant();
  if (M.particules && M.particules.preparerCapture) await M.particules.preparerCapture();
  return [b - a, maintenant() - b];
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

/** -> Promise<{ duree, minutage: { duree, scenes: [{ id, debut, fin, entree }] }, capturer(t, profil?), rendreSon(), version(), processus, fermer() }>
 *  profil(phase, ms) : temps cumulés de seek, particules, capture, base64. */
async function ouvrirCapture({ fichierHtml, largeur, hauteur, navigateur, gpu = false, delai = 30000, ouvrir = ouvrirPage }) {
  const page = await ouvrir({ navigateur, largeur, hauteur, gpu, delai, options: OPTIONS_CAPTURE });
  try {
    // ?capture=1 : le lecteur ne prépare pas le son d'avance (il n'est rendu que si l'export le demande).
    await page.aller(`${pathToFileURL(fichierHtml).href}?capture=1`);
    const info = await page.evaluer(PREPARER);
    return {
      duree: info.duree,
      minutage: { duree: info.duree, scenes: info.scenes },
      async capturer(t, profil) {
        const [seek, particules] = await page.evaluer(instant(t));
        if (profil) { profil('seek', seek); profil('particules', particules); }
        return page.capturer({ profil });
      },
      /** -> { wav: Buffer|null, sonie, avertissements } ; rapatrié par morceaux (messages CDP de taille bornée). */
      async rendreSon({ morceau = 4 * 1024 * 1024, seulement } = {}) {
        const info2 = await page.evaluer(SON(seulement ? { seulement } : null));
        if (!info2.longueur) return { wav: null, sonie: info2.sonie, avertissements: info2.avertissements };
        const parts = [];
        for (let i = 0; i < info2.longueur; i += morceau) parts.push(await page.evaluer(`window.__pmSon.slice(${i}, ${i + morceau})`));
        await page.evaluer('window.__pmSon = null, true');
        return { wav: Buffer.from(parts.join(''), 'base64'), sonie: info2.sonie, avertissements: info2.avertissements };
      },
      evaluer: (code) => page.evaluer(code),
      version: () => (page.version ? page.version() : Promise.resolve('')),
      processus: page.processus,
      fermer: () => page.fermer(),
    };
  } catch (e) {
    await page.fermer();
    throw e;
  }
}

module.exports = { ouvrirCapture, OPTIONS_CAPTURE };
