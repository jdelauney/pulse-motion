/* Pulse Motion – la journée qui passe (spec S11, 5.9).
 *
 *   var J = M.journee;                          // page ; require('./journee.js') dans Node
 *   J.palette(τ) -> { haut, bas, papier, encre, encreT, lampe, nuit, couchant }   couleurs [r, g, b], signaux de 0 à 1
 *   J.variables(τ) -> { '--pm-ciel-haut', '--pm-ciel-bas', '--pm-papier', '--pm-encre', '--pm-nuit', '--pm-lampe' }
 *   J.lire("0.62-0.95" | "0.75") -> { de, a } ou null ;  J.tau(decl, u) : τ à la progression u (0 à 1) de la scène
 *   J.contraste(a, b) (WCAG) ;  J.passages(decl, debut, fin) -> [{ de, a }] : instants où l'encre se lit mal sur le papier
 *   J.seuilLampe(graine), J.chaleurLampe(graine), J.allumage(seuil, lampe), J.lumiere(chaleur)
 *   M.demarrerJournee() ; M.journee.forcer(τ | null) ; M.journee.instant(idScene, t) -> τ ou null      (page)
 *
 * τ = 0 à minuit, 0,25 à l'aube, 0,5 à midi, 0,75 au crépuscule. Le jour, encre sombre sur papier chaud ; la nuit, encre pâle
 * sur papier indigo : l'encre bascule selon la luminance du papier, entre 0,56 et 0,36, pendant que le papier est à mi-sombre
 * (le passage peu lisible est bref). Signaux : lampe (0 grand jour … 1 nuit noire ; chaque lampe a son seuil), nuit (étoiles,
 * lune), couchant (lumière chaude de l'horizon à l'aube et au crépuscule).
 * data-journee sur la section d'une scène : « a-b », τ va de a à b pendant la scène, en cubic-inout ; « a » le fixe. La section
 * reçoit les six variables à chaque image ; les couleurs --c-* de la charte ne changent jamais. [data-lampe] de la scène :
 * seuil tiré de la graine « scène|id » (sinon « scène|rang »), --pm-allume (0 à 1) et --pm-fenetre (le papier mêlé d'une
 * lumière chaude) ; lueur en dégradé radial, fusion normale (HTML : ::after ; SVG : ellipse sous la lampe). Feuille à
 * spécificité nulle (:where) : toute règle du style ou de la scène l'emporte.
 * Sans état : tout vient de t (et de τ forcé par la planche) ; un canevas lit J.palette(J.instant(scène, t)), jamais le style
 * calculé (les variables sont posées après le rendu des scènes).
 * D'après line-art-animation (MIT, © 2026 JDhruv14 : lib/daynight.ts, examples/village/sky.ts, houses.ts et main.ts), réécrit.
 */
(function (racine, fabrique) {
  var api = fabrique(racine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.journee = api; api.installer(racine.M); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (racine) {
  'use strict';

  // Rampes cycliques [position, couleur] du haut du ciel, du bas du ciel et du papier.
  var CIEL_HAUT = [[0, '#0d1222'], [0.19, '#131a30'], [0.235, '#3d4066'], [0.27, '#cfd8e2'], [0.33, '#f3f2ee'], [0.5, '#f6f5f1'],
    [0.68, '#f3eee4'], [0.735, '#e3c6a6'], [0.762, '#5a5279'], [0.8, '#1b2140'], [0.86, '#0d1222']];
  var CIEL_BAS = [[0, '#1a2240'], [0.19, '#283050'], [0.235, '#d49884'], [0.27, '#f3d0b3'], [0.33, '#faf6ee'], [0.5, '#fcfbf7'],
    [0.68, '#f9efdc'], [0.735, '#f0a379'], [0.762, '#d47f68'], [0.8, '#383a60'], [0.86, '#1a2240']];
  var PAPIERS = [[0, '#1a2036'], [0.19, '#1f263e'], [0.235, '#4a4561'], [0.27, '#ede4d8'], [0.33, '#fbf8f1'], [0.5, '#fdfcf8'],
    [0.68, '#faf4e8'], [0.735, '#f0dbc4'], [0.756, '#5d5571'], [0.8, '#262c48'], [0.86, '#1a2036']];
  var ENCRE_JOUR = '#1c1c1c', ENCRE_NUIT = '#efe6cf';
  var BASCULE = [0.56, 0.36];
  var LUMIERE = ['#ffd58a', '#f0a24e'];
  var SEUIL_LAMPE = [0.15, 0.6], MONTEE_LAMPE = 0.25, FENETRE_LUMIERE = 0.92, LUEUR = 0.8;
  var CONTRASTE_MIN = 4.5, PAS_PASSAGE = 1 / 120;
  var NOMS = ['--pm-ciel-haut', '--pm-ciel-bas', '--pm-papier', '--pm-encre', '--pm-nuit', '--pm-lampe'];

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function borne(x, a, b) { return Math.max(a, Math.min(b, x)); }
  /** smoothstep de e0 à e1 (e1 < e0 permis : le signal monte quand x descend). */
  function lisse(e0, e1, x) { var k = borne((x - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); }
  function rvb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function mele(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  /** Luminance perçue (non linéaire) : celle de la source, qui décide de la bascule de l'encre et des signaux. */
  function luminance(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function texte(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function trois(x) { var y = Math.round(x * 1000) / 1000; return y === 0 ? 0 : y; }

  function rampe(cles) { return cles.map(function (c) { return [c[0], rvb(c[1])]; }); }
  var R_HAUT = rampe(CIEL_HAUT), R_BAS = rampe(CIEL_BAS), R_PAPIER = rampe(PAPIERS);
  var C_JOUR = rvb(ENCRE_JOUR), C_NUIT = rvb(ENCRE_NUIT), C_LUMIERE = LUMIERE.map(rvb);

  /** Couleur d'une rampe cyclique à u (modulo 1), lissée entre deux clés. */
  function lireRampe(cles, u) {
    u = ((u % 1) + 1) % 1;
    var n = cles.length, i = n - 1;
    for (var j = 0; j < n; j++) if (cles[j][0] <= u) i = j;
    var p0 = cles[i][0], p1 = cles[(i + 1) % n][0] + (i + 1 < n ? 0 : 1), x = u - p0;
    if (x < 0) x += 1;
    return mele(cles[i][1], cles[(i + 1) % n][1], lisse(0, 1, x / (p1 - p0)));
  }

  function palette(tau) {
    var t = num(Number(tau), 0.5);
    var haut = lireRampe(R_HAUT, t), bas = lireRampe(R_BAS, t), papier = lireRampe(R_PAPIER, t);
    var L = luminance(papier), encreT = lisse(BASCULE[0], BASCULE[1], L);
    return {
      haut: haut, bas: bas, papier: papier, encre: mele(C_JOUR, C_NUIT, encreT), encreT: encreT,
      lampe: lisse(0.78, 0.4, L),
      nuit: lisse(0.42, 0.1, luminance(haut)),
      couchant: Math.max(lisse(0.67, 0.735, t) * lisse(0.79, 0.745, t), lisse(0.215, 0.245, t) * lisse(0.3, 0.26, t))
    };
  }

  /** Les six variables de la scène à τ (chaînes : couleurs rgb(), signaux à 3 décimales). */
  function variables(tau) {
    var P = palette(tau), v = {};
    v[NOMS[0]] = texte(P.haut); v[NOMS[1]] = texte(P.bas); v[NOMS[2]] = texte(P.papier); v[NOMS[3]] = texte(P.encre);
    v[NOMS[4]] = String(trois(P.nuit)); v[NOMS[5]] = String(trois(P.lampe));
    return v;
  }

  /** « a-b » ou « a » (nombres de 0 à 1, point décimal) -> { de, a } ou null. */
  function lire(valeur) {
    var m = /^\s*(\d*\.?\d+)\s*(?:-\s*(\d*\.?\d+)\s*)?$/.exec(String(valeur === undefined || valeur === null ? '' : valeur));
    if (!m) return null;
    var de = Number(m[1]), a = m[2] === undefined ? de : Number(m[2]);
    return de >= 0 && de <= 1 && a >= 0 && a <= 1 ? { de: de, a: a } : null;
  }

  function cubicInOut(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(2 - 2 * u, 3) / 2; }

  /** τ à la progression u de la scène (bornée à 0..1). */
  function tau(decl, u) { return decl.de + (decl.a - decl.de) * cubicInOut(borne(num(u, 0), 0, 1)); }

  function lineaire(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  /** Contraste WCAG de deux couleurs [r, g, b]. */
  function contraste(a, b) {
    var la = 0.2126 * lineaire(a[0]) + 0.7152 * lineaire(a[1]) + 0.0722 * lineaire(a[2]);
    var lb = 0.2126 * lineaire(b[0]) + 0.7152 * lineaire(b[1]) + 0.0722 * lineaire(b[2]);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function arrondi(c) { return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]; }
  function malLu(t) { var P = palette(t); return contraste(arrondi(P.encre), arrondi(P.papier)) < CONTRASTE_MIN; }

  /** Instants absolus de la scène [debut, fin] où le contraste de l'encre sur le papier est sous 4,5 : [{ de, a }]. */
  function passages(decl, debut, fin) {
    var out = [], cour = null, duree = fin - debut;
    if (!decl || !(duree > 0)) return out;
    if (decl.de === decl.a) return malLu(decl.de) ? [{ de: debut, a: fin }] : [];
    var n = Math.max(1, Math.ceil(duree / PAS_PASSAGE));
    for (var i = 0; i <= n; i++) {
      var t = debut + duree * i / n;
      if (malLu(tau(decl, i / n))) { if (!cour) out.push(cour = { de: t, a: t }); else cour.a = t; } else cour = null;
    }
    return out;
  }

  /** Graine 0..1 d'un texte (FNV-1a). */
  function graine(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  function seuilLampe(g) { return SEUIL_LAMPE[0] + (SEUIL_LAMPE[1] - SEUIL_LAMPE[0]) * graine(g); }
  function chaleurLampe(g) { return graine(g + '|chaleur'); }
  /** Allumage d'une lampe de seuil donné quand le signal lampe vaut `lampe` (0 à 1). */
  function allumage(seuil, lampe) { return lisse(seuil, seuil + MONTEE_LAMPE, lampe); }
  function lumiere(chaleur) { return mele(C_LUMIERE[0], C_LUMIERE[1], borne(num(chaleur, 0), 0, 1)); }

  /* ---------- page ---------- */

  var FEUILLE = ':where([data-journee] [data-lampe]:not(svg *)){position:relative;background-color:var(--pm-fenetre)}' +
    ':where([data-journee] [data-lampe]:not(svg *))::after{content:"";position:absolute;left:-60%;top:-60%;right:-60%;bottom:-60%;' +
    'pointer-events:none;opacity:calc(var(--pm-allume,0)*' + LUEUR + ');background:radial-gradient(closest-side,rgba(255,213,138,.75),' +
    'rgba(255,184,92,.28) 45%,rgba(255,184,92,0))}:where([data-journee] svg [data-lampe]){fill:var(--pm-fenetre)}';
  var NS = 'http://www.w3.org/2000/svg';

  function installer(M) {
    var force = null, nLueurs = 0;
    var api = M.journee;

    /** La planche de la journée (5.11 point 2) : τ imposé à toutes les scènes à journée (null : rendu normal). */
    api.forcer = function (t) { force = t === null || t === undefined || !isFinite(Number(t)) ? null : Number(t); };

    function declDe(id) {
      var d = null;
      if (!racine.document) return null;
      document.querySelectorAll('#pm-scene > section[data-scene][data-journee]').forEach(function (s) {
        if (s.getAttribute('data-scene') === id) d = lire(s.getAttribute('data-journee'));
      });
      return d;
    }
    function infoDe(id) { return ((M.minutage && M.minutage.scenes) || []).filter(function (x) { return x.id === id; })[0] || null; }
    function tauA(d, info, t) {
      if (force !== null) return force;
      return tau(d, info.fin > info.debut ? (t - info.debut) / (info.fin - info.debut) : 0);
    }
    /** τ d'une scène à journée à l'instant t de la vidéo, ou null. */
    api.instant = function (id, t) {
      var d = declDe(id), info = infoDe(id);
      return d && info ? tauA(d, info, num(Number(t), 0)) : null;
    };

    /** Ellipse de lueur sous une lampe SVG, remplie d'un dégradé radial (fusion normale). */
    function lueurSvg(el) {
      var svg = el.ownerSVGElement, bb = null;
      if (!svg || typeof el.getBBox !== 'function') return null;
      try { bb = el.getBBox(); } catch (e) { bb = null; }
      if (!bb || !(bb.width > 0 || bb.height > 0)) return null;
      var id = 'pm-lueur-' + (++nLueurs), defs = document.createElementNS(NS, 'defs'), g = document.createElementNS(NS, 'radialGradient');
      g.setAttribute('id', id);
      [[0, '#ffd58a', 0.75], [0.45, '#ffb85c', 0.28], [1, '#ffb85c', 0]].forEach(function (s) {
        var st = document.createElementNS(NS, 'stop');
        st.setAttribute('offset', s[0]); st.setAttribute('stop-color', s[1]); st.setAttribute('stop-opacity', s[2]);
        g.appendChild(st);
      });
      defs.appendChild(g);
      svg.insertBefore(defs, svg.firstChild);
      var e = document.createElementNS(NS, 'ellipse'), marge = 0.25 * (bb.width + bb.height);
      e.setAttribute('cx', bb.x + bb.width / 2); e.setAttribute('cy', bb.y + bb.height / 2);
      e.setAttribute('rx', 0.9 * bb.width + marge); e.setAttribute('ry', 0.9 * bb.height + marge);
      e.setAttribute('fill', 'url(#' + id + ')'); e.setAttribute('opacity', '0'); e.setAttribute('aria-hidden', 'true');
      e.setAttribute('class', 'pm-lueur');
      if (el.getAttribute('transform')) e.setAttribute('transform', el.getAttribute('transform'));
      el.parentNode.insertBefore(e, el);
      return e;
    }

    M.demarrerJournee = function () {
      if (!racine.document || !M.minutage) return;
      var liste = [];
      document.querySelectorAll('#pm-scene > section[data-scene][data-journee]').forEach(function (sec) {
        var id = sec.getAttribute('data-scene'), d = lire(sec.getAttribute('data-journee')), info = infoDe(id);
        if (!d || !info) return;
        var affichee = sec.style.display, lampes = [];
        sec.style.display = '';
        sec.querySelectorAll('[data-lampe]').forEach(function (el, i) {
          var g = id + '|' + (el.id || i);
          lampes.push({ el: el, seuil: seuilLampe(g), lumiere: lumiere(chaleurLampe(g)), lueur: el instanceof racine.SVGElement ? lueurSvg(el) : null });
        });
        sec.style.display = affichee;
        liste.push({ sec: sec, d: d, info: info, lampes: lampes });
      });
      if (!liste.length) return;
      if (!document.getElementById('pm-journee')) {
        var st = document.createElement('style');
        st.id = 'pm-journee';
        st.textContent = FEUILLE;
        document.head.appendChild(st);
      }
      M.surRendu(function (t) {
        liste.forEach(function (x) {
          var tt = tauA(x.d, x.info, t), v = variables(tt), P = palette(tt);
          NOMS.forEach(function (n) { x.sec.style.setProperty(n, v[n]); });
          x.lampes.forEach(function (l) {
            var k = trois(allumage(l.seuil, P.lampe));
            l.el.style.setProperty('--pm-allume', String(k));
            l.el.style.setProperty('--pm-fenetre', texte(mele(P.papier, l.lumiere, k * FENETRE_LUMIERE)));
            if (l.lueur) l.lueur.setAttribute('opacity', String(trois(k * LUEUR)));
          });
        });
      });
    };
  }

  return { palette: palette, variables: variables, lire: lire, tau: tau, cubicInOut: cubicInOut, contraste: contraste, passages: passages,
    graine: graine, seuilLampe: seuilLampe, chaleurLampe: chaleurLampe, allumage: allumage, lumiere: lumiere, luminance: luminance,
    installer: installer, NOMS: NOMS, BASCULE: BASCULE, SEUIL_LAMPE: SEUIL_LAMPE, CONTRASTE_MIN: CONTRASTE_MIN, ENCRE_JOUR: ENCRE_JOUR,
    ENCRE_NUIT: ENCRE_NUIT, FEUILLE: FEUILLE };
});
