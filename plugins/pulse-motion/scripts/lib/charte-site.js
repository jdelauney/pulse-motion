'use strict';
/* Pulse Motion – charte proposée depuis le site de l'entreprise (spec Retouches et ergonomie, 5.14).
 *
 * Lancée seulement après l'accord de la personne (D3) : la seule sortie sur le réseau, en dehors de la vidéo.
 * analyserSite({ adresse, navigateur?, delai?, attente? }) -> { ok, mesures } | { ok: false, message }
 *   - adresse http ou https seulement ;
 *   - Chrome ou Edge sans fenêtre (lib/cdp.js, lib/navigateur.js), profil temporaire neuf (aucun cookie), 1440 × 900 ;
 *   - chargement, puis 2 s ; 30 s au plus en tout ;
 *   - mesures dans la page : fond et texte (couleurs calculées de body et h1, fonds pondérés par leur surface visible), accent
 *     (couleur saturée, S ≥ 0,35 et 0,2 ≤ L ≤ 0,8, la plus étendue parmi les fonds des boutons et des liens, sinon la couleur
 *     des liens), polices (première famille de h1 et de body), logo (svg ou img de header ou nav dont l'id, la classe, l'alt
 *     ou la source contient « logo » ; puis l'icône SVG ou PNG de 64 px et plus ; puis og:image) ;
 *   - le logo est lu dans le contexte de la page, 2 Mo au plus. Aucun fichier de police n'est lu ni copié, aucun texte repris.
 * logoSur(svg) -> svg | null : le dessin passé par lib/svg-sur.js (formes simples seulement), sinon refusé.
 * Idées : explainroo src/capture.js (inspectPage, pickColors, rankLogos ; MIT, Vincent Schmalbach), adapté au CDP.
 */
const { ouvrirPage } = require('./cdp.js');
const { trouverNavigateur } = require('./navigateur.js');
const { verifierSVG } = require('./svg-sur.js');

const LARGEUR = 1440;
const HAUTEUR = 900;
const MAX_LOGO = 2 * 1024 * 1024;
const POLICES_BLOQUEES = ['*.woff2*', '*.woff*', '*.ttf*', '*.otf*', '*.eot*', '*fonts.googleapis.com*', '*fonts.gstatic.com*', '*use.typekit.net*', '*fonts.bunny.net*'];

/** Adresse admise ? -> URL | { message } */
function verifierAdresse(adresse) {
  let url;
  try { url = new URL(String(adresse || '').trim()); } catch { return { message: `Adresse illisible : « ${adresse || ''} ». Donnez l'adresse complète du site, qui commence par https://.` }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { message: 'Adresse refusée : seulement l\'adresse d\'un site, qui commence par http:// ou https://.' };
  return url;
}

// Mesures faites dans la page (une seule évaluation, rien d'écrit).
const MESURE = `(() => {
  const vue = { l: innerWidth, h: innerHeight };
  const rvb = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  const tsl = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2; const s = max === min ? 0 : (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)); return { s, l }; };
  const surface = (el) => { const b = el.getBoundingClientRect(); const l = Math.max(0, Math.min(b.right, vue.l) - Math.max(b.left, 0)); const h = Math.max(0, Math.min(b.bottom, vue.h) - Math.max(b.top, 0)); return l * h; };
  const visible = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.1; };
  // Fonds pondérés par surface visible.
  const fonds = new Map();
  const ajouter = (carte, cle, poids) => carte.set(cle, (carte.get(cle) || 0) + poids);
  const tous = [document.documentElement, document.body, ...document.body.querySelectorAll('*')].slice(0, 3000);
  for (const el of tous) {
    if (!visible(el)) continue;
    const c = rvb(getComputedStyle(el).backgroundColor);
    if (!c || c.a < 0.5) continue;
    const s = el === document.documentElement || el === document.body ? vue.l * vue.h : surface(el);
    if (s > 0) ajouter(fonds, hex(c), s);
  }
  const premier = (carte) => [...carte.entries()].sort((a, b) => b[1] - a[1])[0];
  const fond = (premier(fonds) || ['#ffffff'])[0];
  const texte = rvb(getComputedStyle(document.body).color);
  const h1 = document.querySelector('h1');
  const titre = h1 ? rvb(getComputedStyle(h1).color) : null;
  // Accent : fonds saturés des boutons et des liens, sinon couleur des liens.
  const sature = (c) => { const t = tsl(c); return t.s >= 0.35 && t.l >= 0.2 && t.l <= 0.8; };
  const accents = new Map();
  for (const el of document.querySelectorAll('button, a, [role=button], input[type=submit], input[type=button]')) {
    if (!visible(el)) continue;
    const c = rvb(getComputedStyle(el).backgroundColor);
    if (c && c.a >= 0.5 && sature(c)) ajouter(accents, hex(c), Math.max(1, surface(el)));
  }
  if (!accents.size) {
    for (const el of document.querySelectorAll('a')) {
      if (!visible(el)) continue;
      const c = rvb(getComputedStyle(el).color);
      if (c && sature(c)) ajouter(accents, hex(c), Math.max(1, (el.textContent || '').trim().length));
    }
  }
  const famille = (el) => el ? (getComputedStyle(el).fontFamily.split(',')[0] || '').replace(/["']/g, '').trim() : null;
  // Logo, par ordre.
  const dit = (el) => [el.id, el.getAttribute('class'), el.getAttribute('alt'), el.getAttribute('src'), el.getAttribute('aria-label')].join(' ').toLowerCase().includes('logo');
  let logo = null;
  for (const el of document.querySelectorAll('header svg, header img, nav svg, nav img, header a, nav a')) {
    const cible = el.matches('a') ? el.querySelector('svg, img') : el;
    if (!cible || !(dit(el) || dit(cible))) continue;
    if (cible.tagName.toLowerCase() === 'svg') { logo = { sorte: 'svg', svg: cible.outerHTML }; break; }
    if (cible.currentSrc || cible.src) { logo = { sorte: 'image', adresse: cible.currentSrc || cible.src }; break; }
  }
  if (!logo) {
    for (const l of document.querySelectorAll('link[rel~=icon]')) {
      const svg = /svg/.test(l.type || '') || /\\.svg(\\?|$)/i.test(l.href);
      const taille = Math.max(0, ...String(l.sizes || '').split(/\\s+/).map((x) => parseInt(x, 10) || 0));
      if (svg || (/png/.test(l.type || '') || /\\.png(\\?|$)/i.test(l.href)) && taille >= 64) { logo = { sorte: 'image', adresse: l.href }; break; }
    }
  }
  if (!logo) { const og = document.querySelector('meta[property="og:image"]'); if (og && og.content) logo = { sorte: 'image', adresse: new URL(og.content, location.href).href }; }
  return { fond, texte: texte ? hex(texte) : null, titre: titre ? hex(titre) : null, accent: (premier(accents) || [null])[0],
    polices: { titres: famille(h1), texte: famille(document.body) }, logo, vide: (document.body.innerText || '').trim().length < 20 && !document.querySelector('img, svg') };
})()`;

/** Lit une image dans le contexte de la page (mêmes cookies : aucun ; mêmes droits que la page). */
const LIRE = (adresse, max) => `(async () => {
  const r = await fetch(${JSON.stringify(adresse)});
  if (!r.ok) return { erreur: 'statut ' + r.status };
  const b = await r.blob();
  if (b.size > ${max}) return { erreur: 'trop lourd' };
  const t = new Uint8Array(await b.arrayBuffer());
  let s = ''; for (let i = 0; i < t.length; i += 0x8000) s += String.fromCharCode.apply(null, t.subarray(i, i + 0x8000));
  return { type: b.type || '', base64: btoa(s) };
})()`;

/** Dessin SVG du site réduit à ses formes simples (lib/svg-sur.js), ou null. */
function logoSur(svg) {
  const m = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(String(svg || ''));
  if (!m) return null;
  const attribut = (n) => { const x = new RegExp(`\\s${n}\\s*=\\s*"([^"]*)"`, 'i').exec(m[1]); return x ? x[1] : null; };
  const viewBox = attribut('viewBox') || (attribut('width') && attribut('height') ? `0 0 ${parseFloat(attribut('width'))} ${parseFloat(attribut('height'))}` : null);
  if (!viewBox || !/^[\d.\s-]+$/.test(viewBox)) return null;
  const interieur = m[2]
    .replace(/<(title|desc|defs|style|metadata)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\s(?:class|id|style|role|focusable|aria-[a-z-]+|data-[a-z-]+|xmlns(?::[a-z]+)?|xml:space|vector-effect|clip-rule)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .trim();
  if (!interieur || verifierSVG(interieur).length) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${interieur}</svg>`;
}

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

async function analyserSite({ adresse, navigateur = null, delai = 30000, attente = 2000 } = {}) {
  const url = verifierAdresse(adresse);
  if (url.message) return { ok: false, message: url.message };
  const chemin = navigateur || trouverNavigateur();
  if (!chemin) return { ok: false, message: 'Chrome ou Edge introuvable : il faut l\'un des deux pour lire le site.' };
  const debut = Date.now();
  const reste = () => Math.max(1000, delai - (Date.now() - debut));
  const limite = (promesse) => Promise.race([promesse, new Promise((_, rejeter) => setTimeout(() => rejeter(Object.assign(new Error('délai'), { delai: true })), reste()).unref())]);
  let page = null;
  try {
    // Délai des commandes du navigateur à part (démarrage lent sous charge) : le délai du site est tenu par limite().
    page = await ouvrirPage({ navigateur: chemin, largeur: LARGEUR, hauteur: HAUTEUR, delai: Math.max(delai, 30000) });
    // Aucun fichier de police n'est téléchargé : la famille se lit dans la feuille de style (police proposée ensuite par
    // Bunny Fonts, licence vérifiée), jamais dans les fichiers du site.
    await page.envoyer('Network.enable', {});
    await page.envoyer('Network.setBlockedURLs', { urls: POLICES_BLOQUEES });
    try { await limite(page.aller(url.href)); } catch (e) {
      if (e.delai) return { ok: false, message: `Le site « ${url.host} » n'a pas répondu en ${Math.round(delai / 1000)} s : vérifiez l'adresse, ou réessayez plus tard.` };
      return { ok: false, message: `Le site « ${url.host} » est injoignable : vérifiez l'adresse et la connexion à internet.` };
    }
    await new Promise((r) => setTimeout(r, attente));
    const mesures = await limite(page.evaluer(MESURE));
    if (mesures.vide) return { ok: false, message: `La page de « ${url.host} » est vide ou protégée : donnez plutôt le fichier du logo et vos couleurs.` };
    let logo = null;
    let messageLogo = null;
    if (mesures.logo && mesures.logo.sorte === 'svg') {
      const sur = logoSur(mesures.logo.svg);
      if (sur) logo = { extension: 'svg', donnees: Buffer.from(sur, 'utf8') };
      else messageLogo = 'Le logo du site est un dessin trop complexe pour être repris tel quel : demandez son fichier à la personne.';
    } else if (mesures.logo && mesures.logo.adresse) {
      const lu = await limite(page.evaluer(LIRE(mesures.logo.adresse, MAX_LOGO))).catch(() => ({ erreur: 'illisible' }));
      const type = lu && String(lu.type || '').split(';')[0].trim();
      if (lu && lu.base64 && EXTENSIONS[type]) {
        const donnees = Buffer.from(lu.base64, 'base64');
        if (type === 'image/svg+xml') {
          const sur = logoSur(donnees.toString('utf8'));
          if (sur) logo = { extension: 'svg', donnees: Buffer.from(sur, 'utf8') };
          else messageLogo = 'Le logo du site est un dessin trop complexe pour être repris tel quel : demandez son fichier à la personne.';
        } else logo = { extension: EXTENSIONS[type], donnees };
      } else messageLogo = lu && lu.erreur === 'trop lourd' ? 'Le logo du site pèse plus de 2 Mo : demandez son fichier à la personne.' : 'Le logo du site n\'a pas pu être lu : demandez son fichier à la personne.';
    } else messageLogo = 'Aucun logo trouvé sur le site : les couleurs sont gardées, demandez le fichier du logo à la personne.';
    return { ok: true, adresse: url.href, mesures: { fond: mesures.fond, texte: mesures.texte, titre: mesures.titre, accent: mesures.accent, polices: mesures.polices }, logo, messageLogo };
  } catch (e) {
    if (e && e.delai) return { ok: false, message: `Le site « ${url.host} » n'a pas répondu en ${Math.round(delai / 1000)} s : vérifiez l'adresse, ou réessayez plus tard.` };
    return { ok: false, message: `Le site « ${url.host} » n'a pas pu être lu (${(e && e.message) || e}).` };
  } finally {
    if (page) await page.fermer().catch(() => {});
  }
}

module.exports = { analyserSite, verifierAdresse, logoSur, MESURE };
