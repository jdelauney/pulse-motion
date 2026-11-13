'use strict';
/* Pulse Motion – imiter une animation ou une vidéo fournie (spec S9, 5.15 ; C16) : on imite une manière (rythme, mouvements,
 * courbes, couleurs, « main »), jamais une œuvre. La référence sert seulement à mesurer : elle n'entre jamais dans la vidéo
 * (règle reference-embarquee de l'assemblage), aucune adresse internet n'est lue, rien n'est téléchargé.
 *
 * analyser({ projet, source, de?, a?, zone?, couleurs?, etape?, nom?, niveau?, navigateur, dossierStyles? })
 *   source : un fichier du dossier (GIF, WebP ou PNG animés ; MP4, WebM, MOV…), copié dans assets/references/, ou une prise de
 *   « filmer » (films/<nom>[/prise-NN], étape la plus animée ou --etape) : un site se filme d'abord, avec l'accord de S6.
 *   Décodage dans Chrome sans fenêtre (page d'aide de l'import de S6 : ImageDecoder pour une animation, Mediabunny pour une
 *   vidéo, images de la prise), sans ffmpeg ; 10 s ou 600 images au plus. Écrit sortie/imiter/<nom>/ : planche-NN.png
 *   (24 images, « #i  t s »), activite.json et activite.png, fenetres.json, suivi.json (avec --couleurs), couleurs.json,
 *   main.json, analyse.json, fiche.md (squelette, à compléter), images/NNNN.jpg (vignettes de la comparaison).
 *   -> { ok, nom, dossier, source, planches, fenetres, coupes, tenues, suivi, couleurs, main, styles, fiche, jetonsEstimes, alertes }
 *   | { ok: false, erreur, message, conseil?, besoin? }
 * comparer({ projet, nom, scene, niveau?, navigateur, dossierStyles? }) : la scène rendue à la cadence de la référence
 *   (capture fidèle), courbe d'activité, alignement (± 15 images), écarts de début, de fin et de pic de chaque mouvement,
 *   planche « référence | notre scène ». -> { ok, scene, niveau, decalage, ecarts, ecartMax, conforme, phrases, planches, alertes }
 * Idées : reanimate (MIT) et rossark-motion-skill (MIT), voir imiter-analyse.js et THIRD-PARTY-NOTICES.md. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const A = require('./imiter-analyse.js');
const I = require('./import.js');
const F = require('./film.js');
const Fm = require('../../moteur/film.js');
const Pa = require('./parcours.js');
const { ouvrirPage } = require('./cdp.js');

const REFERENCES = path.join('assets', 'references');
const LOTTIE = ['.json', '.lottie'];
const COTE_DECODAGE = 960;
const COTE_SUIVI = 640;
const VIGNETTE = 256;
const COMPARAISON_LARGEUR = 320;
// Lottie (spec S9, 5.11) : l'animation se pose telle quelle dans une scène (pulse-motion lottie importer), avec sa licence ;
// l'imiter ne servirait qu'à refaire son mouvement avec d'autres images : on l'exporte alors en GIF ou en MP4.
const MESSAGE_LOTTIE = 'Une animation Lottie n\'a pas besoin d\'être imitée : je peux la poser telle quelle dans une scène, avec sa licence. Pour reprendre seulement son mouvement avec vos propres images, exportez-la en GIF ou en MP4 (votre logiciel d\'animation sait le faire), puis déposez ce fichier dans le dossier de la vidéo.';
const CONSEIL_LOTTIE = 'Pour la poser dans une scène : pulse-motion lottie importer <fichier> (pulse-motion reference lottie).';
const CONSEIL_SITE = 'Pour imiter l\'animation d\'un site, je peux d\'abord la filmer, avec votre accord (/pulse-motion:filmer), puis imiter la prise.';
const MESSAGE_FORMAT = 'Chrome ne sait pas lire ce fichier : exportez-le en MP4 ou en GIF, puis redéposez-le.';

const rel = (projet, f) => path.relative(projet, f).split(path.sep).join('/');
const dossierImitation = (projet, nom) => path.join(projet, 'sortie', 'imiter', nom);
const jetonsImage = (l, h) => Math.min(1600, Math.ceil(l * h / 750));
const empreinte = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** Un chemin du dossier des références (assets/references/). */
function estReference(projet, absolu) {
  const r = path.resolve(projet, REFERENCES);
  const a = path.resolve(absolu);
  return a === r || a.startsWith(r + path.sep);
}

/** Prise de « filmer » : films/<film>[/prise-NN] ; l'étape la plus animée, ou celle demandée. */
function resoudrePrise(projet, morceaux, { etape, nom }) {
  const film = morceaux[1];
  if (!Pa.NOM.test(film || '')) return { ok: false, erreur: 'prise', message: `Film « ${film} » : nom invalide.` };
  const liste = F.prises(projet, film);
  const parcours = F.lireParcoursBrut(projet, film) || {};
  const prise = morceaux[2] || parcours.prise || (liste.length ? liste[liste.length - 1].prise : null);
  if (!prise) return { ok: false, erreur: 'prise', message: `Le film « ${film} » n'a encore aucune prise : le filmer d'abord.` };
  const { film: f, dossier, erreurs } = F.lireFilm(projet, film, prise);
  if (!f || erreurs.length) return { ok: false, erreur: 'prise', message: erreurs[0] || `Film « ${film} » illisible.` };
  const cadence = f.cadence || 30;
  const animees = (f.etapes || []).filter((e) => Array.isArray(e.reaction) && e.reaction.length >= 2);
  let e;
  if (etape !== undefined && etape !== null) e = animees.find((x) => x.n === Number(etape));
  else e = animees.slice().sort((x, y) => Fm.dureeReaction(y, cadence) - Fm.dureeReaction(x, cadence) || x.n - y.n)[0];
  if (!e) return { ok: false, erreur: 'prise', message: `La prise « ${prise} » du film « ${film} » n'a ${etape ? `pas d'étape ${etape} où l'écran bouge` : 'aucune étape où l\'écran bouge'} : choisir une étape où l'écran réagit.` };
  const duree = Fm.dureeReaction(e, cadence);
  const reaction = e.reaction.slice().sort((x, y) => x[0] - y[0]);
  const images = [];
  for (let k = 0; k / cadence < duree - 1e-9; k++) {
    const ms = k * 1000 / cadence;
    let n = e.avant || reaction[0][1];
    for (const [t, im] of reaction) { if (t <= ms + 1e-6) n = im; else break; }
    images.push({ t: Math.round(k / cadence * 1000) / 1000, n });
  }
  return { ok: true, sorte: 'prise', nom: nom || `${film}-etape-${e.n}`, dossierImages: path.join(dossier, 'images'), images,
    origine: `films/${film}/${prise}`, etape: e.n };
}

/** Source -> { ok, sorte, fichier, type, nom, origine, copie } ; la référence est copiée dans assets/references/. */
function resoudreSource({ projet, source, nom, etape }) {
  if (A.estAdresse(source)) return { ok: false, erreur: 'adresse', message: A.REFUS_ADRESSE, conseil: CONSEIL_SITE };
  if (nom !== undefined && nom !== null && !Pa.NOM.test(String(nom))) return { ok: false, erreur: 'nom', message: `« ${nom} » : a-z, 0-9 et des tirets.` };
  const absolu = path.resolve(projet, String(source || ''));
  const morceaux = path.relative(projet, absolu).split(path.sep);
  if (morceaux[0] === 'films' && morceaux.length >= 2 && fs.existsSync(absolu) && fs.statSync(absolu).isDirectory()) return resoudrePrise(projet, morceaux, { etape, nom });
  if (!source || !fs.existsSync(absolu) || !fs.statSync(absolu).isFile()) return { ok: false, erreur: 'fichier', message: `Fichier « ${source} » introuvable : le déposer dans le dossier de la vidéo.` };
  const ext = path.extname(absolu).toLowerCase();
  if (LOTTIE.includes(ext)) return { ok: false, erreur: 'lottie', message: MESSAGE_LOTTIE, conseil: CONSEIL_LOTTIE };
  const sorte = I.VIDEOS.includes(ext) ? 'video' : I.ANIMATIONS[ext] ? 'animation' : null;
  if (!sorte) return { ok: false, erreur: 'format', message: `« ${path.basename(absolu)} » : une vidéo (${I.VIDEOS.join(', ')}) ou une animation (.gif, WebP ou PNG animés).` };
  let n = nom || Pa.siteReduit(path.basename(absolu, ext));
  let fichier = absolu;
  if (!estReference(projet, absolu)) {
    // Copie dans assets/references/ (même contenu déjà copié : repris ; même nom, autre contenu : nom-2, nom-3…).
    const dossier = path.join(projet, REFERENCES);
    fs.mkdirSync(dossier, { recursive: true });
    const base = n;
    for (let k = 2; ; k++) {
      const cible = path.join(dossier, `${n}${ext}`);
      if (!fs.existsSync(cible)) { fs.copyFileSync(absolu, cible); fichier = cible; break; }
      if (fs.statSync(cible).size === fs.statSync(absolu).size && empreinte(cible) === empreinte(absolu)) { fichier = cible; break; }
      if (nom) return { ok: false, erreur: 'nom', message: `Une autre référence s'appelle déjà « ${n} » : choisir un autre nom.` };
      n = `${base}-${k}`;
    }
  }
  return { ok: true, sorte, fichier, type: sorte === 'animation' ? I.ANIMATIONS[ext] : 'application/octet-stream', nom: n, origine: path.basename(absolu), copie: rel(projet, fichier) };
}

// Page d'aide (module) : décodage image par image, réduction à 160 px, suivi des bords, planches, vignettes, images clés.
const PAGE = `<!doctype html><meta charset="utf-8"><title>Pulse Motion – imitation</title>
<script src="/_pm/imiter-analyse.js"></script>
<script type="module">
import { Input, BlobSource, ALL_FORMATS, CanvasSink } from '/_pm/vendor/mediabunny.min.mjs';
const P = window.PMImiter;
const S = {};
function en64(blob) { return new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1]); f.readAsDataURL(blob); }); }
function octets64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); }
function toile(l, h) { const c = new OffscreenCanvas(l, h); const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; return [c, x]; }
async function imagePrise(n) {
  if (S.cache && S.cache.n === n) return S.cache.b;
  const b = await createImageBitmap(await (await fetch('/_pm/image/' + encodeURIComponent(n))).blob());
  if (S.cache) S.cache.b.close();
  S.cache = { n, b };
  return b;
}
function etiqueter(x, texte, X, Y) { x.fillStyle = '#fff'; x.font = '600 15px system-ui, sans-serif'; x.textBaseline = 'middle'; x.fillText(texte, X, Y); }
function nouvellePlanche() {
  const m = S.mise;
  S.planche = toile(m.L, m.H); S.dansPlanche = 0; S.premiere = S.rang;
  const x = S.planche[1]; x.fillStyle = '#111'; x.fillRect(0, 0, m.L, m.H);
}
async function fermerPlanche() {
  if (!S.planche || !S.dansPlanche) return null;
  const m = S.mise, x = S.planche[1];
  x.fillStyle = '#fff'; x.font = '600 20px system-ui, sans-serif'; x.textBaseline = 'middle';
  x.fillText(S.titre + ' · images ' + (S.premiere + 1) + ' à ' + S.rang, m.ecart, m.titre / 2);
  const rangees = Math.ceil(S.dansPlanche / m.colonnes);
  const H = m.titre + rangees * (m.hauteur + m.legende) + (rangees + 1) * m.ecart;
  const [c2, x2] = toile(m.L, H); x2.drawImage(S.planche[0], 0, 0);
  S.planche = null;
  return en64(await c2.convertToBlob({ type: 'image/png' }));
}
async function traiter(src, t) {
  const L = S.L, H = S.H, i = S.rang;
  const r = { t };
  // Réduction : 320 px dans la toile (rééchantillonnage du navigateur), puis 160 px par moyenne de surfaces (comme la scène).
  const l320 = Math.min(320, L), h320 = Math.max(1, Math.round(H * l320 / L));
  const [c3, x3] = toile(l320, h320); x3.drawImage(src, 0, 0, l320, h320);
  const p = P.reduire(P.sansAlpha(x3.getImageData(0, 0, l320, h320).data), l320, h320, P.LARGEUR);
  r.petite = octets64(p.rgb); r.largeur = p.largeur; r.hauteur = p.hauteur;
  if (S.couleurs) {
    const k = Math.min(1, ${COTE_SUIVI} / Math.max(L, H)), ls = Math.max(1, Math.round(L * k)), hs = Math.max(1, Math.round(H * k));
    const [cs, xs] = toile(ls, hs); xs.drawImage(src, 0, 0, ls, hs);
    const z = S.zone ? [S.zone[0] / 100 * ls, S.zone[1] / 100 * hs, S.zone[2] / 100 * ls, S.zone[3] / 100 * hs] : null;
    const b = P.bordsSujet(xs.getImageData(0, 0, ls, hs).data, ls, hs, S.couleurs, { canaux: 4, zone: z });
    r.bords = b ? { haut: b.haut / hs * 100, bas: b.bas / hs * 100, gauche: b.gauche / ls * 100, droite: b.droite / ls * 100 } : null;
  }
  const lv = Math.min(${VIGNETTE}, L), hv = Math.max(1, Math.round(H * lv / L));
  const [cv, xv] = toile(lv, hv); xv.drawImage(src, 0, 0, lv, hv);
  r.vignette = await en64(await cv.convertToBlob({ type: 'image/jpeg', quality: 0.82 }));
  // Images clés de la « main » : la première, celle du milieu du passage, la dernière (en gris, 640 px au plus).
  const cle = i === 0 ? 'premiere' : (!S.cles.milieu && t >= S.milieu - 1e-6) ? 'milieu' : 'derniere';
  {
    const k = Math.min(1, ${COTE_SUIVI} / Math.max(L, H)), lg = Math.max(1, Math.round(L * k)), hg = Math.max(1, Math.round(H * k));
    const [cg, xg] = toile(lg, hg); xg.drawImage(src, 0, 0, lg, hg);
    const d = xg.getImageData(0, 0, lg, hg).data, g = new Uint8Array(lg * hg);
    for (let j = 0, q = 0; j < d.length; j += 4) g[q++] = Math.round(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]);
    S.cles[cle] = { gris: g, largeur: lg, hauteur: hg };
  }
  // Planche : 24 images, 6 colonnes, étiquette « #i  t s ».
  if (!S.planche) nouvellePlanche();
  const m = S.mise, col = S.dansPlanche % m.colonnes, lig = Math.floor(S.dansPlanche / m.colonnes);
  const X = m.ecart + col * (m.largeur + m.ecart), Y = m.titre + m.ecart + lig * (m.hauteur + m.legende + m.ecart);
  S.planche[1].drawImage(src, X, Y, m.largeur, m.hauteur);
  etiqueter(S.planche[1], P.etiquette(i, t), X + 4, Y + m.hauteur + m.legende / 2);
  S.dansPlanche++; S.rang++;
  if (S.dansPlanche === m.parPlanche) r.planche = await fermerPlanche();
  return r;
}
window.__pmImiter = {
  async sonder(sorte, type, images) {
    S.sorte = sorte;
    if (sorte === 'prise') {
      S.images = images;
      const b = await imagePrise(images[0].n);
      const d = images.length > 1 ? images[images.length - 1].t + (images[1].t - images[0].t) : 1 / 30;
      return { duree: d, largeur: b.width, hauteur: b.height, decodable: true };
    }
    S.blob = await (await fetch('/_pm/source')).blob();
    if (sorte === 'animation') {
      if (typeof ImageDecoder === 'undefined') return { erreur: 'format' };
      try {
        S.dec = new ImageDecoder({ data: await S.blob.arrayBuffer(), type });
        await S.dec.tracks.ready; await S.dec.completed;
      } catch (e) { return { erreur: 'format' }; }
      const n = S.dec.tracks.selectedTrack.frameCount;
      S.temps = []; let t = 0, L = 0, H = 0;
      for (let k = 0; k < n; k++) {
        const { image: f } = await S.dec.decode({ frameIndex: k });
        S.temps.push(Math.round(t * 1e6) / 1e6); t += (f.duration || 100000) / 1e6; L = f.displayWidth; H = f.displayHeight; f.close();
      }
      return { duree: Math.round(t * 1e6) / 1e6, largeur: L, hauteur: H, decodable: true, images: n };
    }
    S.input = new Input({ source: new BlobSource(S.blob), formats: ALL_FORMATS });
    let piste;
    try { piste = await S.input.getPrimaryVideoTrack(); } catch (e) { return { erreur: 'format' }; }
    if (!piste) return { erreur: 'piste' };
    S.piste = piste;
    return { duree: await S.input.computeDuration(), largeur: piste.displayWidth, hauteur: piste.displayHeight, decodable: await piste.canDecode() };
  },
  demarrer(o) {
    Object.assign(S, { L: o.largeur, H: o.hauteur, de: o.de, a: o.a, max: o.max, couleurs: o.couleurs, zone: o.zone, mise: o.mise, titre: o.titre,
      rang: 0, k: 0, planche: null, cles: {}, milieu: (o.de + o.a) / 2, tronque: false });
    if (S.sorte === 'animation') {
      S.indices = S.temps.map((t, k) => k).filter((k) => S.temps[k] + 1e-6 >= o.de && S.temps[k] < o.a - 1e-9);
      const avant = S.temps.map((t, k) => k).filter((k) => S.temps[k] < o.de - 1e-9).pop();
      if (avant !== undefined && (!S.indices.length || S.temps[S.indices[0]] > o.de + 1e-6)) S.indices.unshift(avant);
    } else if (S.sorte === 'prise') {
      S.indices = S.images.map((x, k) => k).filter((k) => S.images[k].t + 1e-6 >= o.de && S.images[k].t < o.a - 1e-9);
    } else {
      S.iter = new CanvasSink(S.piste, { width: o.largeur, height: o.hauteur, fit: 'fill', poolSize: 2 }).canvases(o.de, o.a)[Symbol.asyncIterator]();
    }
    return true;
  },
  async suivantes(n) {
    const r = [];
    for (let i = 0; i < n; i++) {
      if (S.rang >= S.max) { S.tronque = true; break; }
      if (S.sorte === 'animation') {
        if (S.k >= S.indices.length) break;
        const k = S.indices[S.k++];
        const { image: f } = await S.dec.decode({ frameIndex: k });
        // L'image en cours au début du passage compte à partir de ce début.
        r.push(await traiter(f, Math.max(S.temps[k], S.de)));
        f.close();
      } else if (S.sorte === 'prise') {
        if (S.k >= S.indices.length) break;
        const x = S.images[S.indices[S.k++]];
        r.push(await traiter(await imagePrise(x.n), x.t));
      } else {
        const x = await S.iter.next();
        if (x.done) break;
        r.push(await traiter(x.value.canvas, Math.round(x.value.timestamp * 1e6) / 1e6));
      }
    }
    return r;
  },
  async finir() {
    const planche = await fermerPlanche();
    const cles = ['premiere', 'milieu', 'derniere'].filter((c) => S.cles[c]).map((c) => ({ cle: c, gris: octets64(S.cles[c].gris), largeur: S.cles[c].largeur, hauteur: S.cles[c].hauteur }));
    return { planche, cles, tronque: S.tronque, images: S.rang };
  },
  async graphique(g) {
    const L = 1200, H = 340, ml = 64, mr = 20, mh = 44, mb = 40;
    const [c, x] = toile(L, H);
    x.fillStyle = '#fff'; x.fillRect(0, 0, L, H);
    const t0 = g.de, t1 = Math.max(g.a, t0 + 1e-3);
    const ymax = Math.max(g.seuil * 4, ...g.activite) * 1.1;
    const X = (t) => ml + (t - t0) / (t1 - t0) * (L - ml - mr);
    const Y = (v) => H - mb - v / ymax * (H - mh - mb);
    x.fillStyle = 'rgba(37, 99, 235, 0.14)';
    for (const f of g.fenetres) x.fillRect(X(f.debut), mh, Math.max(2, X(f.fin) - X(f.debut)), H - mh - mb);
    x.strokeStyle = '#999'; x.setLineDash([6, 4]); x.beginPath(); x.moveTo(ml, Y(g.seuil)); x.lineTo(L - mr, Y(g.seuil)); x.stroke(); x.setLineDash([]);
    x.strokeStyle = '#dc2626'; x.lineWidth = 2;
    for (const k of g.coupes) { x.beginPath(); x.moveTo(X(k.t), mh); x.lineTo(X(k.t), H - mb); x.stroke(); }
    x.strokeStyle = '#1d4ed8'; x.lineWidth = 2; x.beginPath();
    g.temps.forEach((t, i) => { const v = Math.min(g.activite[i], ymax); if (i) x.lineTo(X(t), Y(v)); else x.moveTo(X(t), Y(v)); });
    x.stroke();
    x.fillStyle = '#111'; x.font = '600 18px system-ui, sans-serif'; x.textBaseline = 'middle';
    x.fillText(g.titre, ml, mh / 2);
    x.font = '14px system-ui, sans-serif'; x.fillStyle = '#555';
    x.fillText('0,5 %', 8, Y(g.seuil));
    const pas = t1 - t0 > 6 ? 1 : t1 - t0 > 2 ? 0.5 : 0.25;
    for (let t = Math.ceil(t0 / pas) * pas; t <= t1 + 1e-9; t += pas) { x.fillText(String(Math.round(t * 100) / 100).replace('.', ',') + ' s', X(t) - 14, H - mb / 2); }
    return en64(await c.convertToBlob({ type: 'image/png' }));
  },
};
window.__pmImiterPret = true;
</script>`;

/** Taille de décodage : 960 px au plus sur le grand côté, dimensions paires. */
function tailleDecodage(L, H) {
  const k = Math.min(1, COTE_DECODAGE / Math.max(L, H));
  const pair = (x) => Math.max(2, 2 * Math.round(x * k / 2));
  return [pair(L), pair(H)];
}

function lireZone(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = String(v).split(',').map((x) => Number(String(x).trim().replace('%', '')));
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x) || x < 0 || x > 100) || n[2] <= 0 || n[3] <= 0) return undefined;
  return n;
}
function lireCouleurs(v) {
  if (v === undefined || v === null || v === '') return null;
  const c = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean).map((x) => (x.startsWith('#') ? x : `#${x}`).toLowerCase());
  return c.length && c.every((x) => /^#[0-9a-f]{6}$/.test(x)) ? c : undefined;
}

/** Identités des styles du catalogue (et personnels), pour le style le plus proche. */
function identitesStyles(dossierStyles) {
  const St = require('../styles.js');
  const r = [];
  for (const f of St.listerStyles(dossierStyles)) {
    const s = St.trouverStyle(f.style, dossierStyles);
    try { r.push({ style: f.style, ...JSON.parse(fs.readFileSync(path.join(s.dossier, 'identite.json'), 'utf8')) }); } catch { /* style sans identité */ }
  }
  return r;
}

const ecrire = (f, o) => fs.writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`, 'utf8');

async function analyser({ projet, source, de, a, zone, couleurs, etape, nom, niveau = 'esprit', navigateur, dossierStyles }) {
  projet = path.resolve(projet || '.');
  if (!A.NIVEAUX[niveau]) return { ok: false, erreur: 'niveau', message: `Niveau « ${niveau} » : « esprit » (dans l'esprit) ou « mouvement » (même mouvement). Une copie au pixel est refusée.` };
  const z = lireZone(zone);
  if (z === undefined) return { ok: false, erreur: 'zone', message: 'Zone : « x,y,l,h » en % de l\'image (ex. 10,20,30,40).' };
  const c = lireCouleurs(couleurs);
  if (c === undefined) return { ok: false, erreur: 'couleurs', message: 'Couleurs du sujet : « #rrggbb » séparées par des virgules (ex. #e11d48,#1d4ed8).' };
  const s = resoudreSource({ projet, source, nom, etape });
  if (!s.ok) return s;
  const t0 = I.lireInstant(de);
  const t1 = I.lireInstant(a);
  if ((de !== undefined && de !== null && t0 === null) || (a !== undefined && a !== null && t1 === null)) return { ok: false, erreur: 'extrait', message: 'Passage illisible : « 0:12 », « 1:05 » ou un nombre de secondes.' };
  if (!navigateur) return { ok: false, erreur: 'navigateur', message: 'Chrome ou Edge est introuvable : il en faut un pour regarder la référence.' };

  const vide = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-imiter-')), 'vide.bin');
  fs.writeFileSync(vide, Buffer.alloc(1));
  const routes = { '/_pm/imiter-analyse.js': [() => fs.readFileSync(path.join(__dirname, 'imiter-analyse.js')), 'text/javascript; charset=utf-8'] };
  const routeVariable = (chemin) => {
    const m = /^\/_pm\/image\/([^/]+)$/.exec(chemin);
    if (!m || s.sorte !== 'prise') return null;
    const n = decodeURIComponent(m[1]);
    if (!/^[a-z0-9._-]+$/i.test(n) || n.startsWith('.')) return null;
    const f = path.join(s.dossierImages, n);
    if (!fs.existsSync(f)) return null;
    return [() => fs.readFileSync(f), /\.webp$/i.test(n) ? 'image/webp' : /\.png$/i.test(n) ? 'image/png' : 'image/jpeg'];
  };
  let aide = null;
  let page = null;
  const dossier = dossierImitation(projet, s.nom);
  try {
    aide = await I.servirAide(s.fichier || vide, s.type || 'application/octet-stream', { page: PAGE, routes, routeVariable });
    page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 400, delai: 180000 });
    await page.aller(aide.url);
    for (let i = 0; i < 200 && !(await page.evaluer('!!window.__pmImiterPret')); i++) await new Promise((r) => setTimeout(r, 50));
    const info = await page.evaluer(`window.__pmImiter.sonder(${JSON.stringify(s.sorte)}, ${JSON.stringify(s.type || '')}, ${JSON.stringify(s.images || null)})`);
    if (info.erreur === 'piste') return { ok: false, erreur: 'format', message: 'Ce fichier ne contient aucune image.' };
    if (info.erreur || !info.decodable) return { ok: false, erreur: 'format', message: MESSAGE_FORMAT };
    const debut = Math.min(t0 || 0, info.duree);
    const fin = Math.min(t1 === null ? info.duree : t1, info.duree);
    if (!(fin > debut)) return { ok: false, erreur: 'extrait', message: `Le passage est vide (la référence dure ${A.virgule(info.duree, 1)} s).` };
    if (fin - debut > A.DUREE_MAX + 1e-6) {
      return { ok: false, besoin: 'extrait', duree: Math.round(info.duree * 10) / 10,
        message: `La référence dure ${A.virgule(info.duree, 1)} s : j'en mesure 10 secondes au plus. Dire le passage à imiter (début et fin).` };
    }
    const [L, H] = tailleDecodage(info.largeur, info.hauteur);
    const mise = A.misePlanche(L, H);
    fs.rmSync(dossier, { recursive: true, force: true });
    fs.mkdirSync(path.join(dossier, 'images'), { recursive: true });
    await page.evaluer(`window.__pmImiter.demarrer(${JSON.stringify({ de: debut, a: fin, max: A.IMAGES_MAX, couleurs: c, zone: z, largeur: L, hauteur: H, mise, titre: `Référence « ${s.nom} »` })})`);

    const temps = [];
    const petites = [];
    const bords = [];
    const planches = [];
    const vignettes = [];
    const ecrirePlanche = (b64) => {
      const f = path.join(dossier, `planche-${String(planches.length + 1).padStart(2, '0')}.png`);
      fs.writeFileSync(f, Buffer.from(b64, 'base64'));
      planches.push(rel(projet, f));
    };
    for (;;) {
      const paquet = await page.evaluer('window.__pmImiter.suivantes(6)');
      if (!paquet.length) break;
      for (const im of paquet) {
        temps.push(im.t);
        petites.push({ rgb: new Uint8Array(Buffer.from(im.petite, 'base64')), largeur: im.largeur, hauteur: im.hauteur });
        bords.push(im.bords === undefined ? null : im.bords);
        const v = `images/${String(temps.length).padStart(4, '0')}.jpg`;
        fs.writeFileSync(path.join(dossier, v), Buffer.from(im.vignette, 'base64'));
        vignettes.push(v);
        if (im.planche) ecrirePlanche(im.planche);
      }
    }
    const fini = await page.evaluer('window.__pmImiter.finir()');
    if (fini.planche) ecrirePlanche(fini.planche);
    if (temps.length < 2) return { ok: false, erreur: 'format', message: 'La référence n\'a qu\'une image dans ce passage : rien ne bouge à mesurer.' };

    // Mesures.
    const act = A.activite(petites);
    const W = A.fenetres(temps, act, { fin });
    const parActivite = {};
    for (const f of W.fenetres) { const x = A.courbeParActivite(temps, act, f); if (x) parActivite[f.n] = x; }
    const suivi = c ? A.analyserSuivi(temps, bords.map((b) => (b ? { haut: b.haut, bas: b.bas, gauche: b.gauche, droite: b.droite } : null)), W) : null;
    const choisies = [];
    const nP = Math.min(12, petites.length);
    for (let k = 0; k < nP; k++) choisies.push(petites[Math.round(k * (petites.length - 1) / Math.max(1, nP - 1))]);
    const pal = A.palette(choisies, { graine: 1 });
    const mains = fini.cles.map((k) => A.mesurerMain(new Uint8Array(Buffer.from(k.gris, 'base64')), k.largeur, k.hauteur));
    const main = A.resumerMain(mains);
    const intervalles = [];
    for (let i = 1; i < temps.length; i++) intervalles.push(temps[i] - temps[i - 1]);
    const cadence = Math.max(1, Math.min(60, Math.round(1 / Math.max(1e-3, A.mediane(intervalles)))));
    const dureeMouvement = W.fenetres.length ? A.mediane(W.fenetres.map((f) => f.duree)) : null;
    const styles = A.stylesProches({ ton: pal.cle === 'sombre' ? 'sombre' : pal.cle === 'claire' ? 'clair' : null, main, dureeMouvement }, identitesStyles(dossierStyles));

    const png = await page.evaluer(`window.__pmImiter.graphique(${JSON.stringify({ temps, activite: act, fenetres: W.fenetres, coupes: W.coupes, seuil: W.seuil, de: debut, a: fin,
      titre: `Activité de « ${s.nom} » (écart moyen entre deux images ; bleu : mouvements, rouge : coupes)` })})`);
    fs.writeFileSync(path.join(dossier, 'activite.png'), Buffer.from(png, 'base64'));

    const src = { origine: s.origine, fichier: s.copie || null, sorte: s.sorte, de: Math.round(debut * 1000) / 1000, a: Math.round(fin * 1000) / 1000,
      images: temps.length, largeur: info.largeur, hauteur: info.hauteur, cadence, tronque: !!fini.tronque, ...(s.etape ? { etape: s.etape } : {}) };
    ecrire(path.join(dossier, 'activite.json'), { cadence, seuil: W.seuil, seuilBas: W.seuilBas, temps, activite: act });
    ecrire(path.join(dossier, 'fenetres.json'), { fenetres: W.fenetres, coupes: W.coupes, tenues: W.tenues, parActivite });
    if (suivi) ecrire(path.join(dossier, 'suivi.json'), { couleurs: c, zone: z, bords: bords.map((b, i) => ({ t: temps[i], ...(b ? Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 100) / 100])) : { absent: true }) })), ...suivi });
    ecrire(path.join(dossier, 'couleurs.json'), pal);
    ecrire(path.join(dossier, 'main.json'), { ...main, styles });
    const resume = { version: 1, nom: s.nom, niveau, source: src, planches, vignettes, fenetres: W.fenetres, coupes: W.coupes, tenues: W.tenues, parActivite,
      suivi: suivi ? suivi.mouvements : null, vie: suivi ? suivi.vie : [], couleurs: { fond: pal.fond, encre: pal.encre, accents: pal.accents, cle: pal.cle, contraste: pal.contraste, proposition: pal.proposition },
      main: main && main.phrase, styles };
    ecrire(path.join(dossier, 'analyse.json'), { ...resume, temps, activite: act });
    const fiche = path.join(dossier, 'fiche.md');
    fs.writeFileSync(fiche, A.ficheSquelette({ nom: s.nom, fichier: s.copie || s.origine, de: debut, a: fin, niveau, fenetres: W.fenetres, suivi: suivi && suivi.mouvements, parActivite }), 'utf8');
    const alertes = [];
    if (fini.tronque) alertes.push(`Le passage compte plus de ${A.IMAGES_MAX} images : seules les ${A.IMAGES_MAX} premières sont mesurées.`);
    if (!W.fenetres.length) alertes.push('Rien ne bouge dans ce passage (aucun écart de plus de 0,5 % entre deux images) : choisir un autre passage.');
    if (c && suivi && !suivi.mouvements.length) alertes.push('Le sujet n\'a pas été suivi : ses couleurs ne se retrouvent pas, ou il ne bouge pas. Vérifier les couleurs (et la zone) sur une planche.');
    return { ok: true, ...resume, dossier: rel(projet, dossier), fiche: rel(projet, fiche),
      jetonsEstimes: planches.length * jetonsImage(mise.L, mise.H), alertes };
  } catch (e) {
    if (/decod|codec|format/i.test(e.message)) return { ok: false, erreur: 'format', message: MESSAGE_FORMAT };
    return { ok: false, erreur: 'analyse', message: `L'analyse s'est arrêtée : ${e.message}` };
  } finally {
    if (page) await page.fermer().catch(() => {});
    if (aide) await aide.fermer().catch(() => {});
    fs.rmSync(path.dirname(vide), { recursive: true, force: true });
  }
}

// Composition de la planche de comparaison dans la page capturée : « référence | notre scène », une rangée par instant.
const OUTIL_COMPARAISON = `(function () {
  async function bitmap(b64, mime) { var s = atob(b64), o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return createImageBitmap(new Blob([o], { type: mime })); }
  function en64(blob) { return new Promise(function (ok) { var f = new FileReader(); f.onload = function () { ok(String(f.result).split(',')[1]); }; f.readAsDataURL(blob); }); }
  window.__pmComparaison = async function (rangees, titre) {
    var l = ${VIGNETTE}, premiere = await bitmap(rangees[0].ref, 'image/jpeg');
    var h = Math.round(l * premiere.height / premiere.width), e = 10, leg = 26, L = 2 * l + 3 * e + 150, H = 50 + 30 + rangees.length * (h + e) + e;
    var c = new OffscreenCanvas(L, H), x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, L, H);
    x.fillStyle = '#fff'; x.textBaseline = 'middle';
    x.font = '600 20px system-ui, sans-serif'; x.fillText(titre, e, 25);
    x.font = '600 16px system-ui, sans-serif'; x.fillText('référence', 150 + e, 65); x.fillText('notre scène', 150 + 2 * e + l, 65);
    for (var i = 0; i < rangees.length; i++) {
      var Y = 80 + i * (h + e);
      var r = i === 0 ? premiere : await bitmap(rangees[i].ref, 'image/jpeg');
      var s = await bitmap(rangees[i].notre, 'image/png');
      x.drawImage(r, 150 + e, Y, l, h); x.drawImage(s, 150 + 2 * e + l, Y, l, h);
      x.font = '600 15px system-ui, sans-serif'; x.fillText(rangees[i].texte, e, Y + h / 2 - 10);
      x.font = '14px system-ui, sans-serif'; x.fillText(rangees[i].detail, e, Y + h / 2 + 12);
    }
    return en64(await c.convertToBlob({ type: 'image/png' }));
  };
  return true;
})()`;

const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };

async function comparer({ projet, nom, scene, niveau, navigateur, dossierStyles }) {
  projet = path.resolve(projet || '.');
  if (!Pa.NOM.test(String(nom || ''))) return { ok: false, erreur: 'nom', message: 'Donner le nom de l\'imitation (celui de son analyse).' };
  const dossier = dossierImitation(projet, nom);
  let analyse;
  try { analyse = JSON.parse(fs.readFileSync(path.join(dossier, 'analyse.json'), 'utf8')); } catch {
    return { ok: false, erreur: 'analyse', message: `Aucune analyse « ${nom} » : analyser la référence d'abord.` };
  }
  niveau = niveau || analyse.niveau || 'esprit';
  if (!A.NIVEAUX[niveau]) return { ok: false, erreur: 'niveau', message: `Niveau « ${niveau} » : « esprit » ou « mouvement ».` };
  const { lireDeroule } = require('./deroule.js');
  const { deroule, erreurs } = lireDeroule(projet);
  if (!deroule || erreurs.length) return { ok: false, erreur: 'deroule', message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  if (!scene || !deroule.scenes.some((x) => x.id === scene)) return { ok: false, erreur: 'scene', message: `Scène inconnue : ${scene || '(aucune)'} ; donner l'identifiant d'une scène du déroulé.` };
  const { assembler } = require('../assembler.js');
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!assemblage.ok) return { ok: false, erreur: 'assemblage', message: `La page ne s'assemble pas : ${assemblage.erreurs.filter((e) => e.gravite === 'erreur').map((e) => e.message).join(' ')}` };
  if (!navigateur) return { ok: false, erreur: 'navigateur', message: 'Chrome ou Edge introuvable : la scène n\'a pas pu être rendue.' };
  const { ouvrirCapture } = require('./capture-fidele.js');
  const { avecEffets } = require('../export-fidele.js');
  const P = require('./png.js');
  const [ra, rb] = RATIOS[deroule.format.ratio] || RATIOS['16:9'];
  const largeur = COMPARAISON_LARGEUR;
  const hauteur = 2 * Math.round(largeur * rb / ra / 2);
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-imiter-comparer-'));
  const pageVideo = path.join(travail, 'video.html');
  fs.writeFileSync(pageVideo, assemblage.html, 'utf8');
  let capture;
  try {
    capture = await ouvrirCapture({ fichierHtml: pageVideo, largeur, hauteur, navigateur, gpu: avecEffets(projet, deroule), delai: 90000 });
  } catch (e) {
    fs.rmSync(travail, { recursive: true, force: true });
    return { ok: false, erreur: 'capture', message: `La scène n'a pas pu être rendue (${e.message}).` };
  }
  try {
    const sc = capture.minutage.scenes.find((x) => x.id === scene);
    const c = analyse.source.cadence || 30;
    const refDuree = analyse.source.a - analyse.source.de;
    const n = Math.min(A.IMAGES_MAX, Math.ceil(Math.min(sc.fin - sc.debut, refDuree + A.DECALAGE_MAX / c) * c - 1e-6));
    const rgbDe = (png) => {
      const d = P.decoder(png);
      const rgb = d.canaux === 4 ? A.sansAlpha(d.donnees) : d.donnees;
      return A.reduire(rgb, d.largeur, d.hauteur, A.LARGEUR);
    };
    const petites = [];
    const instants = [];
    for (let k = 0; k < n; k++) {
      const t = sc.debut + k / c;
      if (t >= capture.duree - 1e-6) break;
      instants.push(Math.round(k / c * 1e6) / 1e6);
      petites.push(rgbDe(await capture.capturer(t)));
    }
    if (petites.length < 2) return { ok: false, erreur: 'scene', message: `La scène « ${scene} » est trop courte pour être comparée.` };
    const act = A.activite(petites);
    const notre = A.fenetres(instants, act, { fin: petites.length / c });
    const refTemps = analyse.temps.map((t) => t - analyse.source.de);
    const refGrille = A.surGrille(refTemps, analyse.activite, 0, c, petites.length);
    const al = A.aligner(refGrille, act, c);
    const decalage = Math.round(al.decalage / c * 1000) / 1000;
    const refRel = analyse.fenetres.map((f) => ({ ...f, debut: f.debut - analyse.source.de, fin: f.fin - analyse.source.de, pic: f.pic - analyse.source.de }));
    const cmp = A.comparerFenetres(refRel, notre.fenetres, decalage, niveau);
    const phrases = cmp.phrases.slice();
    if (Math.abs(decalage) > A.ECART_MOUVEMENT) phrases.unshift(`Toute la scène est décalée de ${A.virgule(Math.abs(decalage), 2)} s par rapport à votre vidéo (elle bouge plus ${decalage > 0 ? 'tard' : 'tôt'}) : c'est normal si la scène commence par une transition ; sinon, ${decalage > 0 ? 'avancer' : 'retarder'} toute la scène.`);
    if (!phrases.length) phrases.push(niveau === 'mouvement' ? 'Chaque mouvement commence, culmine et finit à 0,08 s près de votre vidéo.' : 'Même nombre de mouvements, dans le même ordre que dans votre vidéo.');

    // Planche côte à côte : début, pic et fin de chaque mouvement apparié, quatre mouvements par planche.
    await capture.evaluer(OUTIL_COMPARAISON);
    const refImage = (tAbs) => {
      let k = 0;
      for (let i = 0; i < analyse.temps.length; i++) if (analyse.temps[i] <= tAbs + 1e-6) k = i;
      return fs.readFileSync(path.join(dossier, analyse.vignettes[k])).toString('base64');
    };
    for (const f of fs.readdirSync(dossier)) if (f.startsWith(`comparaison-${scene}`)) fs.rmSync(path.join(dossier, f), { force: true });
    const planches = [];
    const lots = [];
    for (let i = 0; i < cmp.ecarts.length; i += 4) lots.push(cmp.ecarts.slice(i, i + 4));
    for (const [k, lot] of lots.entries()) {
      const rangees = [];
      for (const e of lot) {
        for (const [quoi, cle] of [['début', 'debut'], ['pic', 'pic'], ['fin', 'fin']]) {
          const tRef = e.reference[cle];
          const tNotre = Math.min(capture.duree - 1e-3, sc.debut + e.scene[cle] + decalage);
          const png = await capture.capturer(tNotre);
          rangees.push({ ref: refImage(tRef + analyse.source.de), notre: png.toString('base64'), texte: `n° ${e.n} · ${quoi}`,
            detail: `${A.fixe(tRef)} s · écart ${e[cle] >= 0 ? '+' : '−'}${A.fixe(Math.abs(e[cle]))} s` });
        }
      }
      const b64 = await capture.evaluer(`window.__pmComparaison(${JSON.stringify(rangees)}, ${JSON.stringify(`« ${nom} » et la scène « ${scene} »${lots.length > 1 ? ` (${k + 1}/${lots.length})` : ''}`)})`);
      const nomPlanche = lots.length === 1 ? `comparaison-${scene}.png` : `comparaison-${scene}-${k + 1}.png`;
      fs.writeFileSync(path.join(dossier, nomPlanche), Buffer.from(b64, 'base64'));
      planches.push(rel(projet, path.join(dossier, nomPlanche)));
    }
    const alertes = [];
    const fiche = path.join(dossier, 'fiche.md');
    if (fs.existsSync(fiche)) {
      const v = A.verifierFiche(fs.readFileSync(fiche, 'utf8'));
      if (!v.ok) alertes.push(`La fiche n'est pas complète : ${v.manques.slice(0, 3).join(' ')}`);
    } else alertes.push('La fiche de l\'imitation manque (sortie/imiter/<nom>/fiche.md).');
    const r = { ok: true, nom, scene, niveau, cadence: c, decalage, alignement: al, fenetres: { reference: refRel.length, scene: notre.fenetres.length },
      ecarts: cmp.ecarts, ecartMax: cmp.ecartMax, conforme: cmp.conforme, phrases, planches, alertes };
    ecrire(path.join(dossier, `comparaison-${scene}.json`), r);
    return r;
  } finally {
    await capture.fermer().catch(() => {});
    fs.rmSync(travail, { recursive: true, force: true });
  }
}

/** fiche.md d'une imitation : complète ? */
function verifierFicheImitation({ projet, nom }) {
  projet = path.resolve(projet || '.');
  const f = path.join(dossierImitation(projet, String(nom || '')), 'fiche.md');
  if (!Pa.NOM.test(String(nom || '')) || !fs.existsSync(f)) return { ok: false, message: `Aucune fiche pour « ${nom} » : analyser la référence d'abord.` };
  return { ...A.verifierFiche(fs.readFileSync(f, 'utf8')), fiche: rel(projet, f) };
}

module.exports = { analyser, comparer, verifierFicheImitation, resoudreSource, estReference, tailleDecodage, lireZone, lireCouleurs, REFERENCES, PAGE, MESSAGE_LOTTIE, CONSEIL_SITE };
