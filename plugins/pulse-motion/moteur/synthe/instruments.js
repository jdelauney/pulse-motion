/* Pulse Motion – instruments du synthétiseur (Web Audio) : pluck, pad, basse, sub, kick, caisse, charleston, cloche,
 * nappe-bruit, riser. Un évènement { t, frequences, duree, velocite, volume } crée ses nœuds dans le contexte.
 * Enveloppes qui partent de 0,0001 (rampes exponentielles) : aucun clic. Bruit tiré d'un générateur à graine.
 * Navigateur seulement (global M.synthe.instruments, M.synthe.bruit, M.synthe.essayerInstrument).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  M.synthe = M.synthe || {};
  var PETIT = 0.0001;
  // Sources créées par l'évènement en cours (débranchées toutes ensemble quand elles ont fini).
  var sourcesEnCours = null;

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 2 s de bruit blanc reproductible. */
  M.synthe.bruit = function (contexte, graine) {
    var hasard = mulberry32(graine || 12345);
    var tampon = contexte.createBuffer(1, 2 * contexte.sampleRate, contexte.sampleRate);
    var x = tampon.getChannelData(0);
    for (var i = 0; i < x.length; i++) x[i] = hasard() * 2 - 1;
    return tampon;
  };

  /** Gain avec enveloppe attaque / tenue / relâchement (exponentielles). */
  function enveloppe(contexte, t, attaque, tenue, relache, niveau) {
    var g = contexte.createGain();
    var n = Math.max(PETIT * 2, niveau);
    g.gain.setValueAtTime(PETIT, t);
    g.gain.exponentialRampToValueAtTime(n, t + attaque);
    g.gain.setValueAtTime(n, t + attaque + Math.max(0, tenue));
    g.gain.exponentialRampToValueAtTime(PETIT, t + attaque + Math.max(0, tenue) + relache);
    return g;
  }
  function oscillateur(contexte, type, f, t, fin) {
    var o = contexte.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(fin);
    if (sourcesEnCours) sourcesEnCours.push(o);
    return o;
  }
  function sourceBruit(contexte, bruit, t, fin) {
    var s = contexte.createBufferSource();
    s.buffer = bruit;
    s.loop = true;
    s.start(t);
    s.stop(fin);
    if (sourcesEnCours) sourcesEnCours.push(s);
    return s;
  }
  function filtre(contexte, type, f, t, q) {
    var b = contexte.createBiquadFilter();
    b.type = type;
    b.frequency.setValueAtTime(f, t);
    if (q) b.Q.value = q;
    return b;
  }

  var INSTRUMENTS = {
    pluck: function (c, sortie, e) {
      e.frequences.forEach(function (f) {
        var env = enveloppe(c, e.t, 0.005, 0, Math.max(0.25, Math.min(1.2, e.duree * 1.5)), 0.35 * e.velocite);
        oscillateur(c, 'triangle', f, e.t, e.t + 1.5).connect(filtre(c, 'lowpass', Math.min(8000, f * 6), e.t)).connect(env).connect(sortie);
      });
    },
    pad: function (c, sortie, e) {
      e.frequences.forEach(function (f) {
        var attaque = Math.min(0.6, e.duree / 3);
        var env = enveloppe(c, e.t, attaque, e.duree - attaque, 0.8, 0.12 * e.velocite);
        var bas = filtre(c, 'lowpass', 1800, e.t);
        [-7, 7].forEach(function (cents) {
          var o = oscillateur(c, 'sawtooth', f, e.t, e.t + e.duree + 1);
          o.detune.setValueAtTime(cents, e.t);
          o.connect(bas);
        });
        bas.connect(env).connect(sortie);
      });
    },
    basse: function (c, sortie, e) {
      e.frequences.forEach(function (f) {
        var env = enveloppe(c, e.t, 0.01, e.duree * 0.6, 0.15, 0.4 * e.velocite);
        oscillateur(c, 'square', f, e.t, e.t + e.duree + 0.3).connect(filtre(c, 'lowpass', 600, e.t)).connect(env).connect(sortie);
        oscillateur(c, 'sine', f, e.t, e.t + e.duree + 0.3).connect(env);
      });
    },
    sub: function (c, sortie, e) {
      var o = oscillateur(c, 'sine', 120, e.t, e.t + 1);
      o.frequency.exponentialRampToValueAtTime(36, e.t + 0.6);
      o.connect(enveloppe(c, e.t, 0.005, 0.1, 0.6, 0.7 * e.velocite)).connect(sortie);
    },
    kick: function (c, sortie, e) {
      var o = oscillateur(c, 'sine', 150, e.t, e.t + 0.5);
      o.frequency.exponentialRampToValueAtTime(42, e.t + 0.12);
      o.connect(enveloppe(c, e.t, 0.002, 0.02, 0.3, 0.9 * e.velocite)).connect(sortie);
    },
    caisse: function (c, sortie, e, bruit) {
      sourceBruit(c, bruit, e.t, e.t + 0.4).connect(filtre(c, 'bandpass', 1800, e.t, 0.8)).connect(enveloppe(c, e.t, 0.002, 0.01, 0.18, 0.5 * e.velocite)).connect(sortie);
      oscillateur(c, 'triangle', 190, e.t, e.t + 0.2).connect(enveloppe(c, e.t, 0.002, 0, 0.1, 0.3 * e.velocite)).connect(sortie);
    },
    charleston: function (c, sortie, e, bruit) {
      sourceBruit(c, bruit, e.t, e.t + 0.15).connect(filtre(c, 'highpass', 7000, e.t)).connect(enveloppe(c, e.t, 0.001, 0, 0.06, 0.25 * e.velocite)).connect(sortie);
    },
    cloche: function (c, sortie, e) {
      e.frequences.forEach(function (f) {
        [[1, 0.3], [2.76, 0.12], [5.4, 0.06]].forEach(function (p) {
          oscillateur(c, 'sine', f * p[0], e.t, e.t + 2.5).connect(enveloppe(c, e.t, 0.003, 0, 1.8 / p[0] + 0.3, p[1] * e.velocite)).connect(sortie);
        });
      });
    },
    'nappe-bruit': function (c, sortie, e, bruit) {
      sourceBruit(c, bruit, e.t, e.t + e.duree + 1).connect(filtre(c, 'lowpass', 500, e.t))
        .connect(enveloppe(c, e.t, Math.min(0.8, e.duree / 2), e.duree / 2, 0.8, 0.08 * e.velocite)).connect(sortie);
    },
    riser: function (c, sortie, e, bruit) {
      var b = filtre(c, 'bandpass', 300, e.t, 2);
      b.frequency.exponentialRampToValueAtTime(6000, e.t + e.duree);
      sourceBruit(c, bruit, e.t, e.t + e.duree + 0.2).connect(b).connect(enveloppe(c, e.t, e.duree * 0.9, 0, Math.max(0.05, e.duree * 0.1), 0.35 * e.velocite)).connect(sortie);
    },
  };

  M.synthe.instruments = {
    noms: Object.keys(INSTRUMENTS),
    /** Joue un évènement de partition dans le contexte (volume de la piste compris). */
    jouer: function (contexte, sortie, e, bruit) {
      var faire = INSTRUMENTS[e.instrument];
      if (!faire) return;
      var piste = contexte.createGain();
      piste.gain.value = e.volume === undefined ? 1 : e.volume;
      piste.connect(sortie);
      sourcesEnCours = [];
      faire(contexte, piste, { t: e.t, frequences: e.frequences && e.frequences.length ? e.frequences : [220], duree: Math.max(0.05, e.duree), velocite: e.velocite === undefined ? 1 : e.velocite }, bruit);
      // Note finie : sa chaîne est débranchée, le rendu ne la calcule plus (sinon il ralentit avec la durée).
      var sources = sourcesEnCours, restantes = sources.length;
      sourcesEnCours = null;
      sources.forEach(function (src) {
        src.onended = function () { if (--restantes === 0) piste.disconnect(); };
      });
    },
  };

  /** Rend un instrument seul (2 s) : sert aux tests. -> Promise<{ rms, crete, fini }> */
  M.synthe.essayerInstrument = function (nom) {
    var c = new OfflineAudioContext(1, 2 * 48000, 48000);
    M.synthe.instruments.jouer(c, c.destination, { t: 0.1, instrument: nom, frequences: [220, 277.18, 329.63], duree: 1, velocite: 1, volume: 1 }, M.synthe.bruit(c, 1));
    return c.startRendering().then(function (b) {
      var x = b.getChannelData(0), s = 0, m = 0, fini = true;
      for (var i = 0; i < x.length; i++) { if (!isFinite(x[i])) fini = false; s += x[i] * x[i]; m = Math.max(m, Math.abs(x[i])); }
      return { rms: Math.sqrt(s / x.length), crete: m, fini: fini };
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
