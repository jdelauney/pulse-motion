/* Pulse Motion – aplats surimprimés du style riso (spec Styles et réalisation, 5.15).
 *
 * Module d'un style (5.10 point 3) : inclus par l'assemblage seulement si identite.modules du style contient « riso ». Les
 * aplats du décor sont des éléments HTML qui ne servent que de géométrie :
 *   <span class="rond" data-riso="rond accent" data-start="0.4" data-dur="0.6"></span>
 *   data-riso="<forme> <encre> [trame]" : forme rond, rect, demi (demi-disque posé sur son bord bas), bande (rectangle
 *   arrondi aux bouts) ; encre primaire, accent, neutre (--c-encre-neutre du style) ou texte ; trame : des points au lieu d'un
 *   aplat plein.
 * À chaque image (M.surRendu), chaque scène affichée qui en a les peint dans un canevas posé en tête de son décor : une couche
 * par encre, l'aplat à l'opacité calculée de l'élément (ses entrées comprises), puis la couche surimprimée en multiply, décalée
 * du calage de son encre (M.encre.decalage, moteur/medium/encre.js : 0,2 à 0,5 cqh tiré de la scène et de l'encre, constant
 * dans le plan, rattrapé par [data-riso-calage]). Les éléments sont alors cachés (riso.css, section[data-riso-peint]).
 * Repli : si le canevas manque ou si le dessin échoue, le canevas est retiré, les aplats HTML restent visibles (sans fusion)
 * et la règle dessin-erreur le dit. Rotation d'un aplat : non suivie (sa boîte à l'écran seulement).
 * Déterminisme : tout vient de la géométrie de l'image et de graines ; jamais Math.random. Idées (encres translucides
 * surimprimées, trame, plaques jamais tout à fait calées) : lemo-opuscar, risograph (MIT, © 2026 LemoLab) et take-one, riso-pop
 * (MIT, Tal Siach), réécrites. Navigateur seulement ; dépend de horloge (M.surRendu) et, pour le calage, de encre.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  if (typeof document === 'undefined' || !M.surRendu) return;
  var FORMES = ['rond', 'rect', 'demi', 'bande'];
  var ENCRES = { primaire: '--c-primaire', accent: '--c-accent', neutre: '--c-encre-neutre', texte: '--c-texte' };
  var OPACITE = 0.9;
  var etat = { scenes: null };

  function lireAplat(el) {
    var mots = (el.getAttribute('data-riso') || '').split(/\s+/);
    var forme = mots.filter(function (m) { return FORMES.indexOf(m) >= 0; })[0] || 'rect';
    var encre = mots.filter(function (m) { return Object.prototype.hasOwnProperty.call(ENCRES, m); })[0] || 'primaire';
    return { el: el, forme: forme, encre: encre, trame: mots.indexOf('trame') >= 0 };
  }

  function scenes() {
    if (etat.scenes) return etat.scenes;
    etat.scenes = [];
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (sec) {
      var aplats = Array.prototype.map.call(sec.querySelectorAll('[data-riso]'), lireAplat);
      if (aplats.length) etat.scenes.push({ id: sec.getAttribute('data-scene'), sec: sec, aplats: aplats, canevas: null, ctx: null, couche: null, echoue: false });
    });
    return etat.scenes;
  }

  function canevasDe(s) {
    if (s.canevas && s.canevas.isConnected) return s.canevas;
    var c = document.createElement('canvas');
    c.className = 'pm-riso';
    c.setAttribute('aria-hidden', 'true');
    if (!c.getContext || !c.getContext('2d')) throw new Error('canevas indisponible');
    var hote = s.sec.querySelector(':scope > .decor') || s.sec;
    hote.insertBefore(c, hote.firstChild);
    s.canevas = c;
    s.ctx = c.getContext('2d');
    s.couche = document.createElement('canvas');
    s.sec.setAttribute('data-riso-peint', '');
    return c;
  }

  function forme(ctx, f, x, y, l, h) {
    ctx.beginPath();
    if (f === 'rond') ctx.ellipse(x + l / 2, y + h / 2, l / 2, h / 2, 0, 0, Math.PI * 2);
    else if (f === 'demi') { ctx.moveTo(x, y + h); ctx.ellipse(x + l / 2, y + h, l / 2, h, 0, Math.PI, Math.PI * 2); ctx.closePath(); }
    else if (f === 'bande') {
      var r = Math.min(h, l) / 2;
      ctx.moveTo(x + r, y); ctx.lineTo(x + l - r, y); ctx.arc(x + l - r, y + r, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
    } else ctx.rect(x, y, l, h);
    ctx.fill();
  }

  var tuiles = new Map();
  /** Trame de points d'une encre (cellule de 0,9 cqh), en pixels du canevas. */
  function trame(ctx, couleur, k) {
    var cle = couleur + '|' + k;
    if (tuiles.has(cle)) return tuiles.get(cle);
    var n = Math.max(3, Math.round(0.9 * k));
    var t = document.createElement('canvas');
    t.width = n; t.height = n;
    var tc = t.getContext('2d');
    tc.fillStyle = couleur;
    tc.beginPath(); tc.arc(n / 2, n / 2, n * 0.34, 0, Math.PI * 2); tc.fill();
    var motif = ctx.createPattern(t, 'repeat');
    if (tuiles.size > 64) tuiles.clear();
    tuiles.set(cle, motif);
    return motif;
  }

  function peindre(s) {
    var sec = s.sec;
    if (sec.style.display === 'none') return;
    var c = canevasDe(s);
    var dpr = Math.max(1, Math.min(2, racine.devicePixelRatio || 1));
    var W = Math.max(1, Math.round(sec.clientWidth * dpr)), H = Math.max(1, Math.round(sec.clientHeight * dpr));
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    if (s.couche.width !== W) s.couche.width = W;
    if (s.couche.height !== H) s.couche.height = H;
    var ctx = s.ctx, cc = s.couche.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    // Boîtes à l'écran, ramenées à la section (transition comprise : son échelle est retirée).
    var rs = sec.getBoundingClientRect();
    var ech = (rs.width / (sec.offsetWidth || 1)) || 1;
    var k = (sec.clientHeight / 100) * dpr;
    var cs = getComputedStyle(sec);
    var parEncre = {}, ordre = [];
    s.aplats.forEach(function (a) {
      var r = a.el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return;
      var op = parseFloat(getComputedStyle(a.el).opacity);
      for (var p = a.el.parentElement; p && p !== sec; p = p.parentElement) op *= parseFloat(getComputedStyle(p).opacity);
      if (!(op > 0.001)) return;
      if (!parEncre[a.encre]) { parEncre[a.encre] = []; ordre.push(a.encre); }
      parEncre[a.encre].push({ a: a, op: op, x: (r.left - rs.left) / ech * dpr, y: (r.top - rs.top) / ech * dpr, l: r.width / ech * dpr, h: r.height / ech * dpr });
    });
    ordre.forEach(function (encre) {
      var couleur = cs.getPropertyValue(ENCRES[encre]).trim() || '#000';
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalCompositeOperation = 'source-over';
      cc.globalAlpha = 1;
      cc.clearRect(0, 0, W, H);
      parEncre[encre].forEach(function (b) {
        cc.globalAlpha = Math.min(1, b.op);
        cc.fillStyle = b.a.trame ? trame(cc, couleur, k) : couleur;
        forme(cc, b.a.forme, b.x, b.y, b.l, b.h);
      });
      var d = M.encre && M.encre.decalage ? M.encre.decalage(sec, s.id, couleur) : [0, 0];
      ctx.globalAlpha = OPACITE;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(s.couche, d[0] * k, d[1] * k);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function replier(s, e) {
    s.echoue = true;
    try { if (s.canevas) s.canevas.remove(); } catch (x) { /* déjà retiré */ }
    s.canevas = null;
    s.sec.removeAttribute('data-riso-peint');
    var message = 'Scène « ' + s.id + ' » : aplats du style riso : ' + ((e && e.message) || String(e)) + ' ; aplats laissés sans surimpression.';
    if (M.erreurs) M.erreurs.push({ regle: 'dessin-erreur', scene: s.id, message: message });
    console.warn('[Pulse Motion] ' + message);
  }

  M.surRendu(function () {
    scenes().forEach(function (s) {
      if (s.echoue) return;
      try { peindre(s); } catch (e) { replier(s, e); }
    });
  });
  M.riso = { OPACITE: OPACITE, FORMES: FORMES, ENCRES: Object.keys(ENCRES) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
