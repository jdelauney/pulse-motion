'use strict';
/* Pulse Motion – briques de la spec S9 côté Node : QR codes posés à l'assemblage (5.4), besoins de la page (feuille
 * moteur/briques.css, groupes trace et ken-burns, axes des polices variables) et contrôles sans navigateur.
 *
 * besoinsBriques(sections, donnees) -> { css, trace, kenBurns, variable } : d'après les sections assemblées (QR déjà posés)
 *   et pm-donnees (karaoké) ; rien de vrai pour une vidéo qui n'utilise aucune brique (sa page ne change pas).
 * preparerQR(html, { scene, textes, couleurs }) -> { html, erreurs, qr: [{ cle, texte, version, modules }] } : chaque
 *   <svg data-qr="cle"> reçoit le tracé du QR code du texte « cle » du déroulé (lib/qr.js) ; data-qr-correction (L, M, Q, H ;
 *   M par défaut), data-qr-encre et data-qr-fond (couleur de la charte par son nom, ou #rrggbb ; #000 sur #fff par défaut) ;
 *   classe pm-qr-compose : une rangée de modules par tracé (#135 « QR qui se compose »). Règles texte-manquant, qr-invalide.
 * donneesPolices(detailPolices) -> { famille: { axes } } des familles variables (M.donnees.polices, effet graisse).
 * controlerBriques({ deroule, scene, html, min, seuils, couleurs, detailPolices, css, dureeTemps }) -> problèmes :
 *   qr-long, qr-contraste, qr-trop-court, police-non-variable, sur-trace-invalide, ken-burns-invalide, trois-d-export-rapide.
 * scenesTroisD(projet, deroule) -> [id] des scènes en 2,5D avec perspective, que l'export rapide refuse (messageTroisD).
 */
const { encoderQR, svgQR, CORRECTIONS } = require('./qr.js');
const { contraste, luminance } = require('./couleurs.js');
const { parcourir, estMinute } = require('./extraire.js');
const { caracteristiquesPolice } = require('./police.js');
const { analyserSurTrace } = require('../../moteur/trace-texte.js');
const { lireKenBurns } = require('../../moteur/ken-burns.js');
const { analyserCamera } = require('../../moteur/camera.js');
const { analyserTween } = require('../../moteur/tween.js');

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const echapper = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Marques qui demandent moteur/briques.css (après l'assemblage : un QR porte data-pm-qr-modules).
const MARQUES_CSS = /\bpm-sur-trace\b|\sdata-sur-trace\s*=|<textPath\b|\bpm-variable\b|\sdata-(?:lettres|mots)\s*=\s*["'](?:fondu|graisse)["']|\bpm-texte-image\b|\bpm-m-masque-doux|\bpm-masque-forme\b|\sdata-pm-qr-modules\s*=|\sdata-ken-burns\s*=|\bpm-espace-3d\b|\bpm-3d-face\b|\bpm-m-retourne\b|\bpm-m-cube\b|\bpm-relief\b/;
const VARIABLE = /\bpm-variable\b|\sdata-(?:lettres|mots)\s*=\s*["']graisse["']|--pm-(?:wght|wdth|slnt)\b/;

function besoinsBriques(sections = [], donnees = {}) {
  const texte = sections.join('\n');
  const karaoke = !!(donnees && donnees.sousTitres && donnees.sousTitres.mode === 'karaoke');
  return {
    css: karaoke || MARQUES_CSS.test(texte),
    trace: /\sdata-sur-trace\s*=/.test(texte),
    kenBurns: /\sdata-ken-burns\s*=/.test(texte),
    variable: VARIABLE.test(texte),
  };
}

/** Couleur d'un QR code : nom d'une couleur de la charte, ou #rgb / #rrggbb. -> #rrggbb ou null. */
function couleurQR(valeur, couleurs) {
  const v = String(valeur || '').trim();
  const brute = /^#/.test(v) ? v : couleurs && Object.hasOwn(couleurs, v) ? String(couleurs[v]).trim() : null;
  if (!brute) return null;
  if (/^#[0-9a-f]{6}$/i.test(brute)) return brute.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(brute)) return `#${brute.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase();
  return null;
}

const SVG_QR = /<svg\b((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-qr\s*=\s*(["'])([^"']*)\2(?:[^>"']|"[^"]*"|'[^']*')*?)(\/>|>([\s\S]*?)<\/svg>)/gi;

function preparerQR(html, { scene, textes = {}, couleurs = {} } = {}) {
  const erreurs = [];
  const qr = [];
  const sortie = String(html).replace(SVG_QR, (tout, attributs, g, cle) => {
    const signaler = (regle, message) => erreurs.push({ regle, gravite: 'erreur', scene, element: cle, message: `Scène « ${scene} » : ${message}` });
    if (!Object.hasOwn(textes || {}, cle)) { signaler('texte-manquant', `data-qr="${cle}" n'a pas de texte dans le déroulé.`); return tout; }
    const lu = (nom) => { const m = new RegExp(`\\s${nom}\\s*=\\s*(["'])([^"']*)\\1`, 'i').exec(attributs); return m ? m[2] : null; };
    const correction = (lu('data-qr-correction') || 'M').toUpperCase();
    if (!CORRECTIONS.includes(correction)) { signaler('qr-invalide', `data-qr-correction « ${lu('data-qr-correction')} » : L, M, Q ou H.`); return tout; }
    const encre = couleurQR(lu('data-qr-encre') || '#000', couleurs);
    const fond = couleurQR(lu('data-qr-fond') || '#fff', couleurs);
    if (!encre || !fond) { signaler('qr-invalide', `couleur du QR code « ${cle} » inconnue (${!encre ? lu('data-qr-encre') : lu('data-qr-fond')}) : une couleur de la charte par son nom (texte, fond, primaire…) ou #rrggbb.`); return tout; }
    let code;
    try { code = encoderQR(textes[cle], { correction }); } catch (e) { signaler('qr-invalide', `QR code « ${cle} » : ${e.message}`); return tout; }
    const compose = /\sclass\s*=\s*["'][^"']*\bpm-qr-compose\b/.test(attributs);
    const marge = 4;
    let corps;
    const { viewBox, corps: plein } = svgQR(code, { encre, fond, marge });
    if (compose) {
      // Une rangée par tracé (--pm-i : son rang), pour la cascade de #135 ; le fond reste un seul rectangle.
      const fondSeul = plein.slice(0, plein.indexOf('<path'));
      const rangees = code.modules.map((l, y) => {
        const d = [];
        for (let x = 0; x < l.length; x++) {
          if (!l[x]) continue;
          let n = 1;
          while (x + n < l.length && l[x + n]) n++;
          d.push(`M${x + marge} ${y + marge}h${n}v1h-${n}z`);
          x += n - 1;
        }
        return d.length ? `<path fill="${encre}" style="--pm-i: ${y}" d="${d.join('')}"/>` : '';
      }).join('');
      corps = fondSeul + rangees;
    } else corps = plein;
    const garde = attributs.replace(/\s(?:viewBox|shape-rendering|role|aria-label|aria-hidden)\s*=\s*(["'])[^"']*\1/gi, '');
    qr.push({ cle, texte: textes[cle], version: code.version, modules: code.taille, encre, fond, correction });
    return `<svg${garde} viewBox="${viewBox}" shape-rendering="crispEdges" data-pm-qr-modules="${code.taille + marge * 2}" role="img" aria-label="QR code : ${echapper(textes[cle])}">${corps}</svg>`;
  });
  return { html: sortie, erreurs, qr };
}

/** Familles variables des polices embarquées : { famille: { axes } } (vide si aucune n'est variable). */
function donneesPolices(detailPolices) {
  const r = {};
  for (const p of detailPolices || []) {
    for (const f of p.fichiers || []) {
      const c = caracteristiquesPolice(f);
      if (c && c.axes.length) { r[p.famille] = { axes: c.axes }; break; }
    }
  }
  return r;
}

// Axes animés : propriétés de pm-variable, effet graisse (wght).
const AXE_DE = { '--pm-wght': 'wght', '--pm-wdth': 'wdth', '--pm-slnt': 'slnt' };
const NOM_AXE = { wght: 'la graisse sautera d\'un cran à l\'autre', wdth: 'la largeur ne bougera pas', slnt: 'l\'inclinaison ne bougera pas' };

/** Rôle de police d'un élément : classe connue du CSS, police écrite en ligne (var(--f-rôle)), sinon « texte ». */
function roleDe(attrs, roles) {
  let role = null;
  for (const c of String(attrs.class || '').split(/\s+/)) if (roles.has(c)) role = roles.get(c);
  if (role) return role;
  const m = /font(?:-family)?\s*:[^;]*var\(\s*--f-([a-z0-9-]+)\s*\)/.exec(attrs.style || '');
  return m ? m[1] : 'texte';
}

// 2,5D dans un espace en perspective (spec S9, 5.12) : l'export rapide (image SVG de la page) l'aplatit ; mesuré par
// briques-page.test.js. La perspective écrite dans transform (perspective(…), #092, #093, #106, #139) passe, elle.
const TROIS_D = /\bpm-espace-3d\b|\bpm-m-retourne\b|\bpm-m-cube\b|\bpm-3d-face\b|preserve-3d|(?:^|[\s;{"'])perspective\s*:/;
const MESSAGE_TROIS_D = 'Cette scène utilise de la 3D que l\'export rapide ne rend pas : exporter avec ffmpeg (export fidèle).';

/** Scènes du déroulé qui utilisent la 2,5D en perspective (refusées par l'export rapide). -> [id] */
function scenesTroisD(projet, deroule) {
  const fs = require('node:fs');
  const { cheminDansProjet } = require('./embarquer.js');
  return (deroule.scenes || []).filter((s) => {
    const f = cheminDansProjet(projet, s.fichier);
    try { return TROIS_D.test(fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '')); } catch { return false; }
  }).map((s) => s.id);
}

/** Refus de l'export rapide d'une vidéo dont des scènes utilisent la 2,5D en perspective. -> message */
function messageTroisD(ids) {
  return `${ids.length > 1 ? `Les scènes ${ids.map((x) => `« ${x} »`).join(', ')} utilisent` : `La scène « ${ids[0]} » utilise`} de la 3D que l'export rapide ne rend pas : exporter avec ffmpeg (export fidèle) ; « pulse-motion ffmpeg » dit comment l'installer.`;
}

function controlerBriques({ deroule, scene, html, min, seuils, couleurs = {}, detailPolices = [], css = '', dureeTemps = null }) {
  const r = [];
  const S = seuils || {};
  const id = scene.id;
  const signaler = (regle, gravite, message, element) => r.push({ regle, gravite, scene: id, ...(element ? { element } : {}), message: `Scène « ${id} » : ${message}` });
  if (TROIS_D.test(String(html || '').replace(/<!--[\s\S]*?-->/g, ''))) signaler('trois-d-export-rapide', 'alerte', MESSAGE_TROIS_D);
  const minutee = min && min.scenes.find((x) => x.id === id);
  const elements = (min && min.elements && min.elements[id]) || {};
  const rythme = (minutee && minutee.rythme) || scene.rythme || 1;
  const { rolesDesClasses } = require('./realisation-regles.js');
  let roles = null;
  const polices = new Map((detailPolices || []).map((p) => [p.famille, p]));
  let n = 0;
  const sansBlocs = String(html || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  parcourir(sansBlocs, (balise, attrs, decor, pile) => {
    // Clé de l'élément minuté, comme moteur/horloge.js (l'id, sinon « _n ») ; gardée sur ses attributs, que la pile reprend.
    if (estMinute(attrs)) Object.defineProperty(attrs, '__cle', { value: attrs.id || `_${++n}`, enumerable: false });
    const nom = attrs.id || attrs['data-texte'] || attrs['data-qr'] || balise;
    if ('data-sur-trace' in attrs) {
      try {
        const spec = analyserSurTrace(attrs['data-sur-trace'], dureeTemps);
        if (spec.mode === 'ecrit' && 'data-lettres' in attrs) throw new Error('« ecrit » découpe déjà le texte lettre par lettre : retirer data-lettres.');
      } catch (e) { signaler('sur-trace-invalide', 'erreur', `texte « ${nom} » : ${e.message}`, nom); }
    }
    if ('data-ken-burns' in attrs) {
      try {
        const kb = lireKenBurns(attrs['data-ken-burns']);
        if (kb.horsBornes !== undefined) signaler('ken-burns-invalide', 'erreur', `« ${nom} » : ampleur ${virgule(kb.horsBornes)} hors de 1,03 à 1,3 (zoom final) ; elle est ramenée à ${virgule(kb.ampleur)}.`, nom);
      } catch (e) { signaler('ken-burns-invalide', 'erreur', `« ${nom} » : ${e.message}`, nom); }
    }
    // Police variable : un axe animé sur une police qui ne l'a pas.
    const axes = new Set();
    if (attrs['data-lettres'] === 'graisse' || attrs['data-mots'] === 'graisse') axes.add('wght');
    if (attrs['data-tween']) {
      try { for (const c of analyserTween(attrs['data-tween'])) if (AXE_DE[c.prop]) axes.add(AXE_DE[c.prop]); } catch { /* signalé par tween-invalide */ }
    }
    if (axes.size && detailPolices.length) {
      if (!roles) roles = rolesDesClasses(css);
      const role = roleDe(attrs, roles);
      const police = [...polices.values()].find((p) => p.roles.includes(role));
      if (police && police.fichiers.length) {
        const lus = police.fichiers.map(caracteristiquesPolice).filter(Boolean);
        for (const axe of axes) {
          if (lus.length && !lus.some((c) => c.axes.some((a) => a.tag === axe))) {
            signaler('police-non-variable', 'alerte', `la police « ${police.famille} » n'est pas variable : ${NOM_AXE[axe]}. Choisir une police variable (Inter ou Figtree du style clair-pedagogique, ou une police fournie).`, nom);
          }
        }
      }
    }
    if (!('data-qr' in attrs) || balise !== 'svg') return;
    const texte = (scene.textes || {})[attrs['data-qr']];
    if (typeof texte === 'string' && [...texte].length > (S.qrLongueur || 120)) {
      signaler('qr-long', 'alerte', `le lien du QR code « ${nom} » fait ${[...texte].length} caractères ; au-delà de ${S.qrLongueur || 120}, le code devient dense et difficile à lire sur un téléphone : raccourcir l'adresse.`, nom);
    }
    const encre = couleurQR(attrs['data-qr-encre'] || '#000', couleurs);
    const fond = couleurQR(attrs['data-qr-fond'] || '#fff', couleurs);
    if (encre && fond) {
      const c = contraste(encre, fond);
      if (luminance(encre) > luminance(fond)) signaler('qr-contraste', 'erreur', `le QR code « ${nom} » est clair sur fond foncé ; beaucoup de téléphones ne le lisent pas : des carrés foncés sur fond clair.`, nom);
      else if (c < (S.qrContraste || 7) - 1e-9) signaler('qr-contraste', 'erreur', `le QR code « ${nom} » n'a qu'un contraste de ${virgule(c)}:1 ; il faut au moins ${S.qrContraste || 7}:1 (carrés foncés sur fond clair).`, nom);
    }
    // Visible et immobile assez longtemps : de la fin de son apparition à la fin de la scène, hors mouvements de caméra.
    if (!minutee) return;
    const finScene = minutee.fin;
    let debut = minutee.debut + (minutee.entree || 0);
    const minutes = [...pile.map((p) => p.attrs), attrs];
    if (minutes.some((a) => 'data-ken-burns' in a)) {
      signaler('qr-trop-court', 'alerte', `le QR code « ${nom} » bouge tout le temps (Ken Burns) ; il faut le laisser immobile au moins ${virgule(S.qrDuree || 4)} s pour qu'on ait le temps de le scanner.`, nom);
      return;
    }
    // Élément minuté le plus proche (lui-même ou un ancêtre) : il apparaît à son début, son apparition dure au plus 1 s.
    for (let i = minutes.length - 1; i >= 0; i--) {
      const e = minutes[i].__cle && elements[minutes[i].__cle];
      if (e) { debut = Math.max(debut, e.debut + Math.min(1, Math.max(0, e.fin - e.debut))); break; }
    }
    // Caméras des ancêtres : leurs plages de mouvement (valeurs qui changent, secousses) coupent le temps immobile.
    const coupures = [];
    for (const a of pile.map((p) => p.attrs)) {
      if (!a['data-camera']) continue;
      let clauses = [];
      try { clauses = analyserCamera(a['data-camera'], dureeTemps); } catch { continue; }
      for (const c of clauses) if (c.prop === 'secousse' || c.de !== c.a) coupures.push([minutee.debut + c.debut / rythme, minutee.debut + (c.debut + c.duree) / rythme]);
    }
    coupures.sort((x, y) => x[0] - y[0]);
    let plusLong = 0;
    let curseur = debut;
    for (const [a, b] of coupures) {
      if (b <= curseur) continue;
      if (a > curseur) plusLong = Math.max(plusLong, Math.min(a, finScene) - curseur);
      curseur = Math.max(curseur, b);
    }
    plusLong = Math.max(plusLong, finScene - curseur);
    if (plusLong < (S.qrDuree || 4) - 1e-6) {
      signaler('qr-trop-court', 'alerte', `le QR code « ${nom} » ne reste visible et immobile que ${virgule(Math.max(0, plusLong))} s ; il faut au moins ${virgule(S.qrDuree || 4)} s pour sortir son téléphone et le scanner : allonger la scène ou arrêter la caméra.`, nom);
    }
  });
  return r;
}

module.exports = { besoinsBriques, preparerQR, donneesPolices, controlerBriques, couleurQR, scenesTroisD, messageTroisD, MARQUES_CSS, TROIS_D };
