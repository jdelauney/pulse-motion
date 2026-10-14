/* Pulse Motion – fragmentation des éléments en particules : calculs sur le processeur, une fois par effet.
 *
 * dimensionsPhoto(largeurCqh, hauteurCqh, hauteurSortie, densite) -> { largeur, hauteur }
 *   résolution de la photographie d'un élément : sa boîte en pixels de sortie (hauteurSortie px pour 100 cqh), divisée
 *   par √densité, COTE_MAX px au plus sur le grand côté.
 * listerPixels(photo) -> { total, donnees: Float32Array(4 × total), cote, demi }
 *   photo : { largeur, hauteur, rgba (non prémultiplié), largeurCqh, hauteurCqh } ; pixels opaques (alpha > 0,1) dans
 *   l'ordre des lignes. Par pixel : x, y (cqh locaux sans échelle, relatifs au centre de la boîte, centre du pixel),
 *   r × 256 + v, b × 256 + a + 65536 × drapeaux (entiers exacts en f32 ; drapeaux : 1 entre en fondu, 2 sort en fondu).
 * pasPremier(total, graine), permuter(liste, pas) : particule n -> pixel de rang (n × pas) mod total.
 * cleHilbert(x, y, ordre), ordonnerHilbert([{ liste, repere }]) : listes triées le long d'une courbe de Hilbert, dans le
 *   repère commun de la scène (repere : { centre, angle, echelle }, comme les obstacles : monde = centre + R(angle)(l·echelle)).
 * apparier(a, b) -> { total, a, b } : particule i ↔ pixel ⌊i·nA/N⌋ de a et ⌊i·nB/N⌋ de b (N = max) ; une particule en
 *   double d'un côté entre (côté a) ou sort (côté b) en fondu : bijection sur le plus petit ensemble.
 * decouper(polygone, a, b, c), aire(polygone), voronoi({ largeur, hauteur, morceaux, graine, origine }), eclats(cellules) :
 *   pavage de Voronoï de la boîte par découpe de demi-plans ; éclats : 36 nombres chacun (centre, sommets, rayon englobant).
 * ajusterCapacites(effet, totaux) -> effet : nombre de particules des émetteurs de fragments fixé (salve à τ = 0),
 *   capacités des sous-émetteurs recalculées (copie).
 * pasDe(tau), raccord(effet, tau) -> { ancre, cible } : éléments cachés à τ (le moteur pose la classe pm-fragment-cache) ;
 *   le pas est celui de la simulation (P.Simulation.avancer).
 *
 * Module pur : chargé tel quel dans la page (global M.fragments) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.fragments = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PAS = 1 / 120;
  var SEUIL_ALPHA = 26;       // alpha > 0,1
  var PIXELS_MAX = 1000000;
  var COTE_MAX = 1024;
  var SOMMETS_MAX = 16;
  var FLOTTANTS_ECLAT = 36;
  var ORDRE_HILBERT = 10;     // grille de 1024 × 1024
  var RANGS = 1048576;        // 2^20 : rang d'un pixel dans une clé de tri (PIXELS_MAX < RANGS)

  function dimensionsPhoto(largeurCqh, hauteurCqh, hauteurSortie, densite) {
    var l = largeurCqh * hauteurSortie / 100;
    var h = hauteurCqh * hauteurSortie / 100;
    var k = Math.min(1, COTE_MAX / Math.max(l, h, 1e-9)) / Math.sqrt(densite || 1);
    return { largeur: Math.max(1, Math.round(l * k)), hauteur: Math.max(1, Math.round(h * k)) };
  }

  function listerPixels(photo) {
    var L = photo.largeur;
    var H = photo.hauteur;
    var rgba = photo.rgba;
    var total = 0;
    for (var i = 0; i < L * H; i++) if (rgba[i * 4 + 3] >= SEUIL_ALPHA) total++;
    var d = new Float32Array(total * 4);
    var cx = photo.largeurCqh / L;
    var cy = photo.hauteurCqh / H;
    var k = 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < L; x++) {
        var j = (y * L + x) * 4;
        if (rgba[j + 3] < SEUIL_ALPHA) continue;
        d[k] = (x + 0.5) * cx - photo.largeurCqh / 2;
        d[k + 1] = (y + 0.5) * cy - photo.hauteurCqh / 2;
        d[k + 2] = rgba[j] * 256 + rgba[j + 1];
        d[k + 3] = rgba[j + 2] * 256 + rgba[j + 3];
        k += 4;
      }
    }
    return { total: total, donnees: d, cote: Math.max(cx, cy), demi: [photo.largeurCqh / 2, photo.hauteurCqh / 2] };
  }

  function pgcd(a, b) {
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  /** Pas premier avec total, proche du nombre d'or × total (dispersion), décalé par la graine. */
  function pasPremier(total, graine) {
    if (total <= 2) return 1;
    var p = (Math.floor(total * 0.6180339887) + ((graine >>> 0) % 97)) % total || 1;
    while (pgcd(p, total) !== 1) p = (p % total) + 1;
    return p;
  }

  function copieListe(liste, donnees) {
    return { total: liste.total, donnees: donnees, cote: liste.cote, demi: liste.demi.slice() };
  }

  function permuter(liste, pas) {
    var t = liste.total;
    var d = new Float32Array(t * 4);
    for (var n = 0; n < t; n++) {
      var r = (n * pas) % t;
      d.set(liste.donnees.subarray(r * 4, r * 4 + 4), n * 4);
    }
    return copieListe(liste, d);
  }

  /** Rang de la case (x, y) le long de la courbe de Hilbert d'ordre « ordre » (grille 2^ordre). */
  function cleHilbert(x, y, ordre) {
    var n = 1 << ordre;
    var d = 0;
    for (var s = n >> 1; s > 0; s >>= 1) {
      var rx = (x & s) > 0 ? 1 : 0;
      var ry = (y & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
        var t = x; x = y; y = t;
      }
    }
    return d;
  }

  function ordonnerHilbert(entrees) {
    var N = 1 << ORDRE_HILBERT;
    var monde = entrees.map(function (e) {
      var r = e.repere;
      var c = Math.cos(r.angle);
      var s = Math.sin(r.angle);
      var t = e.liste.total;
      var d = e.liste.donnees;
      var p = new Float64Array(2 * t);
      for (var i = 0; i < t; i++) {
        var x = d[i * 4] * r.echelle[0];
        var y = d[i * 4 + 1] * r.echelle[1];
        p[2 * i] = r.centre[0] + c * x - s * y;
        p[2 * i + 1] = r.centre[1] + s * x + c * y;
      }
      return p;
    });
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    monde.forEach(function (p) {
      for (var i = 0; i < p.length; i += 2) {
        x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
        y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
      }
    });
    var cote = Math.max(x1 - x0, y1 - y0, 1e-9);
    return entrees.map(function (e, k) {
      var t = e.liste.total;
      var p = monde[k];
      var cles = new Float64Array(t);
      for (var i = 0; i < t; i++) {
        var hx = Math.min(N - 1, Math.floor((p[2 * i] - x0) / cote * N));
        var hy = Math.min(N - 1, Math.floor((p[2 * i + 1] - y0) / cote * N));
        cles[i] = cleHilbert(hx, hy, ORDRE_HILBERT) * RANGS + i;
      }
      cles.sort();
      var d = new Float32Array(t * 4);
      for (var j = 0; j < t; j++) {
        var r = cles[j] % RANGS;
        d.set(e.liste.donnees.subarray(r * 4, r * 4 + 4), j * 4);
      }
      return copieListe(e.liste, d);
    });
  }

  function apparier(a, b) {
    var nA = a.total;
    var nB = b.total;
    var N = Math.max(nA, nB);
    var da = new Float32Array(N * 4);
    var db = new Float32Array(N * 4);
    var pa = -1;
    var pb = -1;
    for (var i = 0; i < N; i++) {
      var ia = Math.floor(i * nA / N);
      var ib = Math.floor(i * nB / N);
      da.set(a.donnees.subarray(ia * 4, ia * 4 + 4), i * 4);
      db.set(b.donnees.subarray(ib * 4, ib * 4 + 4), i * 4);
      if (ia === pa) da[i * 4 + 3] += 65536;    // en double côté départ : entre en fondu
      if (ib === pb) db[i * 4 + 3] += 131072;   // en double côté arrivée : sort en fondu
      pa = ia;
      pb = ib;
    }
    return { total: N, a: da, b: db };
  }

  function ajusterCapacites(effet, totaux) {
    var r = JSON.parse(JSON.stringify(effet));
    r.emetteurs.slice().sort(function (x, y) { return x.profondeur - y.profondeur || x.index - y.index; }).forEach(function (em) {
      if (Object.prototype.hasOwnProperty.call(totaux, em.index)) {
        var n = Math.max(1, totaux[em.index]);
        em.salves = [{ t: 0, nombre: n, debut: 0 }];
        em.capacite = n;
      } else if (em.parent >= 0) {
        em.capacite = r.emetteurs[em.parent].capacite * em.G * em.k;
      }
    });
    r.capacite = r.emetteurs.reduce(function (s, em) { return s + em.capacite; }, 0);
    return r;
  }

  /** Hasard reproductible (mulberry32). */
  function mulberry32(graine) {
    var a = graine >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Partie du polygone convexe où a·x + b·y ≤ c (Sutherland–Hodgman sur une droite). */
  function decouper(poly, a, b, c) {
    var r = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      var q = poly[(i + 1) % poly.length];
      var fp = a * p[0] + b * p[1] - c;
      var fq = a * q[0] + b * q[1] - c;
      if (fp <= 0) r.push(p);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
        var t = fp / (fp - fq);
        r.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return r;
  }

  function aire(poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      var q = poly[(i + 1) % poly.length];
      s += p[0] * q[1] - q[0] * p[1];
    }
    return s / 2;
  }

  /** Germes : un sur deux uniforme dans la boîte, l'autre autour du point d'impact (écart-type 0,2 × petit côté). */
  function germes(o) {
    var W = o.largeur;
    var H = o.hauteur;
    var hasard = mulberry32((o.graine >>> 0) ^ 0x9e3779b9);
    var origine = o.origine || [0.5, 0.5];
    var ox = (origine[0] - 0.5) * W;
    var oy = (origine[1] - 0.5) * H;
    var borne = function (v, m) { return Math.max(-m, Math.min(m, v)); };
    var g = [];
    while (g.length < o.morceaux) {
      var p;
      if (g.length % 2 === 0) p = [(hasard() - 0.5) * W, (hasard() - 0.5) * H];
      else {
        var r = Math.sqrt(-2 * Math.log(1 - hasard())) * 0.2 * Math.min(W, H);
        var th = 2 * Math.PI * hasard();
        p = [borne(ox + r * Math.cos(th), W / 2), borne(oy + r * Math.sin(th), H / 2)];
      }
      // Deux germes confondus donneraient deux cellules superposées : tirage refait.
      if (g.some(function (q) { return q[0] === p[0] && q[1] === p[1]; })) continue;
      g.push(p);
    }
    return g;
  }

  /** Cellules de Voronoï de la boîte [−largeur/2, largeur/2] × [−hauteur/2, hauteur/2] (cqh locaux). */
  function voronoi(o) {
    var W = o.largeur;
    var H = o.hauteur;
    var g = germes(o);
    var boite = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
    return g.map(function (p, i) {
      var poly = boite;
      for (var j = 0; j < g.length && poly.length; j++) {
        if (j === i) continue;
        var q = g[j];
        // Points plus proches de p que de q : (q − p) · x ≤ (|q|² − |p|²) / 2.
        poly = decouper(poly, q[0] - p[0], q[1] - p[1], (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2);
      }
      return { germe: p.slice(), sommets: poly };
    });
  }

  /** Polygone ramené à SOMMETS_MAX sommets : retire le sommet dont le triangle avec ses voisins a la plus petite aire. */
  function simplifier(poly) {
    var p = poly.slice();
    while (p.length > SOMMETS_MAX) {
      var meilleur = 0;
      var plusPetite = Infinity;
      for (var i = 0; i < p.length; i++) {
        var a = Math.abs(aire([p[(i + p.length - 1) % p.length], p[i], p[(i + 1) % p.length]]));
        if (a < plusPetite) { plusPetite = a; meilleur = i; }
      }
      p.splice(meilleur, 1);
    }
    return p;
  }

  /** Éclats : centre (centroïde), nombre de sommets, rayon englobant, sommets relatifs au centre (16 au plus). */
  function eclats(cellules) {
    var e = new Float32Array(cellules.length * FLOTTANTS_ECLAT);
    cellules.forEach(function (c, i) {
      var poly = simplifier(c.sommets);
      var b = i * FLOTTANTS_ECLAT;
      var A = aire(poly);
      var cx = 0;
      var cy = 0;
      if (Math.abs(A) > 1e-12) {
        for (var j = 0; j < poly.length; j++) {
          var p = poly[j];
          var q = poly[(j + 1) % poly.length];
          var x = p[0] * q[1] - q[0] * p[1];
          cx += (p[0] + q[0]) * x;
          cy += (p[1] + q[1]) * x;
        }
        cx /= 6 * A;
        cy /= 6 * A;
      } else if (poly.length) {
        poly.forEach(function (s) { cx += s[0] / poly.length; cy += s[1] / poly.length; });
      }
      var rayon = 0;
      e[b] = cx;
      e[b + 1] = cy;
      e[b + 2] = poly.length < 3 ? 0 : poly.length;
      poly.forEach(function (s, k) {
        e[b + 4 + 2 * k] = s[0] - cx;
        e[b + 5 + 2 * k] = s[1] - cy;
        rayon = Math.max(rayon, Math.hypot(s[0] - cx, s[1] - cy));
      });
      e[b + 3] = rayon;
    });
    return e;
  }

  /** Pas de la simulation à τ (comme P.Simulation.avancer). */
  function pasDe(tau) { return Math.floor(tau / PAS + 1e-6); }

  /** Éléments cachés à τ : l'ancre photographiée (pixels, éclats) dès le pas 1, tant que ses particules ne la rendent
   *  pas ; un élément visé (cible) jusqu'au pas de l'arrivée, où les particules s'éteignent. */
  function raccord(effet, tau) {
    var k = pasDe(tau);
    var source = false;
    var versAncre = false;
    var versCible = false;
    var kA = 0;
    effet.emetteurs.forEach(function (em) {
      if (em.pixels || em.eclats) source = true;
      if (em.cible) {
        if (em.cible.source === 'cible') versCible = true; else versAncre = true;
        kA = Math.max(kA, em.cible.k);
      }
    });
    var arrive = (versAncre || versCible) && k >= kA;
    return {
      ancre: source ? k >= 1 && !(versAncre && arrive) : versAncre && !arrive,
      cible: versCible && !arrive,
    };
  }

  return {
    PAS: PAS,
    SEUIL_ALPHA: SEUIL_ALPHA,
    PIXELS_MAX: PIXELS_MAX,
    COTE_MAX: COTE_MAX,
    SOMMETS_MAX: SOMMETS_MAX,
    FLOTTANTS_ECLAT: FLOTTANTS_ECLAT,
    dimensionsPhoto: dimensionsPhoto,
    listerPixels: listerPixels,
    pasPremier: pasPremier,
    permuter: permuter,
    cleHilbert: cleHilbert,
    ordonnerHilbert: ordonnerHilbert,
    apparier: apparier,
    decouper: decouper,
    aire: aire,
    voronoi: voronoi,
    eclats: eclats,
    ajusterCapacites: ajusterCapacites,
    pasDe: pasDe,
    raccord: raccord,
  };
});
