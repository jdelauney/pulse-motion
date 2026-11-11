/* Pulse Motion – vingt-trois bruitages synthétisés (Web Audio) : whoosh, swoosh-inverse, pop, clic, tic, impact, basse,
 * montee, carillon, ding, blip, souffle, crissement ; frappe, succes, erreur, notification, aimant (courts) ; feutre, craie,
 * crayon, papier, chargement (tenus : ils durent options.duree, l'entrée de l'élément, de 0,15 à 6 s). Enveloppes sans clic,
 * bruit à graine (M.synthe.bruit) ; la variation d'un son tenu (craquements, couinement) est tirée de son instant, jamais du
 * hasard. Instants des pics : M.synthe.catalogue.PICS. Feutre : chiffres de lemo-opuscar (styles/whiteboard/STYLE.md § 7,
 * MIT, © 2026 LemoLab), recette réécrite.
 * Options (bruitages automatiques, spec S7 5.15) : hauteur (Hz) du blip (degré de la gamme d'une liste) ; duree (s) du
 * crissement, son générique du tracé à main levée : bruit filtré en bande, modulé comme une pointe qui frotte, sur la durée
 * du tracé (0,15 à 3 s) ; duree des sons tenus.
 * Navigateur seulement (global M.synthe.bruitages, M.synthe.essayerBruitage) ; dépend de synthe/instruments.js.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  M.synthe = M.synthe || {};
  var PETIT = 0.0001;

  function env(c, t, attaque, relache, niveau) {
    var g = c.createGain();
    g.gain.setValueAtTime(PETIT, t);
    g.gain.exponentialRampToValueAtTime(Math.max(PETIT * 2, niveau), t + attaque);
    g.gain.exponentialRampToValueAtTime(PETIT, t + attaque + relache);
    return g;
  }
  function osc(c, type, f, t, fin) { var o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(fin); return o; }
  function bruitSource(c, bruit, t, fin) { var s = c.createBufferSource(); s.buffer = bruit; s.loop = true; s.start(t); s.stop(fin); return s; }
  function filtre(c, type, f, t, q) { var b = c.createBiquadFilter(); b.type = type; b.frequency.setValueAtTime(f, t); if (q) b.Q.value = q; return b; }
  function balayage(c, s, t, bruit, de, a, duree, niveau) {
    var b = filtre(c, 'bandpass', de, t, 1.5);
    b.frequency.exponentialRampToValueAtTime(a, t + duree);
    bruitSource(c, bruit, t, t + duree + 0.1).connect(b).connect(env(c, t, duree * 0.5, duree * 0.5, niveau)).connect(s);
  }

  function dureeTenue(o) { return Math.max(0.15, Math.min(6, o && o.duree > 0 ? o.duree : 0.4)); }
  /** Suite de nombres de 0 à 1 tirée de l'instant du son (même instant, même suite). */
  function suite(t, n) {
    var a = (Math.round(t * 1000) * 2654435761 + n * 40503) | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Enveloppe d'un son tenu : attaque jusqu'à crete (le pic), tenue à niveau, relâchement de 60 ms à la fin de d. */
  function tenue(c, t, d, attaque, crete, niveau) {
    var g = c.createGain();
    g.gain.setValueAtTime(PETIT, t);
    g.gain.exponentialRampToValueAtTime(crete, t + attaque);
    g.gain.setTargetAtTime(niveau, t + attaque, 0.04);
    g.gain.setTargetAtTime(PETIT, t + Math.max(attaque + 0.02, d - 0.06), 0.025);
    return g;
  }

  var SONS = {
    whoosh: function (c, s, t, b) { balayage(c, s, t, b, 400, 2500, 0.5, 0.5); },
    'swoosh-inverse': function (c, s, t, b) { balayage(c, s, t, b, 3000, 300, 0.45, 0.5); },
    pop: function (c, s, t) { var o = osc(c, 'sine', 400, t, t + 0.15); o.frequency.exponentialRampToValueAtTime(900, t + 0.05); o.connect(env(c, t, 0.004, 0.08, 0.6)).connect(s); },
    clic: function (c, s, t, b) { bruitSource(c, b, t, t + 0.03).connect(filtre(c, 'highpass', 3000, t)).connect(env(c, t, 0.001, 0.015, 0.6)).connect(s); },
    tic: function (c, s, t) { osc(c, 'sine', 2000, t, t + 0.06).connect(env(c, t, 0.001, 0.03, 0.4)).connect(s); },
    impact: function (c, s, t, b) {
      var o = osc(c, 'sine', 140, t, t + 0.8);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      o.connect(env(c, t, 0.002, 0.5, 0.9)).connect(s);
      bruitSource(c, b, t, t + 0.3).connect(filtre(c, 'lowpass', 1200, t)).connect(env(c, t, 0.002, 0.2, 0.5)).connect(s);
    },
    basse: function (c, s, t) { var o = osc(c, 'sine', 90, t, t + 1.2); o.frequency.exponentialRampToValueAtTime(32, t + 0.9); o.connect(env(c, t, 0.01, 0.9, 0.8)).connect(s); },
    montee: function (c, s, t, b) {
      balayage(c, s, t, b, 250, 5000, 1, 0.35);
      var o = osc(c, 'sawtooth', 110, t, t + 1.05);
      o.frequency.exponentialRampToValueAtTime(440, t + 1);
      o.connect(filtre(c, 'lowpass', 1500, t)).connect(env(c, t, 0.9, 0.1, 0.12)).connect(s);
    },
    carillon: function (c, s, t) {
      [880, 1108.73, 1318.51].forEach(function (f, i) {
        var d = t + i * 0.09;
        osc(c, 'sine', f, d, d + 1.4).connect(env(c, d, 0.003, 1.1, 0.25)).connect(s);
        osc(c, 'sine', f * 2.76, d, d + 0.6).connect(env(c, d, 0.003, 0.4, 0.06)).connect(s);
      });
    },
    ding: function (c, s, t) {
      osc(c, 'sine', 1318.51, t, t + 1.3).connect(env(c, t, 0.003, 1.1, 0.35)).connect(s);
      osc(c, 'sine', 1318.51 * 2.76, t, t + 0.5).connect(env(c, t, 0.003, 0.35, 0.08)).connect(s);
    },
    blip: function (c, s, t, b, o) { osc(c, 'square', o && o.hauteur > 0 ? o.hauteur : 880, t, t + 0.1).connect(filtre(c, 'lowpass', 3000, t)).connect(env(c, t, 0.002, 0.06, 0.25)).connect(s); },
    crissement: function (c, s, t, b, o) {
      var d = Math.max(0.15, Math.min(3, o && o.duree > 0 ? o.duree : 0.4));
      var bande = filtre(c, 'bandpass', 2600, t, 2.2);
      // La pointe frotte par à-coups (quelques passages par seconde) : fréquence et niveau varient, sans hasard.
      var pas = 0.11;
      for (var u = 0; u * pas < d; u++) bande.frequency.setValueAtTime(2200 + 900 * ((u * 7) % 5) / 4, t + u * pas);
      var g = c.createGain();
      g.gain.setValueAtTime(PETIT, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
      for (var v = 1; v * pas < d - 0.06; v++) g.gain.setTargetAtTime(v % 2 ? 0.18 : 0.3, t + v * pas, 0.03);
      g.gain.setTargetAtTime(PETIT, t + d - 0.06, 0.03);
      bruitSource(c, b, t, t + d + 0.2).connect(filtre(c, 'highpass', 900, t)).connect(bande).connect(g).connect(s);
    },
    // --- Courts (spec Styles et réalisation, 5.8) ---
    frappe: function (c, s, t, b) {
      // Touche de clavier : clic de la touche et petit choc du fond de course.
      bruitSource(c, b, t, t + 0.05).connect(filtre(c, 'bandpass', 2600, t, 1.1)).connect(env(c, t, 0.002, 0.03, 0.55)).connect(s);
      var o = osc(c, 'sine', 190, t, t + 0.08);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.05);
      o.connect(env(c, t, 0.002, 0.045, 0.3)).connect(s);
    },
    succes: function (c, s, t) {
      [[659.25, 0, 0.26], [987.77, 0.12, 0.34]].forEach(function (n) {
        var d = t + n[1];
        osc(c, 'sine', n[0], d, d + 0.7).connect(env(c, d, 0.004, 0.45, n[2])).connect(s);
        osc(c, 'sine', n[0] * 2, d, d + 0.3).connect(env(c, d, 0.004, 0.18, n[2] * 0.25)).connect(s);
      });
    },
    erreur: function (c, s, t) {
      [[233.08, 0, 0.26], [174.61, 0.14, 0.34]].forEach(function (n) {
        var d = t + n[1];
        osc(c, 'triangle', n[0], d, d + 0.6).connect(filtre(c, 'lowpass', 1400, d)).connect(env(c, d, 0.006, 0.32, n[2])).connect(s);
        osc(c, 'square', n[0], d, d + 0.4).connect(filtre(c, 'lowpass', 700, d)).connect(env(c, d, 0.006, 0.22, n[2] * 0.2)).connect(s);
      });
    },
    notification: function (c, s, t) {
      [[1567.98, 0, 0.16], [2093, 0.1, 0.2]].forEach(function (n) {
        var d = t + n[1];
        osc(c, 'sine', n[0], d, d + 0.9).connect(env(c, d, 0.003, 0.65, n[2])).connect(s);
        osc(c, 'sine', n[0] * 2.01, d, d + 0.3).connect(env(c, d, 0.003, 0.2, n[2] * 0.15)).connect(s);
      });
    },
    aimant: function (c, s, t, b) {
      // Clic métallique, puis le petit choc sourd de l'aimant qui se pose.
      bruitSource(c, b, t, t + 0.03).connect(filtre(c, 'highpass', 4000, t)).connect(env(c, t, 0.001, 0.012, 0.3)).connect(s);
      [3150, 4730].forEach(function (f) { osc(c, 'sine', f, t, t + 0.1).connect(env(c, t, 0.001, 0.05, 0.06)).connect(s); });
      var d = t + 0.012;
      var o = osc(c, 'sine', 120, d, d + 0.25);
      o.frequency.exponentialRampToValueAtTime(70, d + 0.1);
      o.connect(env(c, d, 0.004, 0.14, 0.6)).connect(s);
      bruitSource(c, b, d, d + 0.08).connect(filtre(c, 'lowpass', 600, d)).connect(env(c, d, 0.004, 0.05, 0.3)).connect(s);
    },
    // --- Tenus : attaque (le pic), tenue tant que l'élément entre, relâchement ---
    feutre: function (c, s, t, b, o) {
      var d = dureeTenue(o), h = suite(t, 1);
      var g = tenue(c, t, d, 0.02, 0.85, 0.5);
      // Pointe sur le tableau : bruit filtré en bande de 2 à 7,5 kHz, plus un corps de 0,5 à 1,5 kHz.
      var src = bruitSource(c, b, t, t + d + 0.2);
      src.connect(filtre(c, 'highpass', 2000, t, 0.7)).connect(filtre(c, 'lowpass', 7500, t, 0.7)).connect(g);
      var corps = c.createGain();
      corps.gain.value = 0.6;
      src.connect(filtre(c, 'bandpass', 866, t, 0.9)).connect(corps).connect(g);
      g.connect(s);
      // Long trait : un couinement sinusoïdal de 1,5 à 2,6 kHz, vibrato de 7 à 13 Hz, au milieu du trait.
      if (d >= 0.8) {
        var f = 1500 + 1100 * h(), debut = t + d * (0.25 + 0.2 * h()), long = Math.min(0.6, d * 0.35);
        var cou = osc(c, 'sine', f, debut, debut + long + 0.05);
        var vib = osc(c, 'sine', 7 + 6 * h(), debut, debut + long + 0.05), ampleur = c.createGain();
        ampleur.gain.value = f * 0.012;
        vib.connect(ampleur).connect(cou.frequency);
        cou.connect(env(c, debut, long * 0.4, long * 0.6, 0.05)).connect(s);
      }
    },
    craie: function (c, s, t, b, o) {
      var d = dureeTenue(o), h = suite(t, 2);
      var g = tenue(c, t, d, 0.015, 0.75, 0.45);
      // Frottement granuleux : bande large autour de 1,8 kHz, grain modulé toutes les 18 ms.
      var grain = c.createGain();
      grain.gain.setValueAtTime(1, t);
      for (var u = 1; u * 0.018 < d; u++) grain.gain.setTargetAtTime(0.55 + 0.45 * h(), t + u * 0.018, 0.004);
      bruitSource(c, b, t, t + d + 0.2).connect(filtre(c, 'bandpass', 1800, t, 0.9)).connect(grain).connect(g).connect(s);
      // Petits craquements, à des instants irréguliers mais fixes.
      for (var k = t + 0.08 + 0.1 * h(); k < t + d - 0.04; k += 0.12 + 0.25 * h()) {
        bruitSource(c, b, k, k + 0.02).connect(filtre(c, 'highpass', 3500, k)).connect(env(c, k, 0.001, 0.008, 0.18 + 0.12 * h())).connect(s);
      }
    },
    crayon: function (c, s, t, b, o) {
      var d = dureeTenue(o), h = suite(t, 3);
      var g = tenue(c, t, d, 0.02, 0.55, 0.32);
      var grain = c.createGain();
      grain.gain.setValueAtTime(1, t);
      for (var u = 1; u * 0.03 < d; u++) grain.gain.setTargetAtTime(0.75 + 0.25 * h(), t + u * 0.03, 0.008);
      bruitSource(c, b, t, t + d + 0.2).connect(filtre(c, 'highpass', 3500, t)).connect(filtre(c, 'bandpass', 5200, t, 1.2)).connect(grain).connect(g).connect(s);
    },
    papier: function (c, s, t, b, o) {
      var d = dureeTenue(o), h = suite(t, 4);
      var g = tenue(c, t, d, 0.01, 0.8, 0.4);
      // Froissement : la bande glisse entre 1,2 et 3 kHz, le niveau change par à-coups.
      var bande = filtre(c, 'bandpass', 1200, t, 0.8);
      for (var u = 1; u * 0.05 < d; u++) bande.frequency.setTargetAtTime(1200 + 1800 * h(), t + u * 0.05, 0.015);
      var froisse = c.createGain();
      froisse.gain.setValueAtTime(1, t);
      for (var v = 1; v * 0.035 < d; v++) froisse.gain.setTargetAtTime(0.5 + 0.5 * h(), t + v * 0.035, 0.006);
      bruitSource(c, b, t, t + d + 0.2).connect(bande).connect(froisse).connect(g).connect(s);
    },
    chargement: function (c, s, t, b, o) {
      // Tics réguliers tant que l'élément entre (8 par seconde), le premier un peu plus fort.
      var d = dureeTenue(o);
      for (var k = 0; k * 0.125 < d; k++) {
        var x = t + k * 0.125;
        osc(c, 'sine', k % 2 ? 1800 : 2100, x, x + 0.05).connect(env(c, x, 0.001, 0.025, k ? 0.26 : 0.4)).connect(s);
      }
    },
    souffle: function (c, s, t, b) { bruitSource(c, b, t, t + 0.9).connect(filtre(c, 'lowpass', 900, t)).connect(env(c, t, 0.3, 0.5, 0.3)).connect(s); },
  };

  M.synthe.bruitages = {
    noms: Object.keys(SONS),
    /** Joue un bruitage à l'instant t. -> false si le nom est inconnu. */
    jouer: function (contexte, sortie, nom, t, volume, bruit, options) {
      var faire = SONS[nom];
      if (!faire) return false;
      var g = contexte.createGain();
      g.gain.value = volume === undefined ? 1 : volume;
      g.connect(sortie);
      faire(contexte, g, t, bruit, options || {});
      return true;
    },
  };

  /**
   * Rend un bruitage seul (2 s, départ à 0,1 s) : sert aux tests. options : celles du son (duree d'un son tenu).
   * -> Promise<{ rms, fini, enveloppe }> ; enveloppe : RMS sur 5 ms, pas de 1 ms, depuis le départ du son.
   */
  M.synthe.essayerBruitage = function (nom, options) {
    var c = new OfflineAudioContext(1, 2 * 48000, 48000);
    M.synthe.bruitages.jouer(c, c.destination, nom, 0.1, 1, M.synthe.bruit(c, 2), options);
    return c.startRendering().then(function (b) {
      var x = b.getChannelData(0), s = 0, fini = true, enveloppe = [];
      for (var i = 0; i < x.length; i++) { if (!isFinite(x[i])) fini = false; s += x[i] * x[i]; }
      for (var k = 0.1 * 48000; k + 240 <= x.length; k += 48) {
        var e = 0;
        for (var j = k - 120; j < k + 120; j++) e += j >= 0 ? x[j] * x[j] : 0;
        enveloppe.push(Math.sqrt(e / 240));
      }
      return { rms: Math.sqrt(s / x.length), fini: fini, enveloppe: enveloppe };
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
