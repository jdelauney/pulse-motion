/* Pulse Motion – analyse hors temps réel d'une piste sonore (son réactif, P7).
 *
 * analyser(echantillons, taux, { duree?, voix? }) -> tables   60 instants par seconde (instant i = i / 60 s) :
 *   spectre (512 bandes logarithmiques de 20 Hz à 20 kHz, dB de −100 à 0 ramenés à 0–255, lissées), onde (512 échantillons
 *   centrés, 0–255), volume (RMS), basses [20, 250), médiums [250, 4000), aigus [4000, 16 000 Hz) (lissés, normalisés par
 *   leur maximum sur la piste), flux spectral, battements (seuil adaptatif) ; voix : enveloppe [300, 3400 Hz) et syllabes.
 *   Fenêtre de Hann de 1024 échantillons centrée sur l'instant.
 * lire(tables, t) -> { volume, basses, mediums, aigus, battement, phase, enveloppe, syllabe }   interpolé, fonction de t
 * spectreA(tables, t), ondeA(tables, t) -> Uint8Array(512)   instant le plus proche
 * empreinte(tables) -> 8 chiffres hexadécimaux (FNV-1a) ; fft(re, im) en place ; detecterBattements(flux),
 * detecterSyllabes(enveloppe) -> indices d'instants.
 *
 * Module pur : chargé tel quel dans la page (global M.analyseSon) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.analyseSon = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CADENCE = 60;
  var TAILLE = 1024;
  var BANDES = 512;
  var POINTS = 512;
  var F_MIN = 20;
  var F_MAX = 20000;
  var DB_MIN = -100;
  var DB_MAX = 0;
  var LISSAGE = 0.5;
  var LISSAGE_VOIX = 0.6;
  var PLAGES = { basses: [20, 250], mediums: [250, 4000], aigus: [4000, 16000], voix: [300, 3400] };
  var FENETRE_SEUIL = 15;
  var K_SEUIL = 1.5;
  var VOISINS = 3;
  var PART_MIN = 0.05;
  var ECART_BATTEMENTS = 6;
  var VOISINS_SYLLABE = 5;
  var SEUIL_SYLLABE = 0.25;
  var CREUX_SYLLABE = 12;
  var ECART_SYLLABES = 7;
  var DECROISSANCE_BATTEMENT = 0.15;
  var DECROISSANCE_SYLLABE = 0.1;
  var VIDE = { volume: 0, basses: 0, mediums: 0, aigus: 0, battement: 0, phase: 0, enveloppe: 0, syllabe: 0 };

  var hann = null;
  function fenetre() {
    if (!hann) {
      hann = new Float64Array(TAILLE);
      for (var i = 0; i < TAILLE; i++) hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / TAILLE));
    }
    return hann;
  }

  /** Transformée de Fourier rapide (radix 2, en place). */
  function fft(re, im) {
    var n = re.length;
    var i, j, k, t;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (var long = 2; long <= n; long <<= 1) {
      var moitie = long >> 1;
      var angle = -2 * Math.PI / long;
      for (i = 0; i < n; i += long) {
        for (k = 0; k < moitie; k++) {
          var cr = Math.cos(angle * k);
          var ci = Math.sin(angle * k);
          var a = i + k;
          var b = a + moitie;
          var br = re[b] * cr - im[b] * ci;
          var bi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - br; im[b] = im[a] - bi;
          re[a] += br; im[a] += bi;
        }
      }
    }
  }

  /** Bandes logarithmiques : pour chacune, l'intervalle d'indices de fréquence (ou le point à interpoler). */
  function bandesPour(taux) {
    var fmax = Math.min(F_MAX, taux / 2);
    var r = [];
    for (var j = 0; j < BANDES; j++) {
      var lo = F_MIN * Math.pow(fmax / F_MIN, j / BANDES) * TAILLE / taux;
      var hi = F_MIN * Math.pow(fmax / F_MIN, (j + 1) / BANDES) * TAILLE / taux;
      var a = Math.ceil(lo);
      var b = Math.min(Math.floor(hi), TAILLE / 2 - 1);
      r.push(b >= a ? { a: a, b: b, x: -1 } : { a: 0, b: -1, x: Math.min((lo + hi) / 2, TAILLE / 2 - 1.001) });
    }
    return r;
  }

  function indicesPlage(plage, taux) {
    return [Math.max(1, Math.ceil(plage[0] * TAILLE / taux)), Math.min(TAILLE / 2 - 1, Math.ceil(plage[1] * TAILLE / taux) - 1)];
  }

  function energie(amp, ij) {
    var s = 0;
    for (var k = ij[0]; k <= ij[1]; k++) s += amp[k] * amp[k];
    return Math.sqrt(s);
  }

  function normaliser(a) {
    var max = 0;
    for (var i = 0; i < a.length; i++) if (a[i] > max) max = a[i];
    if (max > 0) for (var j = 0; j < a.length; j++) a[j] = a[j] / max;
    return a;
  }

  function detecterBattements(flux) {
    var n = flux.length;
    var max = 0;
    var i, k;
    for (i = 0; i < n; i++) if (flux[i] > max) max = flux[i];
    var r = [];
    if (!(max > 0)) return r;
    var dernier = -Infinity;
    for (i = 0; i < n; i++) {
      var v = flux[i];
      if (v < PART_MIN * max || i - dernier < ECART_BATTEMENTS) continue;
      var maximum = true;
      for (k = Math.max(0, i - VOISINS); k <= Math.min(n - 1, i + VOISINS); k++) {
        if (flux[k] > v || (flux[k] === v && k < i)) { maximum = false; break; }
      }
      if (!maximum) continue;
      var somme = 0;
      var nb = 0;
      for (k = Math.max(0, i - FENETRE_SEUIL); k <= Math.min(n - 1, i + FENETRE_SEUIL); k++) { somme += flux[k]; nb++; }
      if (v <= K_SEUIL * somme / nb) continue;
      r.push(i);
      dernier = i;
    }
    return r;
  }

  function detecterSyllabes(env) {
    var n = env.length;
    var r = [];
    var dernier = -Infinity;
    for (var i = 0; i < n; i++) {
      var v = env[i];
      if (v <= SEUIL_SYLLABE || i - dernier < ECART_SYLLABES) continue;
      var maximum = true;
      var k;
      for (k = Math.max(0, i - VOISINS_SYLLABE); k <= Math.min(n - 1, i + VOISINS_SYLLABE); k++) {
        if (env[k] > v || (env[k] === v && k < i)) { maximum = false; break; }
      }
      if (!maximum) continue;
      var creux = v;
      for (k = Math.max(0, i - CREUX_SYLLABE); k < i; k++) creux = Math.min(creux, env[k]);
      if (i >= CREUX_SYLLABE && creux >= 0.6 * v) continue;
      r.push(i);
      dernier = i;
    }
    return r;
  }

  function analyser(x, taux, options) {
    var o = options || {};
    var duree = o.duree > 0 ? o.duree : x.length / taux;
    var n = Math.floor(duree * CADENCE + 1e-9) + 1;
    var w = fenetre();
    var bandes = bandesPour(taux);
    var ib = indicesPlage(PLAGES.basses, taux);
    var im_ = indicesPlage(PLAGES.mediums, taux);
    var ia = indicesPlage(PLAGES.aigus, taux);
    var iv = indicesPlage(PLAGES.voix, taux);
    var t = {
      cadence: CADENCE, n: n, duree: duree,
      spectre: new Uint8Array(n * BANDES), onde: new Uint8Array(n * POINTS),
      volume: new Float32Array(n), basses: new Float32Array(n), mediums: new Float32Array(n), aigus: new Float32Array(n),
      flux: new Float32Array(n), battements: [], enveloppe: o.voix ? new Float32Array(n) : null, syllabes: [],
    };
    var re = new Float64Array(TAILLE);
    var imag = new Float64Array(TAILLE);
    var amp = new Float64Array(TAILLE / 2);
    var logPrec = new Float64Array(TAILLE / 2);
    var lisse = new Float64Array(BANDES);
    var prec = { volume: 0, basses: 0, mediums: 0, aigus: 0, voix: 0 };
    for (var i = 0; i < n; i++) {
      var centre = Math.round(i * taux / CADENCE);
      var debut = centre - TAILLE / 2;
      var carre = 0;
      for (var m = 0; m < TAILLE; m++) {
        var j = debut + m;
        var v = j >= 0 && j < x.length ? x[j] : 0;
        carre += v * v;
        re[m] = v * w[m];
        imag[m] = 0;
      }
      fft(re, imag);
      var flux = 0;
      for (var k = 0; k < TAILLE / 2; k++) {
        amp[k] = 4 * Math.sqrt(re[k] * re[k] + imag[k] * imag[k]) / TAILLE;
        var l = Math.log(1 + 100 * amp[k]);
        if (k > 0 && l > logPrec[k]) flux += l - logPrec[k];
        logPrec[k] = l;
      }
      t.flux[i] = flux;
      for (var b = 0; b < BANDES; b++) {
        var bd = bandes[b];
        var a;
        if (bd.x < 0) {
          a = 0;
          for (var q = bd.a; q <= bd.b; q++) if (amp[q] > a) a = amp[q];
        } else {
          var k0 = Math.floor(bd.x);
          var f = bd.x - k0;
          a = amp[k0] * (1 - f) + amp[k0 + 1] * f;
        }
        var db = 20 * Math.log10(a + 1e-12);
        var vb = Math.min(1, Math.max(0, (db - DB_MIN) / (DB_MAX - DB_MIN)));
        lisse[b] = i === 0 ? vb : LISSAGE * lisse[b] + (1 - LISSAGE) * vb;
        t.spectre[i * BANDES + b] = Math.round(lisse[b] * 255);
      }
      for (var p = 0; p < POINTS; p++) {
        var s = centre - POINTS / 2 + p;
        var e = s >= 0 && s < x.length ? Math.max(-1, Math.min(1, x[s])) : 0;
        t.onde[i * POINTS + p] = Math.round((0.5 + 0.5 * e) * 255);
      }
      prec.volume = LISSAGE * prec.volume + (1 - LISSAGE) * Math.sqrt(carre / TAILLE);
      prec.basses = LISSAGE * prec.basses + (1 - LISSAGE) * energie(amp, ib);
      prec.mediums = LISSAGE * prec.mediums + (1 - LISSAGE) * energie(amp, im_);
      prec.aigus = LISSAGE * prec.aigus + (1 - LISSAGE) * energie(amp, ia);
      t.volume[i] = prec.volume;
      t.basses[i] = prec.basses;
      t.mediums[i] = prec.mediums;
      t.aigus[i] = prec.aigus;
      if (t.enveloppe) {
        prec.voix = LISSAGE_VOIX * prec.voix + (1 - LISSAGE_VOIX) * energie(amp, iv);
        t.enveloppe[i] = prec.voix;
      }
    }
    ['volume', 'basses', 'mediums', 'aigus'].forEach(function (c) { normaliser(t[c]); });
    t.battements = detecterBattements(t.flux).map(function (k) { return k / CADENCE; });
    if (t.enveloppe) {
      normaliser(t.enveloppe);
      t.syllabes = detecterSyllabes(t.enveloppe).map(function (k) { return k / CADENCE; });
    }
    return t;
  }

  // ---- Lecture à t ----

  function interpoler(a, x) {
    var n = a.length;
    if (!n) return 0;
    if (!(x > 0)) return a[0];
    if (x >= n - 1) return a[n - 1];
    var i = Math.floor(x);
    var f = x - i;
    return a[i] * (1 - f) + a[i + 1] * f;
  }

  /** Indice du dernier instant ≤ t, −1 s'il n'y en a pas. */
  function dernierAvant(liste, t) {
    var lo = 0;
    var hi = liste.length - 1;
    var r = -1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      if (liste[m] <= t + 1e-9) { r = m; lo = m + 1; } else hi = m - 1;
    }
    return r;
  }

  function impulsion(liste, t, decroissance) {
    var i = dernierAvant(liste, t);
    return i < 0 ? 0 : Math.exp(-Math.max(0, t - liste[i]) / decroissance);
  }

  function phase(liste, t) {
    var i = dernierAvant(liste, t);
    if (i < 0) return 0;
    var suivant = i + 1 < liste.length ? liste[i + 1] : i > 0 ? liste[i] + (liste[i] - liste[i - 1]) : liste[i] + 0.5;
    return Math.min(1, Math.max(0, (t - liste[i]) / Math.max(1e-6, suivant - liste[i])));
  }

  function lire(tb, t) {
    var tt = Math.min(Math.max(t, 0), tb.duree);
    var x = tt * tb.cadence;
    return {
      volume: interpoler(tb.volume, x),
      basses: interpoler(tb.basses, x),
      mediums: interpoler(tb.mediums, x),
      aigus: interpoler(tb.aigus, x),
      battement: impulsion(tb.battements, tt, DECROISSANCE_BATTEMENT),
      phase: phase(tb.battements, tt),
      enveloppe: tb.enveloppe ? interpoler(tb.enveloppe, x) : 0,
      syllabe: impulsion(tb.syllabes, tt, DECROISSANCE_SYLLABE),
    };
  }

  function instant(tb, t) { return Math.max(0, Math.min(tb.n - 1, Math.round(t * tb.cadence))); }
  function spectreA(tb, t) { var i = instant(tb, t); return tb.spectre.subarray(i * BANDES, (i + 1) * BANDES); }
  function ondeA(tb, t) { var i = instant(tb, t); return tb.onde.subarray(i * POINTS, (i + 1) * POINTS); }

  function empreinte(tb) {
    var h = 0x811c9dc5;
    function octets(u8) { for (var i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; } }
    function flottants(f32) { octets(new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)); }
    octets(tb.spectre);
    octets(tb.onde);
    flottants(tb.volume); flottants(tb.basses); flottants(tb.mediums); flottants(tb.aigus); flottants(tb.flux);
    if (tb.enveloppe) flottants(tb.enveloppe);
    flottants(new Float32Array(tb.battements.concat([-1], tb.syllabes)));
    return ('0000000' + h.toString(16)).slice(-8);
  }

  return {
    CADENCE: CADENCE, TAILLE: TAILLE, BANDES: BANDES, POINTS: POINTS, PLAGES: PLAGES, VIDE: VIDE,
    fft: fft, analyser: analyser, lire: lire, spectreA: spectreA, ondeA: ondeA, empreinte: empreinte,
    detecterBattements: detecterBattements, detecterSyllabes: detecterSyllabes,
  };
});
