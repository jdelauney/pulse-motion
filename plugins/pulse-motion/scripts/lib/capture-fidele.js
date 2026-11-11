'use strict';
/* Pulse Motion – capture fidèle : la page assemblée (autonome) ouverte dans Chrome ou Edge sans fenêtre, à la
 * taille exacte de la vidéo ; chaque image est une vraie capture d'écran de l'instant t (rendu exact : flous,
 * modes de fusion, filtres, emoji, particules). PNG sans perte, compressé au plus vite (optimizeForSpeed). */
const { pathToFileURL } = require('node:url');
const { ouvrirPage } = require('./cdp.js');

/** Drapeaux ajoutés aux pages de capture : aucun (mesures de S1-4 sur le témoin de 3 min).
 *  - --disable-frame-rate-limit (utilisé par la page de contrôle) : une capture peut précéder la présentation de l'image
 *    (7 images sur 723 différentes, encore 2 avec deux requestAnimationFrame avant la capture) ;
 *  - --disable-renderer-backgrounding, --disable-background-timer-throttling, --disable-backgrounding-occluded-windows
 *    (spec Rapidité 5.15.4) : deux exports du même projet ne donnent plus les mêmes images (428 images décodées différentes,
 *    contre 1 sans eux). */
const OPTIONS_CAPTURE = [];

// Scène calée sur toute la zone d'affichage ; barre du lecteur et bandeau masqués ; temps de la page suivant t. Fond transparent
// (spec Rendu et export, 5.14) : aucun fond noir, classe pm-transparent (moteur/base.css).
const PREPARER_DE = (transparent) => `(async function () {
  await M.pret;
  if (document.fonts) await document.fonts.ready;
  var style = document.createElement('style');
  style.textContent = 'html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: ${transparent ? 'transparent' : '#000'} !important; }'
    + ' #pm-scene { position: fixed !important; left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important;'
    + ' max-width: none !important; max-height: none !important; margin: 0 !important; transform: none !important; }'
    + ' #pm-lecteur, #pm-bandeau { display: none !important; }';
  document.head.appendChild(style);
  document.documentElement.classList.add('pm-export');
  ${transparent ? "document.documentElement.classList.add('pm-transparent');" : ''}
  // Horloge réelle gardée pour le profil : en mode capture, performance.now suit le temps de la vidéo.
  window.__pmMaintenant = performance.now.bind(performance);
  M.modeCapture(true);
  var scenes = ((M.minutage && M.minutage.scenes) || []).map(function (s) { return { id: s.id, debut: s.debut, fin: s.fin, entree: s.entree, dureeTransition: s.dureeTransition || 0 }; });
  return { duree: M.duree, scenes: scenes };
})()`;
const PREPARER = PREPARER_DE(false);

// Instant t : temps passés dans M.seek et dans la préparation des particules, mesurés dans la page à l'horloge réelle
// (profil d'export). Saut dans le temps sous une caméra (data-camera) : deux images d'attente avant la capture. Sans elles, le
// navigateur peut encore peindre un texte animé à l'échelle de la caméra de l'image d'avant (trame rééchantillonnée, jusqu'à
// 5 niveaux d'écart sur quelques pixels) : la même image différait d'un rien selon l'ordre des captures (preuve du
// déterminisme du témoin explication-facture, scène finale). Les images qui se suivent (export) n'attendent pas.
const instant = (t) => `(async function () {
  var maintenant = window.__pmMaintenant;
  var a = maintenant();
  var ips = (M.donnees && M.donnees.format && M.donnees.format.ips) || 30;
  var saut = window.__pmDernierInstant === undefined || Math.abs(${Number(t)} - window.__pmDernierInstant) > 1.5 / ips;
  window.__pmDernierInstant = ${Number(t)};
  await M.seek(${Number(t)});
  if (saut && document.querySelector('#pm-scene [data-camera]')) {
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(r, 0); }); }); });
  }
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

/** Scène montrée à l'instant t (celle qui entre pendant une transition). */
function sceneA(scenes, t) {
  let id = scenes.length ? scenes[0].id : null;
  for (const s of scenes) if (s.debut <= t + 1e-9) id = s.id;
  return id;
}

/** Erreur de script relevée pendant l'export (spec Rendu et export, 5.23) : la scène et l'instant, en français. */
function erreurDeScript(scene, t, detail) {
  const instantFr = String(Math.round(t * 10) / 10).replace('.', ',');
  return Object.assign(new Error(`La scène « ${scene} » a une erreur de script vers ${instantFr} s : l'export s'arrête, rien n'est écrit.`),
    { script: true, scene, instant: t, detail });
}

/** Cadre de téléphone (spec Rendu et export, 5.15) : la scène garde sa mise en page de 1080 × 1920 (les unités cqh ne bougent
 *  pas), réduite par transform: scale(k) dans l'écran ; le cadre est dessiné derrière, sur toute la fenêtre. */
const CADRER = (g, svg) => `(function () {
  var style = document.createElement('style');
  style.id = 'pm-cadre-style';
  style.textContent = 'html body #pm-scene { width: 1080px !important; height: 1920px !important; left: ${g.ecran.x}px !important; top: ${g.ecran.y}px !important;'
    + ' transform: scale(${g.echelle}) !important; transform-origin: 0 0 !important; clip-path: inset(0 round ${g.ecran.rayon / g.echelle}px) !important; }'
    + ' #pm-cadre { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; pointer-events: none; }'
    + ' #pm-cadre svg { display: block; width: 100%; height: 100%; }';
  document.head.appendChild(style);
  var cadre = document.createElement('div');
  cadre.id = 'pm-cadre';
  cadre.innerHTML = ${JSON.stringify(svg)};
  document.body.insertBefore(cadre, document.body.firstChild);
  return true;
})()`;

/** Sous-titres masqués le temps d'une image (couverture, spec Rendu et export 5.10), même incrustés. */
const SOUS_TITRES = (masquer) => `(function () { var st = document.getElementById('pm-sous-titres'); if (st) st.classList.${masquer ? 'add' : 'remove'}('pm-sans-sous-titres'); return true; })()`;

/** -> Promise<{ duree, minutage: { duree, scenes: [{ id, debut, fin, entree }] }, capturer(t, profil?), capturerJpeg(t, options?),
 *  rendreSon(), version(), processus, fermer() }>
 *  profil(phase, ms) : temps cumulés de seek, particules, capture, base64. parametres : ajoutés à l'adresse de la page
 *  (grainMax : plafond du grain, spec Rendu et export 5.9). erreurs (export) : une exception de la page après sa préparation
 *  (erreur de script d'une scène) fait échouer la capture suivante, avec la scène et l'instant. cadre : 'telephone' (vidéo
 *  9:16 dans la fenêtre largeur × hauteur, moteur/cadres/telephone.js). transparent : fond transparent (5.14), captures à couche alpha. */
async function ouvrirCapture({ fichierHtml, largeur, hauteur, navigateur, gpu = false, delai = 30000, ouvrir = ouvrirPage, parametres = {}, erreurs = false, cadre = null, transparent = false }) {
  const page = await ouvrir({ navigateur, largeur, hauteur, gpu, delai, options: OPTIONS_CAPTURE, ...(erreurs ? { erreurs: true } : {}) });
  try {
    // ?capture=1 : le lecteur ne prépare pas le son d'avance (il n'est rendu que si l'export le demande).
    const extra = Object.entries(parametres).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('');
    // Fond transparent : le fond par défaut de la page devient transparent (captures PNG à couche alpha).
    if (transparent) await page.envoyer('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await page.aller(`${pathToFileURL(fichierHtml).href}?capture=1${extra}`);
    const info = await page.evaluer(transparent ? PREPARER_DE(true) : PREPARER);
    if (cadre === 'telephone') {
      const T = require('../../moteur/cadres/telephone.js');
      const g = T.geometrie({ sortie: [largeur, hauteur], scene: [1080, 1920] });
      const fond = await page.evaluer("getComputedStyle(document.getElementById('pm-scene')).backgroundColor");
      await page.evaluer(CADRER(g, T.svg(g, { fond })));
    }
    // Exceptions relevées seulement après la préparation : celles du chargement ne changeaient déjà pas l'export.
    const exceptions = [];
    if (erreurs && page.surEvenement) {
      page.surEvenement('Runtime.exceptionThrown', (p) => {
        const d = (p && p.exceptionDetails) || {};
        const texte = (d.exception && d.exception.description) || d.text || 'erreur de script';
        // « ResizeObserver loop… » : avertissement du navigateur, jamais une erreur de la vidéo.
        if (!/ResizeObserver/.test(texte)) exceptions.push(texte);
      });
    }
    const verifier = (t) => { if (exceptions.length) throw erreurDeScript(sceneA(info.scenes, t), t, exceptions[0]); };
    return {
      duree: info.duree,
      minutage: { duree: info.duree, scenes: info.scenes },
      async capturer(t, profil) {
        let mesure;
        try {
          mesure = await page.evaluer(instant(t));
        } catch (e) {
          // Exception levée par le moteur pendant M.seek : la même erreur, avec la scène et l'instant.
          if (!erreurs || /le navigateur s'est arrêté|délai dépassé/.test(e.message)) throw e;
          throw erreurDeScript(sceneA(info.scenes, t), t, e.message);
        }
        const [seek, particules] = mesure;
        if (profil) { profil('seek', seek); profil('particules', particules); }
        verifier(t);
        const png = await page.capturer({ profil });
        verifier(t);
        return png;
      },
      /** Image JPEG de l'instant t (couverture, planches du PDF) : sous-titres masqués par défaut. */
      async capturerJpeg(t, { qualite = 90, sansSousTitres = true } = {}) {
        if (sansSousTitres) await page.evaluer(SOUS_TITRES(true));
        try {
          await page.evaluer(instant(t));
          verifier(t);
          return await page.capturer({ format: 'jpeg', qualite });
        } finally {
          if (sansSousTitres) await page.evaluer(SOUS_TITRES(false)).catch(() => {});
        }
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

module.exports = { ouvrirCapture, OPTIONS_CAPTURE, sceneA, erreurDeScript };
