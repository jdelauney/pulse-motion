/* Pulse Motion – écoute mesurée du mixage (spec S2, 5.11) : la voix est-elle couverte par la musique ou les bruitages,
 * la musique s'arrête-t-elle là où elle devrait jouer ? Claude n'entend pas : il mesure.
 *
 *   passeBande(x, taux, basse, haute)   filtre passe-bande d'ordre 2 (bande de la parole, voixBasse à voixHaute)
 *   rmsFenetres(x, taux, fenetre?)       RMS par fenêtres de 100 ms
 *   emergence({ voix, autres, taux, debut, fin, seuils }) -> { part, fenetres } : parmi les fenêtres où la voix parle
 *                                        (RMS au-dessus de voixActive dBFS), part où elle dépasse le reste de voixEmergence dB
 *                                        dans la bande de la parole
 *   silences(x, taux, { niveau, duree }) -> [{ debut, fin }]   sous niveau dBFS pendant au moins duree
 *   ecouter({ voix, autres, taux, duree, scenes, musique, seuils }) -> constats voix-couverte, silence-imprevu
 *   M.ecouter({ seuils, humeurs }) -> Promise<{ constats }>   dans la page : mixage détaillé (M.rendreSon({ detail: true }))
 *
 * Idées : masquage dans la bande 500 Hz–4 kHz, 3 dB, 80 % (take-one audio-check.mjs, principe seulement, réécrit),
 * fenêtres de 100 ms (video-director analyse_audio, MIT, © 2026 win4r), silences sous −50 dB pendant 2,5 s (explainroo verify,
 * MIT, © 2026 Vincent Schmalbach, chiffres). Module pur à double usage : chargé tel quel dans la page de contrôle (global
 * M.ecoute, M.ecouter ; groupe « controle », jamais dans la page livrée) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  var M = racine.M = racine.M || {};
  M.ecoute = api;
  /** Dans la page : mixage détaillé (mêmes gains que la vidéo), puis constats. humeurs : { idScene: humeur de la musique }. */
  M.ecouter = async function (options) {
    var o = options || {};
    var d = M.donnees || {};
    var vol = d.musique && typeof d.musique.volume === 'number' ? d.musique.volume : 1;
    var musique = !!(d.musique && (d.musique.source || d.musique.partition)) && vol > 0;
    var son = await M.rendreSon({ detail: true });
    if (!son || !son.detail) return { constats: [] };
    var humeurs = o.humeurs || {};
    var scenes = M.minutage.scenes.map(function (s, i) {
      var sc = (d.scenes || [])[i] || {};
      return { id: s.id, debut: s.debut, fin: s.fin, voix: !!(sc.voix && sc.voix.source), humeur: humeurs[s.id] || 'normale' };
    });
    return { constats: api.ecouter({ voix: son.detail.voix, autres: son.detail.autres, taux: son.detail.taux, duree: M.duree, scenes: scenes, musique: musique, seuils: o.seuils }) };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAUTS = { voixBasse: 500, voixHaute: 4000, voixEmergence: 3, voixPart: 0.8, voixActive: -45, silenceNiveau: -50, silenceDuree: 2.5 };
  var FENETRE = 0.1;

  function seuilsDe(s) {
    var r = {};
    Object.keys(DEFAUTS).forEach(function (k) { r[k] = s && typeof s[k] === 'number' ? s[k] : DEFAUTS[k]; });
    return r;
  }

  /** Passe-bande biquadratique (pente de 12 dB par octave, gain 0 dB au centre) entre basse et haute (Hz). */
  function passeBande(x, taux, basse, haute) {
    var f0 = Math.sqrt(basse * haute);
    var q = f0 / (haute - basse);
    var w0 = 2 * Math.PI * f0 / taux;
    var alpha = Math.sin(w0) / (2 * q);
    var a0 = 1 + alpha;
    var b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w0) / a0, a2 = (1 - alpha) / a0;
    var y = new Float32Array(x.length);
    var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < x.length; i++) {
      var v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
    return y;
  }

  /** RMS de chaque fenêtre de fenetre secondes (la dernière, incomplète, comprise). */
  function rmsFenetres(x, taux, fenetre) {
    var n = Math.max(1, Math.round((fenetre || FENETRE) * taux));
    var k = Math.ceil(x.length / n);
    var r = new Float64Array(k);
    for (var j = 0; j < k; j++) {
      var s = 0, fin = Math.min(x.length, (j + 1) * n);
      for (var i = j * n; i < fin; i++) s += x[i] * x[i];
      r[j] = Math.sqrt(s / Math.max(1, fin - j * n));
    }
    return r;
  }

  function dbfs(v) { return 20 * Math.log10(Math.max(v, 1e-12)); }

  /** Émergence de la voix sur [debut, fin] (secondes). -> { part (0 à 1, null sans parole), fenetres (où la voix parle) } */
  function emergence(o) {
    var S = seuilsDe(o.seuils);
    var rv = o.rms ? o.rms.voix : rmsFenetres(o.voix, o.taux);
    var bv = o.rms ? o.rms.voixBande : rmsFenetres(passeBande(o.voix, o.taux, S.voixBasse, S.voixHaute), o.taux);
    var ba = o.rms ? o.rms.autresBande : o.autres ? rmsFenetres(passeBande(o.autres, o.taux, S.voixBasse, S.voixHaute), o.taux) : null;
    var a = Math.max(0, Math.floor((o.debut || 0) / FENETRE));
    var b = Math.min(rv.length, Math.ceil((o.fin === undefined ? rv.length * FENETRE : o.fin) / FENETRE));
    var parle = 0, emerge = 0;
    for (var j = a; j < b; j++) {
      if (dbfs(rv[j]) <= S.voixActive) continue;
      parle++;
      if (!ba || dbfs(bv[j]) - dbfs(ba[j]) >= S.voixEmergence) emerge++;
    }
    return { part: parle ? emerge / parle : null, fenetres: parle };
  }

  /** Passages sous niveau (dBFS, RMS par 100 ms) pendant au moins duree secondes. -> [{ debut, fin }] */
  function silences(x, taux, o) {
    var niveau = o && typeof o.niveau === 'number' ? o.niveau : DEFAUTS.silenceNiveau;
    var duree = o && typeof o.duree === 'number' ? o.duree : DEFAUTS.silenceDuree;
    var r = o && o.rms ? o.rms : rmsFenetres(x, taux);
    var liste = [];
    var debut = -1;
    for (var j = 0; j <= r.length; j++) {
      var calme = j < r.length && dbfs(r[j]) < niveau;
      if (calme && debut < 0) debut = j;
      if (!calme && debut >= 0) {
        if ((j - debut) * FENETRE >= duree - 1e-9) liste.push({ debut: debut * FENETRE, fin: Math.min(j * FENETRE, (x ? x.length / taux : r.length * FENETRE)) });
        debut = -1;
      }
    }
    return liste;
  }

  function arrondi(v) { return Math.round(v * 10) / 10; }

  /** Constats du mixage : voix couverte par scène, silences là où la musique doit jouer (dernière demi-seconde exclue). */
  function ecouter(o) {
    var S = seuilsDe(o.seuils);
    var constats = [];
    var taux = o.taux;
    var rms = {
      voix: o.voix ? rmsFenetres(o.voix, taux) : null,
      voixBande: o.voix ? rmsFenetres(passeBande(o.voix, taux, S.voixBasse, S.voixHaute), taux) : null,
      autresBande: o.autres ? rmsFenetres(passeBande(o.autres, taux, S.voixBasse, S.voixHaute), taux) : null,
    };
    var autresPresents = !!o.autres && Array.prototype.some.call(rms.autresBande, function (v) { return dbfs(v) > S.silenceNiveau; });
    if (o.voix && autresPresents) {
      (o.scenes || []).forEach(function (s) {
        if (!s.voix) return;
        var e = emergence({ rms: rms, debut: s.debut, fin: s.fin, seuils: S });
        if (e.part !== null && e.fenetres >= 3 && e.part < S.voixPart - 1e-9) {
          constats.push({ regle: 'voix-couverte', scene: s.id, element: null, instant: Math.round(s.debut * 100) / 100, valeur: Math.round((1 - e.part) * 100) });
        }
      });
    }
    if (o.musique) {
      var n = Math.max(o.voix ? o.voix.length : 0, o.autres ? o.autres.length : 0);
      var mix = new Float32Array(n);
      if (o.voix) for (var i = 0; i < o.voix.length; i++) mix[i] += o.voix[i];
      if (o.autres) for (var k = 0; k < o.autres.length; k++) mix[k] += o.autres[k];
      var fin = (o.duree || n / taux) - 0.5;
      silences(mix, taux, { niveau: S.silenceNiveau, duree: S.silenceDuree }).forEach(function (p) {
        // Parties du silence dans des scènes où la musique doit jouer (humeur autre que « silence »).
        // Parties voisines fusionnées : un silence qui passe d'une scène à l'autre compte en entier.
        var b0 = Math.min(p.fin, fin);
        var morceaux = [];
        (o.scenes || []).forEach(function (s) {
          if (s.humeur === 'silence') return;
          var a = Math.max(p.debut, s.debut);
          var b = Math.min(b0, s.fin);
          if (b <= a) return;
          var dernier = morceaux[morceaux.length - 1];
          if (dernier && a <= dernier.b + 0.05) dernier.b = Math.max(dernier.b, b); else morceaux.push({ a: a, b: b, scene: s.id });
        });
        var pire = null;
        morceaux.forEach(function (m) { if (m.b - m.a >= S.silenceDuree - 1e-9 && (!pire || m.b - m.a > pire.b - pire.a)) pire = m; });
        if (pire) constats.push({ regle: 'silence-imprevu', scene: pire.scene, element: null, instant: arrondi(pire.a), valeur: { a: arrondi(pire.a), b: arrondi(pire.b), d: arrondi(pire.b - pire.a) } });
      });
    }
    return constats;
  }

  return { DEFAUTS: DEFAUTS, FENETRE: FENETRE, passeBande: passeBande, rmsFenetres: rmsFenetres, emergence: emergence, silences: silences, ecouter: ecouter, dbfs: dbfs };
});
