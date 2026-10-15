/* Pulse Motion – synchronisation labiale : mots de la voix -> visèmes minutés (pur, déterministe).
 *
 *   L.visemesDuMot('bonjour')                  -> [{ v: 'MBP', poids: 1 }, { v: 'O', poids: 2 }, { v: 'U', poids: 2 }]
 *   L.piste(mots, origine, debut, fin)         -> [{ t0, t1, v }]   temps absolus ; v null : bouche de l'expression
 *   L.boucheAuTemps(piste, t)                  -> visème ou null
 *
 * Les visèmes viennent des lettres du mot (règles du français, approximatives), les instants des mots de la voix
 * ({ w, t0, t1 } relatifs au début de la prise ; origine = instant absolu de ce début). Visèmes : A E I O U MBP FV L,
 * « repos » entre deux mots proches.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.levres = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var GARDE = 0.12;      // silence plus court : la bouche garde son dernier visème
  var REPOS = 0.6;       // silence plus court : bouche au repos ; au-delà, celle de l'expression
  var MIN = 0.05;        // segment plus court : retiré (consonne d'abord)
  var VOYELLES = { a: 'A', 'à': 'A', 'â': 'A', e: 'E', 'é': 'E', 'è': 'E', 'ê': 'E', 'ë': 'E', i: 'I', 'î': 'I', 'ï': 'I', y: 'I', o: 'O', 'ô': 'O', u: 'U', 'û': 'U', 'ü': 'U', 'ù': 'U' };
  var CONSONNES = { m: 'MBP', b: 'MBP', p: 'MBP', f: 'FV', v: 'FV', l: 'L', n: 'L', t: 'L', d: 'L' };
  // Groupes lus avant les lettres seules (le plus long d'abord) : [graphie, visèmes].
  var GROUPES = [
    ['eau', ['O']], ['ill', ['I']], ['œu', ['O']], ['ien', ['I', 'E']], ['qu', []],
    ['au', ['O']], ['oi', ['U', 'A']], ['oy', ['U', 'A']], ['ou', ['U']], ['où', ['U']], ['ai', ['E']], ['ei', ['E']], ['eu', ['O']], ['ph', ['FV']]
  ];
  var NASALES = { a: 'A', e: 'A', o: 'O', i: 'E', u: 'E', y: 'E' };

  function estVoyelle(c) { return c !== undefined && Object.prototype.hasOwnProperty.call(VOYELLES, c); }

  var VOYELLE = /[aàâäeéèêëiîïoôöuùûüyœæ]/;
  /** Lettres prononcées du mot : minuscules, lettres seules, finales muettes retirées (si une voyelle reste).
   *  Un « e » final muet laisse une marque « _ » : la consonne d'avant se prononce (« une » n'est pas nasale). */
  function lettres(w) {
    var s = String(w || '').toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüÿçœæ]/g, '');
    // « -ent » des verbes (ils parlent) ; pas « -ment » (moment, vraiment).
    if (/[^aeiouym]ent$/.test(s) && s.length > 4 && VOYELLE.test(s.slice(0, -3))) s = s.slice(0, -3) + '_';
    else if (/es$/.test(s) && VOYELLE.test(s.slice(0, -2))) s = s.slice(0, -2) + '_';
    else if (/e$/.test(s) && VOYELLE.test(s.slice(0, -1))) s = s.slice(0, -1) + '_';
    else if (/[stdxz]$/.test(s) && VOYELLE.test(s.slice(0, -1))) s = s.slice(0, -1);
    return s;
  }

  /** Mot -> [{ v, poids }] (voyelle 2, consonne 1), visèmes égaux de suite fusionnés ; un mot sans visème dit E. */
  function visemesDuMot(w) {
    var s = lettres(w), out = [];
    function ajouter(v, poids) {
      var der = out[out.length - 1];
      if (der && der.v === v) der.poids = Math.max(der.poids, poids);
      else out.push({ v: v, poids: poids });
    }
    var i = 0;
    while (i < s.length) {
      // « ain », « ein » nasals -> E.
      if ((s[i] === 'a' || s[i] === 'e') && s[i + 1] === 'i' && (s[i + 2] === 'n' || s[i + 2] === 'm') && !estVoyelle(s[i + 3]) && s[i + 3] !== '_') { ajouter('E', 2); i += 3; continue; }
      var lu = false;
      for (var g = 0; g < GROUPES.length && !lu; g++) {
        var gr = GROUPES[g][0];
        if (s.substr(i, gr.length) === gr) {
          GROUPES[g][1].forEach(function (v) { ajouter(v, v === 'FV' ? 1 : 2); });
          i += gr.length; lu = true;
        }
      }
      if (lu) continue;
      var c = s[i];
      // Nasale : voyelle + n/m non suivi d'une voyelle (ni d'un autre n/m) -> la voyelle seule.
      if (NASALES[c] && (s[i + 1] === 'n' || s[i + 1] === 'm') && !estVoyelle(s[i + 2]) && s[i + 2] !== 'n' && s[i + 2] !== 'm' && s[i + 2] !== '_') {
        ajouter(NASALES[c], 2); i += 2; continue;
      }
      if (estVoyelle(c)) ajouter(VOYELLES[c], 2);
      else if (CONSONNES[c]) ajouter(CONSONNES[c], 1);
      i++;
    }
    return out.length ? out : [{ v: 'E', poids: 2 }];
  }

  /** Segments d'un mot dans [t0, t1] au prorata des poids ; trop courts retirés (consonne d'abord). */
  function segmentsDuMot(w, t0, t1) {
    var vs = visemesDuMot(w);
    function total() { return vs.reduce(function (s, x) { return s + x.poids; }, 0); }
    while (vs.length > 1 && (t1 - t0) * Math.min.apply(null, vs.map(function (x) { return x.poids; })) / total() < MIN) {
      var k = -1;
      vs.forEach(function (x, j) { if (k < 0 || x.poids < vs[k].poids) k = j; });
      vs.splice(k, 1);
      // Les voisins devenus égaux fusionnent.
      for (var j = vs.length - 1; j > 0; j--) if (vs[j].v === vs[j - 1].v) { vs[j - 1].poids = Math.max(vs[j - 1].poids, vs[j].poids); vs.splice(j, 1); }
    }
    var tot = total(), t = t0, out = [];
    vs.forEach(function (x, j) {
      var fin = j === vs.length - 1 ? t1 : t + (t1 - t0) * x.poids / tot;
      out.push({ t0: t, t1: fin, v: x.v });
      t = fin;
    });
    return out;
  }

  /** Mots de la voix -> piste de visèmes (temps absolus) ; seuls les mots qui commencent dans [debut, fin[. */
  function piste(mots, origine, debut, fin) {
    var retenus = [];
    (mots || []).forEach(function (m) {
      if (!m || typeof m.t0 !== 'number' || typeof m.t1 !== 'number' || !(m.t1 > m.t0)) return;
      if (!lettres(m.w) && !/[a-z0-9]/i.test(String(m.w || ''))) return;
      var t0 = origine + m.t0, t1 = origine + m.t1;
      // Tolérance : un « parler » calé sur un mot (mot:…) tombe à l'arrondi près sur son début.
      if (t0 < debut - 1e-6 || t0 >= fin - 1e-6) return;
      retenus.push({ w: m.w, t0: t0, t1: t1 });
    });
    retenus.sort(function (a, b) { return a.t0 - b.t0; });
    var out = [];
    retenus.forEach(function (m, k) {
      var segs = segmentsDuMot(m.w, m.t0, m.t1);
      var suivant = retenus[k + 1];
      if (suivant) {
        var trou = suivant.t0 - m.t1;
        if (trou > 0 && trou < GARDE) segs[segs.length - 1].t1 = suivant.t0;
        else if (trou >= GARDE && trou < REPOS) segs.push({ t0: m.t1, t1: suivant.t0, v: 'repos' });
      }
      out = out.concat(segs);
    });
    return out;
  }

  /** Visème à l'instant t (null hors des paroles). */
  function boucheAuTemps(p, t) {
    if (!p || !p.length) return null;
    var bas = 0, haut = p.length - 1;
    while (bas <= haut) {
      var mi = (bas + haut) >> 1;
      if (t < p[mi].t0) haut = mi - 1;
      else if (t >= p[mi].t1) bas = mi + 1;
      else return p[mi].v;
    }
    return null;
  }

  return { GARDE: GARDE, REPOS: REPOS, MIN: MIN, lettres: lettres, visemesDuMot: visemesDuMot, piste: piste, boucheAuTemps: boucheAuTemps };
});
