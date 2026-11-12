/* Pulse Motion – imiter une animation ou une vidéo fournie (spec S9, 5.15) : mesures pures, en Node et dans la page d'aide
 * de l'analyse (global PMImiter). Aucune horloge, aucun hasard non semé : deux analyses du même fichier donnent les mêmes
 * chiffres.
 *
 * reduire(rgb, L, H, largeur = 160) -> { rgb, largeur, hauteur } : moyenne par surfaces (RVB, 3 octets par point).
 * activite(images) -> [écart moyen avec l'image précédente, de 0 à 1] : images réduites à 160 px, flou boîte de rayon 1.
 * fenetres(temps, activite, { fin }) -> { fenetres, coupes, tenues, seuil, seuilBas } : mouvements (première et dernière
 *   image qui change, étendus tant que l'image change encore), coupes (plus de 25 % sur une seule image), tenues (0,5 s ou plus
 *   sans changement).
 * courbeParActivite(temps, activite, fenetre) -> { mode, courbe, part } : règle du tiers sur l'activité cumulée.
 * bordsSujet(rgba|rgb, L, H, couleurs, { canaux, zone, tolerance, suite }) -> { haut, bas, gauche, droite } (px) | null.
 * analyserSuivi(temps, bords, fenetres) -> [{ fenetre, propriete, de, a, courbe… }] et mouvements de vie.
 * ajusterCourbe(points, debut, fin) -> { courbe, debut, duree, depassement, erreur, verdict, css? }.
 * palette(images, { kMax, graine }) -> { couleurs, fond, encre, accents, cle, contraste, proposition }.
 * mesurerMain(gris, L, H) -> { trait, bords, grain, trame } ; resumerMain([mesures]) ; phraseMain(main).
 * profilStyle(identite), stylesProches(reference, identites).
 * misePlanche(L, H), aligner(a, b), comparerFenetres(ref, notre, decalage, niveau).
 * niveauFidelite(phrase), ficheSquelette(...), verifierFiche(texte), estAdresse(texte).
 *
 * Idées et valeurs reprises :
 * - reanimate (MIT, © 2026 Niaz Morshed) : courbe d'activité (compare.ts, activity), alignement des courbes, table des
 *   courbes et durée libre de 1 à 2 fois la durée visible (easing.ts), règle du tiers (analysis.md), niveaux de fidélité ;
 *   traduits et adaptés ;
 * - rossark-motion-skill (MIT, © 2026 rossark0) : suivi des bords d'un sujet par ses couleurs (track_edges.py : 40 de
 *   tolérance, suite de 6 points), planches étiquetées (sheet.sh) ; adaptés ;
 * - take-one : la « main » d'une image (trait, bords, grain, trame), principes seulement, rien de son code. */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object' && module.exports;
  var C = nodeJS ? require('../../moteur/courbes.js') : (racine.M || null);
  var api = fabrique(C);
  if (nodeJS) module.exports = api;
  else racine.PMImiter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var LARGEUR = 160;
  var SEUIL = 0.005;          // 0,5 % : une image qui change
  var SEUIL_BAS = 0.0005;     // 0,05 % : le moindre changement (fin d'un ease-out)
  var COUPE = 0.25;           // 25 % sur une seule image : une coupe
  var TENUE = 0.5;            // s sans changement : une tenue
  var FUSION = 0.15;          // s : deux mouvements séparés de moins se fondent en un
  var TOLERANCE = 40;
  var SUITE = 6;
  var DUREE_MAX = 10;
  var IMAGES_MAX = 600;
  var ECART_MOUVEMENT = 0.08;
  var DECALAGE_MAX = 15;
  var DEPASSEMENT = 0.02;
  var K_MAX = 6;

  var arrondi = function (x, n) { var f = Math.pow(10, n === undefined ? 3 : n); return Math.round(x * f) / f; };
  var virgule = function (x, n) { return String(arrondi(x, n === undefined ? 2 : n)).replace('.', ','); };
  /** Nombre à 2 décimales fixes, virgule française (« 1,00 ») : colonnes de la fiche, étiquettes des planches. */
  var fixe = function (x) { return Number(x).toFixed(2).replace('.', ','); };
  function mediane(liste) {
    if (!liste.length) return 0;
    var s = liste.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // --- Réduction et activité -------------------------------------------------------------------------------------

  /** Poids de la moyenne par surfaces d'un axe : pour chaque point cible, [[source, poids]…] (somme 1). */
  function poidsAxe(source, cible) {
    var r = [];
    var k = source / cible;
    for (var i = 0; i < cible; i++) {
      var a = i * k, b = (i + 1) * k, liste = [];
      for (var s = Math.floor(a); s < Math.min(source, Math.ceil(b)); s++) {
        var w = Math.min(b, s + 1) - Math.max(a, s);
        if (w > 1e-9) liste.push([s, w / k]);
      }
      r.push(liste);
    }
    return r;
  }

  function reduire(rgb, L, H, largeur) {
    var lw = largeur || LARGEUR;
    if (L <= lw) return { rgb: new Uint8Array(rgb), largeur: L, hauteur: H };
    var lh = Math.max(1, Math.round(H * lw / L));
    var px = poidsAxe(L, lw), py = poidsAxe(H, lh);
    var tampon = new Float32Array(lw * H * 3);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < lw; x++) {
        var r = 0, v = 0, b = 0, p = px[x];
        for (var j = 0; j < p.length; j++) { var o = (y * L + p[j][0]) * 3, w = p[j][1]; r += rgb[o] * w; v += rgb[o + 1] * w; b += rgb[o + 2] * w; }
        var d = (y * lw + x) * 3;
        tampon[d] = r; tampon[d + 1] = v; tampon[d + 2] = b;
      }
    }
    var sortie = new Uint8Array(lw * lh * 3);
    for (var yy = 0; yy < lh; yy++) {
      var q = py[yy];
      for (var xx = 0; xx < lw; xx++) {
        var R = 0, V = 0, B = 0;
        for (var i = 0; i < q.length; i++) { var oo = (q[i][0] * lw + xx) * 3, ww = q[i][1]; R += tampon[oo] * ww; V += tampon[oo + 1] * ww; B += tampon[oo + 2] * ww; }
        var dd = (yy * lw + xx) * 3;
        sortie[dd] = Math.round(R); sortie[dd + 1] = Math.round(V); sortie[dd + 2] = Math.round(B);
      }
    }
    return { rgb: sortie, largeur: lw, hauteur: lh };
  }

  /** RVBA -> RVB (couche alpha retirée). */
  function sansAlpha(rgba) {
    var n = rgba.length / 4, r = new Uint8Array(n * 3);
    for (var i = 0, j = 0; i < rgba.length; i += 4) { r[j++] = rgba[i]; r[j++] = rgba[i + 1]; r[j++] = rgba[i + 2]; }
    return r;
  }

  /** Flou boîte de rayon 1 (3 × 3, bords : moyenne des voisins présents). -> Float32Array RVB */
  function flouBoite(rgb, L, H) {
    var s = new Float32Array(L * H * 3);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < L; x++) {
        var r = 0, v = 0, b = 0, n = 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx;
            if (xx < 0 || xx >= L) continue;
            var o = (yy * L + xx) * 3;
            r += rgb[o]; v += rgb[o + 1]; b += rgb[o + 2]; n++;
          }
        }
        var d = (y * L + x) * 3;
        s[d] = r / n; s[d + 1] = v / n; s[d + 2] = b / n;
      }
    }
    return s;
  }

  /** images : [{ rgb, largeur, hauteur }] (réduites à 160 px) -> activité de chaque image (la première : 0). */
  function activite(images) {
    var r = [], avant = null;
    for (var k = 0; k < images.length; k++) {
      var im = images[k];
      var f = flouBoite(im.rgb, im.largeur, im.hauteur);
      if (!avant) r.push(0);
      else {
        if (avant.length !== f.length) throw new Error('images de tailles différentes');
        var s = 0;
        for (var i = 0; i < f.length; i++) s += Math.abs(f[i] - avant[i]);
        r.push(arrondi(s / f.length / 255, 6));
      }
      avant = f;
    }
    return r;
  }

  // --- Fenêtres, coupes, tenues ----------------------------------------------------------------------------------

  function fenetres(temps, act, o) {
    o = o || {};
    var n = act.length;
    var fin = o.fin !== undefined ? o.fin : (n ? temps[n - 1] : 0);
    var seuil = o.seuil || SEUIL;
    var coupes = [];
    var estCoupe = [];
    for (var i = 0; i < n; i++) {
      estCoupe[i] = i > 0 && act[i] > COUPE && (act[i - 1] || 0) <= COUPE && (i + 1 >= n || act[i + 1] <= COUPE);
      if (estCoupe[i]) coupes.push({ image: i, t: arrondi(temps[i]), ecart: arrondi(act[i], 4) });
    }
    // Bruit de fond : médiane de l'activité des images calmes ; seuil bas = 3 fois ce bruit, 0,05 % au moins.
    var calmes = [];
    for (var j = 1; j < n; j++) if (act[j] <= seuil && !estCoupe[j]) calmes.push(act[j]);
    var seuilBas = Math.max(SEUIL_BAS, 3 * mediane(calmes));
    var mobile = function (k) { return k > 0 && k < n && act[k] > seuil && !estCoupe[k]; };
    var bas = function (k) { return k > 0 && k < n && act[k] > seuilBas && !estCoupe[k]; };
    var runs = [];
    for (var a = 1; a < n; a++) {
      if (!mobile(a)) continue;
      var b = a;
      while (mobile(b + 1)) b++;
      runs.push([a, b]);
      a = b;
    }
    // Étendre chaque mouvement tant que l'image change encore (hystérésis), puis fondre les mouvements proches.
    runs = runs.map(function (r) {
      var x = r[0], y = r[1];
      while (bas(x - 1)) x--;
      while (bas(y + 1)) y++;
      return [x, y];
    });
    var fondus = [];
    runs.forEach(function (r) {
      var der = fondus[fondus.length - 1];
      if (der && (r[0] <= der[1] + 1 || temps[r[0] - 1] - temps[der[1]] < FUSION - 1e-9)) der[1] = Math.max(der[1], r[1]);
      else fondus.push([r[0], r[1]]);
    });
    var liste = fondus.map(function (r, k) {
      var pic = r[0];
      for (var x = r[0]; x <= r[1]; x++) if (act[x] > act[pic]) pic = x;
      var debut = temps[r[0] - 1];
      return { n: k + 1, debut: arrondi(debut), fin: arrondi(temps[r[1]]), duree: arrondi(temps[r[1]] - debut), pic: arrondi(temps[pic]),
        images: [r[0], r[1]], intensite: arrondi(act[pic], 4) };
    });
    var tenues = [];
    var bornes = [n ? temps[0] : 0];
    liste.forEach(function (f) { bornes.push(f.debut, f.fin); });
    bornes.push(fin);
    for (var t = 0; t + 1 < bornes.length; t += 2) {
      if (bornes[t + 1] - bornes[t] >= TENUE - 1e-9) tenues.push({ debut: arrondi(bornes[t]), fin: arrondi(bornes[t + 1]), duree: arrondi(bornes[t + 1] - bornes[t]) });
    }
    return { fenetres: liste, coupes: coupes, tenues: tenues, seuil: seuil, seuilBas: arrondi(seuilBas, 6) };
  }

  /** Courbes conseillées par le mouvement vivant (S3) quand seul le sens est connu. */
  var COURBES_VIVANT = { out: 'quint-out', inout: 'quart-inout', 'in': 'circle-in', lineaire: 'linear' };

  /** Règle du tiers (reanimate) sur l'activité cumulée d'un mouvement : plus de la moitié du chemin au premier tiers du temps
   *  -> out ; moins du quart -> in ; marches régulières -> linéaire ; sinon inout. */
  function courbeParActivite(temps, act, f) {
    var i0 = f.images[0], i1 = f.images[1];
    var total = 0, valeurs = [];
    for (var i = i0; i <= i1; i++) { total += act[i]; valeurs.push(act[i]); }
    if (!(total > 0)) return null;
    var D = f.fin - f.debut;
    // Part du chemin (activité cumulée, interpolée entre deux images) à la fraction q du temps.
    var partA = function (q) {
      var cible = f.debut + D * q, cumul = 0, avant = { t: f.debut, c: 0 };
      for (var k = i0; k <= i1; k++) {
        var c = cumul + act[k];
        if (temps[k] >= cible - 1e-9) {
          var u = temps[k] > avant.t ? (cible - avant.t) / (temps[k] - avant.t) : 1;
          return (avant.c + u * (c - avant.c)) / total;
        }
        cumul = c;
        avant = { t: temps[k], c: c };
      }
      return 1;
    };
    var part = partA(1 / 3), part2 = partA(2 / 3);
    var moyenne = total / valeurs.length;
    var ecart = Math.sqrt(valeurs.reduce(function (s, v) { return s + (v - moyenne) * (v - moyenne); }, 0) / valeurs.length);
    var symetrique = Math.abs(part - (1 - part2)) < 0.1;
    var mode = valeurs.length >= 3 && ecart / moyenne < 0.2 ? 'lineaire' : symetrique ? 'inout' : part > 0.5 ? 'out' : part < 0.25 ? 'in' : 'inout';
    return { mode: mode, courbe: COURBES_VIVANT[mode], part: arrondi(part, 3), source: 'règle du tiers' };
  }

  // --- Suivi du sujet --------------------------------------------------------------------------------------------

  function versRvb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  /** Bords du sujet : un point est du sujet s'il est à moins de tolerance d'une des couleurs (distance RVB), dans une suite
   *  d'au moins suite points d'une même ligne (rossark, track_edges). zone : [x, y, l, h] en px. -> boîte en px, ou null. */
  function bordsSujet(px, L, H, couleurs, o) {
    o = o || {};
    var canaux = o.canaux || 3;
    var tol2 = Math.pow(o.tolerance || TOLERANCE, 2);
    var suite = o.suite || SUITE;
    var z = o.zone || [0, 0, L, H];
    var x0 = Math.max(0, Math.floor(z[0])), y0 = Math.max(0, Math.floor(z[1]));
    var x1 = Math.min(L, Math.ceil(z[0] + z[2])), y1 = Math.min(H, Math.ceil(z[1] + z[3]));
    var cibles = couleurs.map(function (c) { return typeof c === 'string' ? versRvb(c) : c; });
    var haut = -1, bas = -1, gauche = Infinity, droite = -1;
    for (var y = y0; y < y1; y++) {
      var depart = -1;
      for (var x = x0; x <= x1; x++) {
        var dedans = false;
        if (x < x1) {
          var o2 = (y * L + x) * canaux, r = px[o2], v = px[o2 + 1], b = px[o2 + 2];
          for (var c = 0; c < cibles.length && !dedans; c++) {
            var dr = r - cibles[c][0], dv = v - cibles[c][1], db = b - cibles[c][2];
            if (dr * dr + dv * dv + db * db < tol2) dedans = true;
          }
        }
        if (dedans) { if (depart < 0) depart = x; continue; }
        if (depart >= 0 && x - depart >= suite) {
          if (haut < 0) haut = y;
          bas = y;
          if (depart < gauche) gauche = depart;
          if (x - 1 > droite) droite = x - 1;
        }
        depart = -1;
      }
    }
    if (haut < 0) return null;
    return { haut: haut, bas: bas + 1, gauche: gauche, droite: droite + 1 };
  }

  /** Noms des courbes essayées : linear, puis quad à bounce × in, out, inout (table de moteur/courbes.js). */
  var TYPES_AJUSTES = ['quad', 'cubic', 'quart', 'quint', 'expo', 'sine', 'circle', 'back', 'elastic', 'bounce'];
  var MODES_AJUSTES = ['in', 'out', 'inout'];
  function nomsCourbes() {
    var r = ['linear'];
    TYPES_AJUSTES.forEach(function (t) { MODES_AJUSTES.forEach(function (m) { r.push(t + '-' + m); }); });
    return r;
  }
  function fonctionCourbe(nom) {
    var b = /^cubic-bezier\(([^)]*)\)$/.exec(nom);
    if (b) return C.courbe('cubic-bezier', 'in', b[1].split(',').map(Number));
    return C.courbeNommee(nom);
  }

  /** Dépassement au-delà de l'arrivée (fraction du chemin) et nombre de passages par l'arrivée après l'avoir atteinte. */
  function depassementDe(points) {
    var max = 0, passages = 0, signe = 0, atteint = false;
    points.forEach(function (p) {
      if (p.p > max) max = p.p;
      if (p.p >= 0.99) atteint = true;
      if (!atteint) return;
      var s = p.p > 1.01 ? 1 : p.p < 0.99 ? -1 : 0;
      if (s && s !== signe) { if (signe) passages++; signe = s; }
    });
    return { depassement: Math.max(0, max - 1), passages: passages };
  }

  /**
   * points : [{ t, p }] (avancée de 0 à 1 ; au-delà de 1 : dépassement) ; debut et fin : bornes du mouvement vu.
   * Durée libre de 1 à 2 fois la durée visible, par pas de 0,05 s ; départ caché possible (courbe « in ») ; meilleure erreur
   * quadratique. Dépassement de plus de 2 % : famille back (un seul dépassement) ou elastic (oscillations, ressort de S3).
   */
  function ajusterCourbe(points, debut, fin) {
    var Dv = Math.max(1e-3, fin - debut);
    var utiles = points.filter(function (p) { return p.t >= debut - 0.25 - 1e-9 && p.t <= fin + 0.25 + 1e-9; });
    if (utiles.length < 2) return null;
    var dep = depassementDe(utiles);
    var noms = nomsCourbes();
    var famille = null;
    if (dep.depassement > DEPASSEMENT) {
      famille = dep.passages >= 3 ? 'elastic' : 'back';
      noms = famille === 'back' ? ['back-out', 'back-inout'] : ['elastic-out', 'elastic-inout'];
      // Dépassement réglable en CSS (le back du moteur dépasse de 38 %) : cubic-bezier(0.34, y, 0.64, 1).
      if (famille === 'back') for (var y = 1.05; y <= 2.501; y += 0.05) noms.push('cubic-bezier(0.34, ' + arrondi(y, 2) + ', 0.64, 1)');
    }
    var meilleur = null;
    noms.forEach(function (nom) {
      var f = fonctionCourbe(nom);
      for (var D = Dv; D <= 2 * Dv + 1e-9; D += 0.05) {
        var cache = D - Dv;
        for (var s = debut - cache; s <= debut + 1e-9; s += 0.01) {
          var e = 0;
          for (var i = 0; i < utiles.length; i++) {
            var u = (utiles[i].t - s) / D;
            var d = utiles[i].p - f(u < 0 ? 0 : u > 1 ? 1 : u);
            e += d * d;
          }
          e = Math.sqrt(e / utiles.length);
          if (!meilleur || e < meilleur.erreur - 1e-12) meilleur = { nom: nom, debut: s, duree: D, erreur: e };
        }
      }
    });
    var r = {
      courbe: /^cubic-bezier/.test(meilleur.nom) ? 'back-out' : meilleur.nom,
      debut: arrondi(meilleur.debut), duree: arrondi(meilleur.duree), fin: arrondi(meilleur.debut + meilleur.duree),
      depassement: arrondi(dep.depassement * 100, 1), erreur: arrondi(meilleur.erreur, 4),
      verdict: meilleur.erreur <= 0.04 ? 'bon' : meilleur.erreur <= 0.1 ? 'approché' : 'mauvais',
      source: 'suivi',
    };
    if (/^cubic-bezier/.test(meilleur.nom)) r.css = meilleur.nom;
    if (famille === 'elastic') r.ressort = true;
    return r;
  }

  /** Mouvement de vie (rossark n° 7) : pendant une tenue, la taille ou la place du sujet varie de 1 à 5 % ; période par les
   *  passages à la moyenne. */
  function vieDe(temps, serie, tenue, nomPropriete) {
    var pts = [];
    for (var i = 0; i < temps.length; i++) if (temps[i] >= tenue.debut - 1e-9 && temps[i] <= tenue.fin + 1e-9 && serie[i] !== null) pts.push({ t: temps[i], v: serie[i] });
    if (pts.length < 6) return null;
    var moy = pts.reduce(function (s, p) { return s + p.v; }, 0) / pts.length;
    if (!(Math.abs(moy) > 1e-9)) return null;
    var min = Infinity, max = -Infinity;
    pts.forEach(function (p) { if (p.v < min) min = p.v; if (p.v > max) max = p.v; });
    var amplitude = (max - min) / 2 / Math.abs(moy);
    if (amplitude < 0.01 || amplitude > 0.05) return null;
    var passages = [];
    for (var k = 1; k < pts.length; k++) if ((pts[k - 1].v - moy) * (pts[k].v - moy) < 0) passages.push(pts[k].t);
    if (passages.length < 2) return null;
    var periode = 2 * (passages[passages.length - 1] - passages[0]) / (passages.length - 1);
    var conseil = nomPropriete === 'taille' ? '#077' : nomPropriete === 'y' ? '#072' : '#069';
    return { propriete: nomPropriete, amplitude: arrondi(amplitude * 100, 1), periode: arrondi(periode, 2), debut: tenue.debut, fin: tenue.fin, conseil: conseil };
  }

  /**
   * temps : instants des images ; bords : [{ haut, bas, gauche, droite } en % de l'image, ou null] ; f : sortie de fenetres().
   * -> { mouvements: [{ fenetre, propriete, de, a, unite, courbe… }], vie: [] }
   */
  function analyserSuivi(temps, bords, f) {
    var serie = function (fn) { return bords.map(function (b) { return b ? fn(b) : null; }); };
    var S = {
      x: serie(function (b) { return (b.gauche + b.droite) / 2; }),
      y: serie(function (b) { return (b.haut + b.bas) / 2; }),
      taille: serie(function (b) { return Math.sqrt(Math.max(0, b.droite - b.gauche) * Math.max(0, b.bas - b.haut)); }),
    };
    var valeurA = function (s, i) { for (var k = i; k >= 0; k--) if (s[k] !== null) return s[k]; return null; };
    var mouvements = [];
    f.fenetres.forEach(function (w, k) {
      var i0 = Math.max(0, w.images[0] - 1), i1 = w.images[1];
      var suivante = f.fenetres[k + 1];
      var iFin = suivante ? Math.max(i1, suivante.images[0] - 1) : temps.length - 1;
      var choix = null;
      Object.keys(S).forEach(function (nom) {
        var v0 = valeurA(S[nom], i0), v1 = valeurA(S[nom], iFin);
        if (v0 === null || v1 === null) return;
        var delta = Math.abs(v1 - v0);
        if (!choix || delta > choix.delta) choix = { nom: nom, v0: v0, v1: v1, delta: delta };
      });
      if (!choix || choix.delta < 0.5) return;
      var pts = [];
      for (var i = i0; i <= iFin; i++) if (S[choix.nom][i] !== null) pts.push({ t: temps[i], p: (S[choix.nom][i] - choix.v0) / (choix.v1 - choix.v0) });
      var c = ajusterCourbe(pts, w.debut, w.fin);
      if (!c) return;
      mouvements.push(Object.assign({ fenetre: w.n, propriete: choix.nom, de: arrondi(choix.v0, 2), a: arrondi(choix.v1, 2), unite: choix.nom === 'taille' ? '% de l\'image (côté moyen)' : '% de l\'image' }, c));
    });
    var vie = [];
    (f.tenues || []).forEach(function (t) {
      Object.keys(S).forEach(function (nom) { var v = vieDe(temps, S[nom], t, nom); if (v) vie.push(v); });
    });
    return { mouvements: mouvements, vie: vie };
  }

  // --- Couleurs ----------------------------------------------------------------------------------------------------

  var LIN = (function () { var t = new Float64Array(256); for (var i = 0; i < 256; i++) { var c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); } return t; })();
  function oklab(r, g, b) {
    var R = LIN[r], G = LIN[g], B = LIN[b];
    var l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    var m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    var s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function versHex(lab) {
    var L = lab[0], a = lab[1], b = lab[2];
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    var lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
    return '#' + lin.map(function (c) {
      var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
    }).join('');
  }
  function distance(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }
  function luminanceHex(hex) {
    var c = versRvb(hex).map(function (v) { return LIN[v]; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrasteHex(a, b) { var x = luminanceHex(a), y = luminanceHex(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function graineur(graine) {
    var s = graine >>> 0;
    return function () { s = (s + 0x6d2b79f5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /**
   * images : [{ rgb, largeur, hauteur }] ; k-moyennes en OKLab (k ≤ 6, départ k-means++ semé), sur les couleurs exactes
   * pondérées par leur nombre ; centres plus proches que 0,03 fondus, parts sous 1 % rendues au plus proche.
   */
  function palette(images, o) {
    o = o || {};
    var kMax = o.kMax || K_MAX;
    var hasard = graineur(o.graine === undefined ? 1 : o.graine);
    var compte = new Map();
    var bord = new Map();
    images.forEach(function (im, n) {
      var L = im.largeur, H = im.hauteur, d = im.rgb;
      for (var y = 0; y < H; y++) for (var x = 0; x < L; x++) {
        var i = (y * L + x) * 3, cle = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        compte.set(cle, (compte.get(cle) || 0) + 1);
        if (n === 0 && (x === 0 || y === 0 || x === L - 1 || y === H - 1)) bord.set(cle, (bord.get(cle) || 0) + 1);
      }
    });
    var cles = Array.from(compte.keys()).sort(function (a, b) { return a - b; });
    var pts = cles.map(function (c) { return oklab(c >> 16, (c >> 8) & 255, c & 255); });
    var poids = cles.map(function (c) { return compte.get(c); });
    var total = poids.reduce(function (s, w) { return s + w; }, 0);
    // Départ : la couleur la plus fréquente, puis k-means++ (tirage semé, proportionnel au poids × distance²).
    var premier = 0;
    for (var p = 1; p < pts.length; p++) if (poids[p] > poids[premier]) premier = p;
    var centres = [pts[premier].slice()];
    var d2 = pts.map(function (q) { var d = distance(q, centres[0]); return d * d; });
    while (centres.length < kMax) {
      var somme = 0;
      for (var q = 0; q < pts.length; q++) somme += d2[q] * poids[q];
      if (!(somme > 1e-9)) break;
      var cible = hasard() * somme, choisi = pts.length - 1;
      for (var q2 = 0; q2 < pts.length; q2++) { cible -= d2[q2] * poids[q2]; if (cible <= 0) { choisi = q2; break; } }
      centres.push(pts[choisi].slice());
      for (var q3 = 0; q3 < pts.length; q3++) { var dd = distance(pts[q3], centres[centres.length - 1]); if (dd * dd < d2[q3]) d2[q3] = dd * dd; }
    }
    var groupe = new Int32Array(pts.length);
    var plusProche = function (q, liste) { var m = 0, dm = Infinity; for (var c = 0; c < liste.length; c++) { var d = distance(q, liste[c]); if (d < dm) { dm = d; m = c; } } return m; };
    var iterer = function () {
      for (var it = 0; it < 40; it++) {
        var change = false;
        for (var a = 0; a < pts.length; a++) { var g = plusProche(pts[a], centres); if (g !== groupe[a] || it === 0) { change = change || g !== groupe[a]; groupe[a] = g; } }
        var acc = centres.map(function () { return [0, 0, 0, 0]; });
        for (var b = 0; b < pts.length; b++) { var s = acc[groupe[b]], w = poids[b]; s[0] += pts[b][0] * w; s[1] += pts[b][1] * w; s[2] += pts[b][2] * w; s[3] += w; }
        centres = centres.map(function (c, k) { return acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : c; });
        if (!change && it > 0) break;
      }
    };
    iterer();
    // Fondre les centres voisins, retirer les petites parts, puis une dernière passe.
    for (;;) {
      var parts = centres.map(function () { return 0; });
      for (var c1 = 0; c1 < pts.length; c1++) parts[groupe[c1]] += poids[c1];
      var garder = [];
      centres.forEach(function (c, k) {
        if (parts[k] / total < 0.01) return;
        if (garder.some(function (g) { return distance(g, c) < 0.03; })) return;
        garder.push(c);
      });
      if (!garder.length) garder = [centres[0]];
      if (garder.length === centres.length) break;
      centres = garder;
      for (var c2 = 0; c2 < pts.length; c2++) groupe[c2] = plusProche(pts[c2], centres);
      iterer();
    }
    var partsFinales = centres.map(function () { return 0; });
    for (var c3 = 0; c3 < pts.length; c3++) partsFinales[groupe[c3]] += poids[c3];
    var couleurs = centres.map(function (c, k) {
      return { hex: versHex(c), oklab: c.map(function (x) { return arrondi(x, 4); }), part: arrondi(partsFinales[k] / total, 4), chroma: arrondi(Math.hypot(c[1], c[2]), 4) };
    }).sort(function (a, b) { return b.part - a.part || (a.hex < b.hex ? -1 : 1); });
    // Fond : la couleur la plus présente sur le bord de la première image.
    var surBord = couleurs.map(function () { return 0; });
    bord.forEach(function (n, cle) {
      var lab = oklab(cle >> 16, (cle >> 8) & 255, cle & 255);
      surBord[plusProche(lab, couleurs.map(function (c) { return c.oklab; }))] += n;
    });
    var iFond = 0;
    for (var f = 1; f < couleurs.length; f++) if (surBord[f] > surBord[iFond]) iFond = f;
    var fond = couleurs[iFond];
    var autres = couleurs.filter(function (c) { return c !== fond && c.part >= 0.02; });
    var encre = autres.length ? autres.slice().sort(function (a, b) { return Math.abs(b.oklab[0] - fond.oklab[0]) - Math.abs(a.oklab[0] - fond.oklab[0]); })[0] : null;
    var accents = autres.filter(function (c) { return c !== encre && c.chroma >= 0.05; });
    // Clé de valeur : luminance (L d'OKLab) médiane des points.
    var parL = pts.map(function (q, k) { return [q[0], poids[k]]; }).sort(function (a, b) { return a[0] - b[0]; });
    var mi = total / 2, Lmed = 0;
    for (var z = 0; z < parL.length; z++) { mi -= parL[z][1]; if (mi <= 0) { Lmed = parL[z][0]; break; } }
    var cle = Lmed > 0.7 ? 'claire' : Lmed < 0.4 ? 'sombre' : 'moyenne';
    var chaudes = accents.length ? accents : encre && encre.chroma >= 0.05 ? [encre] : [];
    return {
      couleurs: couleurs, fond: fond.hex, encre: encre ? encre.hex : null, accents: accents.map(function (c) { return c.hex; }),
      cle: cle, luminanceMediane: arrondi(Lmed, 3), contraste: encre ? arrondi(contrasteHex(fond.hex, encre.hex), 2) : null,
      proposition: chaudes.length ? { primaire: chaudes[0].hex, accent: (chaudes[1] || chaudes[0]).hex } : null,
    };
  }

  // --- La main (trait, bords, grain, trame) ------------------------------------------------------------------------

  /** gris : Uint8Array (L × H) -> mesures de la main. */
  function mesurerMain(gris, L, H) {
    var N = L * H;
    var G = new Float32Array(N);
    var at = function (x, y) { return gris[Math.min(H - 1, Math.max(0, y)) * L + Math.min(L - 1, Math.max(0, x))]; };
    for (var y = 0; y < H; y++) for (var x = 0; x < L; x++) {
      var gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      var gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      G[y * L + x] = Math.sqrt(gx * gx + gy * gy) / 1020;
    }
    // Bords : gradient moyen sur les contours (points dont le gradient dépasse 0,15).
    var sc = 0, nc = 0;
    for (var i = 0; i < N; i++) if (G[i] > 0.15) { sc += Math.min(1, G[i]); nc++; }
    var durete = nc ? sc / nc : 0;
    // Grain : écart type du reste haute fréquence (gris − flou 3 × 3) sur les aplats (gradient sous 0,05).
    var reste = new Float32Array(N), s2 = 0, na = 0;
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < L; x2++) {
      var m = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) m += at(x2 + dx, y2 + dy);
      var r = gris[y2 * L + x2] - m / 9;
      reste[y2 * L + x2] = r;
      if (G[y2 * L + x2] < 0.05) { s2 += r * r; na++; }
    }
    var grain = na ? Math.sqrt(s2 / na) : 0;
    // Trame régulière : pic de l'autocorrélation du reste (pas de 3 à 15 points), le long des lignes et des colonnes, avec un
    // creux à la demi-période (une trame de points alterne ; un aplat uni ou un filet, non).
    var energie = 0;
    for (var e = 0; e < N; e++) energie += reste[e] * reste[e];
    var trame = { presente: false, periode: null, force: 0 };
    if (energie > N * 1) {
      var correlation = function (dx, dy) {
        var s = 0;
        for (var y3 = 0; y3 + dy < H; y3++) for (var x3 = 0; x3 + dx < L; x3++) s += reste[y3 * L + x3] * reste[(y3 + dy) * L + x3 + dx];
        return s / energie;
      };
      var cx = [], cy = [];
      for (var k = 1; k <= 16; k++) { cx[k] = correlation(k, 0); cy[k] = correlation(0, k); }
      var pic = function (c, k) { return c[k] > c[k - 1] && c[k] >= c[k + 1] && c[k] > 0.25 && c[k] - c[Math.max(1, Math.round(k / 2))] > 0.4; };
      for (var k2 = 3; k2 <= 15; k2++) {
        if (pic(cx, k2) && pic(cy, k2) && cx[k2] > trame.force) trame = { presente: true, periode: k2, force: arrondi(Math.min(cx[k2], cy[k2]), 3) };
      }
    }
    // Trait : points d'encre (plus sombres que le fond de 40, ou plus clairs sur un fond sombre), épaisseur = plus courte des
    // deux suites (ligne, colonne) ; trait fin si elle ne dépasse pas 2 % du petit côté.
    var valeurs = [];
    for (var v = 0; v < N; v += Math.max(1, Math.floor(N / 20000))) valeurs.push(gris[v]);
    var fondGris = mediane(valeurs);
    var sombre = fondGris < 100;
    var encre = new Uint8Array(N), nEncre = 0;
    for (var q = 0; q < N; q++) if (sombre ? gris[q] > fondGris + 40 : gris[q] < fondGris - 40) { encre[q] = 1; nEncre++; }
    var hor = new Uint16Array(N), ver = new Uint16Array(N);
    for (var y4 = 0; y4 < H; y4++) {
      for (var x4 = 0; x4 < L;) {
        if (!encre[y4 * L + x4]) { x4++; continue; }
        var x5 = x4; while (x5 < L && encre[y4 * L + x5]) x5++;
        for (var u = x4; u < x5; u++) hor[y4 * L + u] = x5 - x4;
        x4 = x5;
      }
    }
    for (var x6 = 0; x6 < L; x6++) {
      for (var y6 = 0; y6 < H;) {
        if (!encre[y6 * L + x6]) { y6++; continue; }
        var y7 = y6; while (y7 < H && encre[y7 * L + x6]) y7++;
        for (var w = y6; w < y7; w++) ver[w * L + x6] = y7 - y6;
        y6 = y7;
      }
    }
    var limite = Math.max(2, Math.round(0.02 * Math.min(L, H)));
    var fins = [];
    for (var p = 0; p < N; p++) if (encre[p]) { var ep = Math.min(hor[p], ver[p]); if (ep <= limite) fins.push(ep); }
    var present = nEncre / N >= 0.002 && fins.length >= 0.5 * nEncre;
    var largeur = present ? mediane(fins) : null;
    var moy = fins.length ? fins.reduce(function (a, b) { return a + b; }, 0) / fins.length : 0;
    var cv = fins.length && moy ? Math.sqrt(fins.reduce(function (a, b) { return a + (b - moy) * (b - moy); }, 0) / fins.length) / moy : 0;
    return {
      trait: { present: present, largeur: largeur, largeurPourcent: present ? arrondi(largeur / H * 100, 2) : null, regulier: present ? cv < 0.35 : null, encre: arrondi(nEncre / N, 4), clairSurSombre: sombre },
      bords: { durete: arrondi(durete, 3), nets: durete >= 0.55, doux: durete < 0.35 },
      grain: { ecart: arrondi(grain, 2), visible: grain >= 3, marque: grain >= 6 },
      trame: trame,
    };
  }

  /** Plusieurs images clés -> une mesure : médianes, et la majorité pour oui / non. */
  function resumerMain(liste) {
    if (!liste.length) return null;
    var maj = function (fn) { return liste.filter(fn).length * 2 > liste.length; };
    var med = function (fn) { var v = liste.map(fn).filter(function (x) { return x !== null && x !== undefined; }); return v.length ? arrondi(mediane(v), 3) : null; };
    var present = maj(function (m) { return m.trait.present; });
    var main = {
      trait: { present: present, largeur: present ? med(function (m) { return m.trait.largeur; }) : null, largeurPourcent: present ? med(function (m) { return m.trait.largeurPourcent; }) : null,
        regulier: present ? maj(function (m) { return m.trait.regulier; }) : null, clairSurSombre: maj(function (m) { return m.trait.clairSurSombre; }) },
      bords: { durete: med(function (m) { return m.bords.durete; }) },
      grain: { ecart: med(function (m) { return m.grain.ecart; }) },
      trame: { presente: maj(function (m) { return m.trame.presente; }), periode: med(function (m) { return m.trame.periode; }) },
    };
    main.bords.nets = main.bords.durete >= 0.55;
    main.bords.doux = main.bords.durete < 0.35;
    main.grain.visible = main.grain.ecart >= 3;
    main.grain.marque = main.grain.ecart >= 6;
    if (!main.trame.presente) main.trame.periode = null;
    main.phrase = phraseMain(main);
    return main;
  }

  function phraseMain(m) {
    var morceaux = [];
    if (m.trait.present) morceaux.push('trait ' + (m.trait.largeurPourcent !== null && m.trait.largeurPourcent > 1 ? 'épais' : 'fin') + ' et ' + (m.trait.regulier ? 'régulier' : 'irrégulier') + (m.trait.clairSurSombre ? ', clair sur fond sombre' : ''));
    else morceaux.push('sans trait (formes en aplats)');
    morceaux.push(m.bords.nets ? 'bords nets' : m.bords.doux ? 'bords doux' : 'bords assez nets');
    morceaux.push(m.grain.marque ? 'grain marqué' : m.grain.visible ? 'grain léger' : 'aplats sans grain');
    if (m.trame.presente) morceaux.push('trame de points régulière');
    return morceaux.join(', ');
  }

  // --- Style du catalogue le plus proche ---------------------------------------------------------------------------

  /** Profil de main d'un style, tiré de son identité (signature, modules, tons, durée type). */
  function profilStyle(id) {
    var sig = String(id.signature || '').toLowerCase();
    var modules = id.modules || [];
    var a = function (re) { return re.test(sig); };
    return {
      style: id.style,
      ton: ((id.couleur && (id.couleur.tonDefaut || (id.couleur.tons || [])[0])) || 'clair'),
      trait: a(/trait|feutre|crayon|craie|croquis|filet|hachure|écrit|s'écrit/) || modules.indexOf('encre') >= 0 || modules.indexOf('une-ligne') >= 0,
      grain: a(/grain|cire|poussière/) || modules.indexOf('riso') >= 0,
      trame: a(/trame/),
      doux: a(/lavis|lumière douce|respirent|organique|flou/) || modules.indexOf('encre') >= 0,
      aplats: a(/aplat/) || modules.indexOf('aplats') >= 0 || modules.indexOf('iso') >= 0,
      dureeType: (id.mouvement && id.mouvement.dureeType) || null,
    };
  }

  /**
   * reference : { ton: 'clair'|'sombre'|null, main, dureeMouvement } -> styles classés : [{ style, score, raisons }]
   * Un point par trait commun (ton, trait, grain, trame, bords doux, aplats), un demi-point pour une durée type proche.
   */
  function stylesProches(reference, identites, n) {
    var m = reference.main || { trait: {}, bords: {}, grain: {}, trame: {} };
    var r = identites.map(profilStyle).map(function (p) {
      var score = 0, raisons = [];
      var point = function (ok, raison) { if (ok) { score += 1; raisons.push(raison); } };
      if (reference.ton) point(p.ton === reference.ton, reference.ton === 'sombre' ? 'fond sombre' : 'fond clair');
      point(!!m.trait.present === p.trait, m.trait.present ? 'un trait dessiné' : 'des formes sans trait');
      point(!!m.grain.visible === p.grain, m.grain.visible ? 'du grain' : 'des aplats sans grain');
      if (m.trame.presente) point(p.trame, 'une trame de points');
      point(!!m.bords.doux === p.doux, m.bords.doux ? 'des bords doux' : 'des bords nets');
      if (!m.trait.present) point(p.aplats, 'des aplats');
      if (reference.dureeMouvement && p.dureeType && Math.abs(Math.log(reference.dureeMouvement / p.dureeType)) < Math.log(1.5)) { score += 0.5; raisons.push('des mouvements de même durée'); }
      return { style: p.style, score: score, raisons: raisons };
    });
    r.sort(function (a, b) { return b.score - a.score || (a.style < b.style ? -1 : 1); });
    return r.slice(0, n || 3);
  }

  // --- Planches, alignement, comparaison ---------------------------------------------------------------------------

  /** Planche de 24 images (6 colonnes, 4 rangées) : 1 568 px au plus de côté et 1,15 Mpx au plus. */
  function misePlanche(L, H, o) {
    o = o || {};
    var col = 6, rang = 4, ecart = 8, legende = 22, titre = 40;
    for (var w = 252; w >= 40; w--) {
      var h = Math.max(1, Math.round(w * H / L));
      var LL = col * w + (col + 1) * ecart, HH = titre + rang * (h + legende) + (rang + 1) * ecart;
      if (LL <= 1568 && HH <= 1568 && LL * HH <= 1150000) return { colonnes: col, rangees: rang, largeur: w, hauteur: h, ecart: ecart, legende: legende, titre: titre, L: LL, H: HH, parPlanche: col * rang };
    }
    return { colonnes: col, rangees: rang, largeur: 40, hauteur: Math.max(1, Math.round(40 * H / L)), ecart: ecart, legende: legende, titre: titre, parPlanche: col * rang };
  }

  function etiquette(i, t) { return '#' + (i + 1) + '  ' + fixe(t) + ' s'; }

  /** Ramène une activité (instants quelconques) sur une grille régulière k / cadence (somme des changements de chaque pas). */
  function surGrille(temps, act, depart, cadence, n) {
    var g = new Array(n).fill(0);
    for (var i = 1; i < act.length; i++) {
      var k = Math.ceil((temps[i] - depart) * cadence - 1e-6);
      if (k >= 0 && k < n) g[k] += act[i];
    }
    return g;
  }

  /** Décalage (en images, ± 15) qui rapproche le plus deux courbes ramenées à leur maximum, sur leurs 10 premières secondes. */
  function aligner(a, b, cadence) {
    var lim = Math.round(DUREE_MAX * (cadence || 30));
    var norm = function (x) { var m = Math.max.apply(null, x.concat([1e-9])); return x.slice(0, lim).map(function (v) { return v / m; }); };
    var A = norm(a), B = norm(b);
    var meilleur = { decalage: 0, ecart: Infinity };
    for (var d = -DECALAGE_MAX; d <= DECALAGE_MAX; d++) {
      var s = 0, n = 0;
      for (var i = 0; i < A.length; i++) { var j = i + d; if (j < 0 || j >= B.length) continue; s += Math.abs(A[i] - B[j]); n++; }
      if (n < Math.min(A.length, B.length) / 2) continue;
      var e = s / n;
      if (e < meilleur.ecart - 1e-12 || (Math.abs(e - meilleur.ecart) <= 1e-12 && Math.abs(d) < Math.abs(meilleur.decalage))) meilleur = { decalage: d, ecart: e };
    }
    return { decalage: meilleur.decalage, ecart: arrondi(meilleur.ecart, 4) };
  }

  var ORDINAUX = ['premier', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième'];
  function nomMouvement(n) { return (n === 1 ? 'le premier' : 'le ' + (ORDINAUX[n - 1] || n + 'e')) + ' mouvement'; }

  /**
   * ref, notre : fenêtres (instants relatifs au début de chacune) ; decalage : s à retirer à notre scène. Les mouvements sont
   * appariés dans l'ordre. -> { ecarts: [{ n, debut, fin, pic }], ecartMax, conforme, phrases }
   */
  function comparerFenetres(ref, notre, decalage, niveau) {
    var ecarts = [], phrases = [];
    var n = Math.min(ref.length, notre.length);
    var max = 0;
    for (var i = 0; i < n; i++) {
      var r = ref[i], s = notre[i];
      var e = { n: i + 1, debut: arrondi(s.debut - decalage - r.debut), fin: arrondi(s.fin - decalage - r.fin), pic: arrondi(s.pic - decalage - r.pic),
        reference: { debut: r.debut, fin: r.fin, pic: r.pic }, scene: { debut: arrondi(s.debut - decalage), fin: arrondi(s.fin - decalage), pic: arrondi(s.pic - decalage) } };
      ecarts.push(e);
      ['debut', 'fin', 'pic'].forEach(function (k) {
        max = Math.max(max, Math.abs(e[k]));
        if (Math.abs(e[k]) > ECART_MOUVEMENT + 1e-9) {
          var quoi = k === 'debut' ? 'commence' : k === 'fin' ? 'finit' : 'atteint sa plus grande vitesse';
          phrases.push(nomMouvement(i + 1).replace(/^le /, 'Le ') + ' ' + quoi + ' ' + virgule(Math.abs(e[k]), 2) + ' s plus ' + (e[k] > 0 ? 'tard' : 'tôt') + ' que dans votre vidéo.');
        }
      });
    }
    if (ref.length !== notre.length) phrases.push('Votre vidéo a ' + ref.length + ' mouvement' + (ref.length > 1 ? 's' : '') + ', la scène ' + notre.length + '.');
    var conforme = ref.length === notre.length && (niveau !== 'mouvement' || max <= ECART_MOUVEMENT + 1e-9);
    return { ecarts: ecarts, ecartMax: arrondi(max), conforme: conforme, phrases: phrases };
  }

  // --- Niveau de fidélité, adresses, fiche -------------------------------------------------------------------------

  var REFUS_PIXEL = 'Je reprends le mouvement et le rythme, pas l\'image : les dessins, le logo et les textes de cette vidéo appartiennent à leur auteur.';
  var REFUS_PERSONNAGE = 'Je ne peux pas recopier ce personnage : il appartient à sa marque. Je peux en créer un original qui bouge de la même façon.';
  var REFUS_LOGO = 'Je ne peux pas recopier ce logo ni cette marque : ils appartiennent à leur propriétaire. Je reprends le mouvement avec votre logo à vous.';
  var REFUS_MUSIQUE = 'Je ne reprends pas la musique de cette vidéo : elle appartient à son auteur. Je peux en composer une au même tempo.';
  var REFUS_ADRESSE = 'Je ne télécharge pas de vidéo : enregistrez-la dans le dossier de la vidéo, si vous en avez le droit.';
  var NIVEAUX = {
    esprit: { nom: 'dans l\'esprit', concorde: 'rythme global, familles de mouvements, ordre, sens', differe: 'minutage exact, couleurs, formes, textes',
      annonce: 'Je m\'inspire de votre vidéo : même rythme d\'ensemble, mêmes familles de mouvements, dans le même ordre et le même sens ; le minutage exact, les couleurs, les formes et les textes seront les vôtres.' },
    mouvement: { nom: 'même mouvement', concorde: 'début, durée et décalage de chaque étape à 0,08 s près, famille de courbe, sens et ampleur relative', differe: 'textes, couleurs, polices, images',
      annonce: 'Je reprends le même mouvement : chaque étape commence et dure comme dans votre vidéo, à 0,08 s près, avec la même courbe ; les textes, les couleurs, les polices et les images seront les vôtres.' },
  };
  var MOTS_PIXEL = /(identique|copie exacte|copie conforme|au pixel|pixel près|exactement la même vidéo|recopie(r)? (tout|exactement))/i;
  var MOTS_MOUVEMENT = /(fais pareil|fais la même chose|faire pareil|pareil que|exactement le même|même mouvement|mêmes mouvements|même timing|même minutage|au même moment|à l'image près)/i;
  var MOTS_COPIE = /(recopie|copie|redessine|reprends|reprend|reproduis|reproduire|garde|mets|même|pareil)/i;

  /** Ce que la phrase demande : niveau (esprit par défaut), refus éventuel, annonce à dire. */
  function niveauFidelite(phrase) {
    var t = String(phrase || '').toLowerCase().replace(/’/g, '\'');
    var copie = MOTS_COPIE.test(t);
    if (copie && /(personnage|mascotte|héros|héroïne|bonhomme)/.test(t)) return { niveau: null, refus: REFUS_PERSONNAGE };
    if (copie && /(logo|marque)/.test(t)) return { niveau: null, refus: REFUS_LOGO };
    if (copie && /(musique|chanson|jingle|bande[- ]son)/.test(t)) return { niveau: null, refus: REFUS_MUSIQUE };
    if (MOTS_PIXEL.test(t) || (copie && /(les textes|son texte|ses textes|les dessins|les images)/.test(t))) return { niveau: null, refus: REFUS_PIXEL };
    var niveau = MOTS_MOUVEMENT.test(t) ? 'mouvement' : 'esprit';
    var N = NIVEAUX[niveau];
    return { niveau: niveau, nom: N.nom, concorde: N.concorde, differe: N.differe, annonce: N.annonce, refus: null };
  }

  /** Une adresse internet (on ne télécharge jamais). */
  function estAdresse(texte) { return /^\s*((https?|ftp):\/\/|www\.)/i.test(String(texte || '')) || /^[a-z0-9.-]+\.(com|fr|net|org|io|tv|be|ch|ca)(\/|$)/i.test(String(texte || '').trim()); }

  var COLONNES = ['Élément', 'Propriété', 'Déclencheur', 'Début', 'Durée', 'Décalage', 'De → à', 'Courbe', 'Source'];

  /** Squelette de fiche.md : une ligne par mouvement mesuré ; ce que la mesure ne sait pas est noté « ? », à remplir. */
  function ficheSquelette(o) {
    var lignes = ['# Fiche d\'imitation : ' + o.nom, '', 'Référence : ' + o.fichier + ', de ' + virgule(o.de, 2) + ' à ' + virgule(o.a, 2) + ' s. Niveau : ' + NIVEAUX[o.niveau || 'esprit'].nom + '.', '',
      'Une ligne par élément et par propriété. Chaque chiffre dit sa source (fenêtre n°, suivi, planche n°). Aucun « ? » ne reste à la fin.', '',
      '| ' + COLONNES.join(' | ') + ' |', '|' + COLONNES.map(function () { return '---'; }).join('|') + '|'];
    o.fenetres.forEach(function (f) {
      var s = (o.suivi || []).filter(function (m) { return m.fenetre === f.n; })[0];
      var a = (o.parActivite || {})[f.n];
      var courbe = s ? s.courbe + (s.css ? ' (' + s.css + ')' : '') : a ? a.courbe + ' (' + a.mode + ')' : '?';
      var source = 'fenêtre ' + f.n + (s ? ', suivi' : a ? ', règle du tiers' : '') + ', planche ' + (Math.floor(f.images[0] / 24) + 1);
      lignes.push('| ? | ' + (s ? s.propriete : '?') + ' | ? | ' + fixe(f.debut) + ' s | ' + fixe(f.duree) + ' s | ? | ' + (s ? virgule(s.de, 1) + ' → ' + virgule(s.a, 1) : '?') + ' | ' + courbe + ' | ' + source + ' |');
    });
    lignes.push('');
    return lignes.join('\n');
  }

  /** fiche.md -> { ok, lignes, manques: [phrases] } : chaque ligne a ses 9 colonnes, une source, et aucun « ? ». */
  function verifierFiche(texte) {
    var manques = [], lignes = 0;
    String(texte || '').replace(/\r\n/g, '\n').split('\n').forEach(function (l, i) {
      if (!/^\|/.test(l) || /^\|\s*(---|Élément)/.test(l)) return;
      var cases = l.split('|').slice(1, -1).map(function (c) { return c.trim(); });
      lignes++;
      if (cases.length !== COLONNES.length) { manques.push('Ligne ' + (i + 1) + ' : ' + cases.length + ' colonnes au lieu de ' + COLONNES.length + '.'); return; }
      cases.forEach(function (c, k) { if (c === '?' || c === '' || /\?$/.test(c)) manques.push('Ligne ' + (i + 1) + ' : « ' + COLONNES[k] + ' » reste à remplir.'); });
      if (!/(fenêtre|suivi|planche)/i.test(cases[8])) manques.push('Ligne ' + (i + 1) + ' : la source du chiffre manque (fenêtre n°, suivi, planche n°).');
    });
    if (!lignes) manques.push('La fiche n\'a aucune ligne.');
    return { ok: !manques.length, lignes: lignes, manques: manques };
  }

  return {
    LARGEUR: LARGEUR, SEUIL: SEUIL, SEUIL_BAS: SEUIL_BAS, COUPE: COUPE, TENUE: TENUE, TOLERANCE: TOLERANCE, SUITE: SUITE, DUREE_MAX: DUREE_MAX, IMAGES_MAX: IMAGES_MAX,
    ECART_MOUVEMENT: ECART_MOUVEMENT, DECALAGE_MAX: DECALAGE_MAX, DEPASSEMENT: DEPASSEMENT, K_MAX: K_MAX, NIVEAUX: NIVEAUX, COLONNES: COLONNES, COURBES_VIVANT: COURBES_VIVANT,
    REFUS_PIXEL: REFUS_PIXEL, REFUS_PERSONNAGE: REFUS_PERSONNAGE, REFUS_LOGO: REFUS_LOGO, REFUS_MUSIQUE: REFUS_MUSIQUE, REFUS_ADRESSE: REFUS_ADRESSE,
    reduire: reduire, sansAlpha: sansAlpha, flouBoite: flouBoite, activite: activite, fenetres: fenetres, courbeParActivite: courbeParActivite,
    bordsSujet: bordsSujet, nomsCourbes: nomsCourbes, ajusterCourbe: ajusterCourbe, analyserSuivi: analyserSuivi,
    oklab: oklab, versHex: versHex, contrasteHex: contrasteHex, palette: palette,
    mesurerMain: mesurerMain, resumerMain: resumerMain, phraseMain: phraseMain, profilStyle: profilStyle, stylesProches: stylesProches,
    misePlanche: misePlanche, etiquette: etiquette, surGrille: surGrille, aligner: aligner, comparerFenetres: comparerFenetres,
    niveauFidelite: niveauFidelite, estAdresse: estAdresse, ficheSquelette: ficheSquelette, verifierFiche: verifierFiche, mediane: mediane, virgule: virgule, fixe: fixe,
  };
});
