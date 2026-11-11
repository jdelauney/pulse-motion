/* Pulse Motion – treize bruitages synthétisés (Web Audio) : whoosh, swoosh-inverse, pop, clic, tic, impact, basse,
 * montee, carillon, ding, blip, souffle, crissement. Enveloppes sans clic, bruit à graine (M.synthe.bruit).
 * Options (bruitages automatiques, spec S7 5.15) : hauteur (Hz) du blip (degré de la gamme d'une liste) ; duree (s) du
 * crissement, son générique du tracé à main levée : bruit filtré en bande, modulé comme une pointe qui frotte, sur la durée
 * du tracé (0,15 à 3 s).
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

  /** Rend un bruitage seul (2 s) : sert aux tests. -> Promise<{ rms, fini }> */
  M.synthe.essayerBruitage = function (nom) {
    var c = new OfflineAudioContext(1, 2 * 48000, 48000);
    M.synthe.bruitages.jouer(c, c.destination, nom, 0.1, 1, M.synthe.bruit(c, 2));
    return c.startRendering().then(function (b) {
      var x = b.getChannelData(0), s = 0, fini = true;
      for (var i = 0; i < x.length; i++) { if (!isFinite(x[i])) fini = false; s += x[i] * x[i]; }
      return { rms: Math.sqrt(s / x.length), fini: fini };
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
