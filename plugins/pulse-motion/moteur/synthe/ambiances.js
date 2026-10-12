/* Pulse Motion – ambiances : six recettes qui écrivent une partition (le même chemin qu'une partition libre).
 * Structure calée sur les scènes : introduction sans percussion, corps, montée (riser) sur la dernière seconde de
 * l'avant-dernière scène, accord de tonique final. Variations tous les 8 temps tirées de la graine (déterministe).
 *
 * Module pur : chargé tel quel dans la page (global M.synthe.ambiances) et par Node (require).
 */
(function (racine, fabrique) {
  var enNode = typeof require === 'function' && typeof module === 'object';
  var C = enNode ? require('./catalogue.js') : racine.M.synthe.catalogue;
  var P = enNode ? require('./partition.js') : racine.M.synthe.partition;
  var api = fabrique(C, P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M.synthe.ambiances = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, P) {
  'use strict';

  var TONIQUES = { do: 0, 'do#': 1, reb: 1, re: 2, 'ré': 2, 're#': 3, mib: 3, mi: 4, fa: 5, 'fa#': 6, solb: 6, sol: 7, 'sol#': 8, lab: 8, la: 9, 'la#': 10, sib: 10, si: 11 };
  var TONALITE = /^(do#?|reb|re#?|ré|mib|mi|fa#?|solb|sol#?|lab|la#?|sib|si)(m?)$/;
  var MAJEUR = [0, 2, 4, 5, 7, 9, 11], MINEUR = [0, 2, 3, 5, 7, 8, 10];

  // Progressions (degrés 1 à 7, deux variantes au choix de la graine), couches et rythmes de chaque ambiance.
  var RECETTES = {
    calme: { progressions: [[1, 4, 6, 5], [1, 6, 4, 5]], nappe: 'pad', rythmeBasse: ['1'], rythmePluck: ['1/2'], percussions: false },
    entrainant: { progressions: [[1, 5, 6, 4], [6, 4, 1, 5]], nappe: 'pad', rythmeBasse: ['1/8', '1/8', '1/4', '1/8', '1/8', '1/4'], rythmePluck: ['1/8'], percussions: true },
    inspirant: { progressions: [[1, 5, 6, 4], [4, 1, 5, 6]], nappe: 'pad', rythmeBasse: ['1/2'], rythmePluck: ['1/4'], percussions: true },
    corporate: { progressions: [[1, 6, 4, 5], [1, 4, 5, 4]], nappe: 'pad', rythmeBasse: ['1/4'], rythmePluck: ['1/8'], percussions: true },
    suspense: { progressions: [[1, 6, 3, 7], [1, 7, 6, 7]], nappe: 'nappe-bruit', rythmeBasse: ['1'], rythmePluck: ['1/4', '- 1/4', '1/2'], percussions: true, cloche: true },
    tech: { progressions: [[1, 7, 6, 7], [1, 6, 7, 1]], nappe: 'pad', rythmeBasse: ['1/8'], rythmePluck: ['1/16'], percussions: true },
  };

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tonaliteValide(t) { return TONALITE.test(String(t)); }

  /** Accord (triade) du degré d (1 à 7) sur la gamme, à partir de la tonique (midi). -> [midi] */
  function accord(tonique, gamme, d) {
    return [0, 2, 4].map(function (k) {
      var i = d - 1 + k;
      return tonique + gamme[i % 7] + 12 * Math.floor(i / 7);
    });
  }

  function fraction(r) {
    var f = r.split('/');
    return parseInt(f[0], 10) / (f[1] ? parseInt(f[1], 10) : 1);
  }

  /** { ambiance, tempo?, tonalite?, intensite?, graine?, duree, scenes } -> partition */
  function generer(o) {
    var base = C.AMBIANCES[o.ambiance];
    var recette = RECETTES[o.ambiance];
    var tempo = o.tempo || base.tempo;
    var tonalite = o.tonalite || base.tonalite;
    var m = TONALITE.exec(tonalite) || TONALITE.exec(base.tonalite);
    var gamme = m[2] === 'm' ? MINEUR : MAJEUR;
    var tonique = 48 + TONIQUES[m[1]];   // octave 3
    var intensite = o.intensite === undefined ? 0.5 : o.intensite;
    var hasard = mulberry32((o.graine === undefined ? 1 : o.graine) * 9973 + Object.keys(RECETTES).indexOf(o.ambiance) + 1);
    var mesure = P.dureeMesure(tempo);
    var mesures = Math.max(1, Math.ceil(o.duree / mesure));
    var scenes = o.scenes && o.scenes.length ? o.scenes : [{ debut: 0, fin: o.duree }];
    var corps = Math.max(0, mesures - 1);   // la dernière mesure porte l'accord final
    var intro = Math.min(corps, Math.max(0, Math.round(scenes[0].fin / mesure)));
    var progression = recette.progressions[Math.floor(hasard() * recette.progressions.length)];
    var nom = P.nomDeMidi;
    var pistes = [];

    // Un accord par mesure ; tous les 2 mesures (8 temps), la graine choisit le renversement.
    var accords = [], renverse = false;
    for (var i = 0; i < corps; i++) {
      var notes = accord(tonique, gamme, progression[i % progression.length]);
      if (i % 2 === 0) renverse = hasard() < 0.5;
      if (renverse) notes = [notes[1], notes[2], notes[0] + 12];
      accords.push(notes);
    }

    if (corps > 0) {
      // Nappe (ou arpèges en tech).
      if (o.ambiance === 'tech') {
        pistes.push({ instrument: 'pluck', volume: 0.5, motif: [].concat.apply([], accords.map(function (a) {
          var seq = [a[0] + 12, a[1] + 12, a[2] + 12, a[1] + 12];
          return [].concat(seq, seq, seq, seq).map(function (n) { return nom(n) + ' 1/16'; });
        })), de: 0, a: corps });
        pistes.push({ instrument: 'pad', volume: 0.35, motif: accords.map(function (a) { return a.map(nom).join('+') + ' 1'; }), de: 0, a: corps });
      } else if (recette.nappe === 'nappe-bruit') {
        pistes.push({ instrument: 'nappe-bruit', volume: 0.5, motif: ['x 1'], de: 0, a: corps });
        pistes.push({ instrument: 'pad', volume: 0.4, motif: accords.map(function (a) { return nom(a[0] - 12) + '+' + nom(a[0]) + ' 1'; }), de: 0, a: corps });
      } else {
        pistes.push({ instrument: 'pad', volume: 0.55, motif: accords.map(function (a) { return a.map(nom).join('+') + ' 1'; }), de: 0, a: corps });
      }
      // Basse : fondamentale une octave plus bas, au rythme de l'ambiance.
      if (intensite >= 0.25) {
        pistes.push({ instrument: 'basse', volume: 0.6, motif: [].concat.apply([], accords.map(function (a) {
          var pas = [], temps = 0, j = 0;
          while (temps < 1 - 1e-9) { var r = recette.rythmeBasse[j++ % recette.rythmeBasse.length]; pas.push(nom(a[0] - 12) + ' ' + r); temps += fraction(r); }
          return pas;
        })), de: 0, a: corps });
      }
      // Pluck (cloche en suspense) : notes de l'accord, variées par la graine.
      if (intensite >= 0.45 && o.ambiance !== 'tech') {
        var motif = [];
        accords.forEach(function (a) {
          var temps = 0, j = 0;
          while (temps < 1 - 1e-9) {
            var r = recette.rythmePluck[j++ % recette.rythmePluck.length];
            var silence = r.indexOf('- ') === 0;
            var d = silence ? r.slice(2) : r;
            var n = a[Math.floor(hasard() * 3)] + 12;
            motif.push(silence ? '- ' + d : nom(n) + ' ' + d + ' ' + (0.6 + 0.4 * hasard()).toFixed(2));
            temps += fraction(d);
          }
        });
        pistes.push({ instrument: recette.cloche ? 'cloche' : 'pluck', volume: 0.45, motif: motif, de: 0, a: corps });
      }
      // Percussions après l'introduction.
      if (recette.percussions && intensite >= 0.65 && intro < corps) {
        pistes.push({ instrument: 'kick', volume: 0.7, motif: ['x 1/4'], de: intro, a: corps });
        pistes.push({ instrument: 'charleston', volume: 0.35, motif: ['- 1/8', 'x 1/8 0.7'], de: intro, a: corps });
        if (o.ambiance !== 'suspense') pistes.push({ instrument: 'caisse', volume: 0.5, motif: ['- 1/4', 'x 1/4'], de: intro, a: corps });
      }
      // Montée sur la dernière seconde de l'avant-dernière scène.
      if (scenes.length >= 2) {
        var tMontee = Math.max(0, scenes[scenes.length - 2].fin - 1);
        var mesureMontee = Math.floor(tMontee / mesure);
        if (mesureMontee < corps) pistes.push({ instrument: 'riser', volume: 0.5, motif: ['x 1'], de: mesureMontee, a: mesureMontee + 1 });
      }
    }
    // Accord final : tonique tenue sur la dernière mesure.
    pistes.push({ instrument: 'pad', volume: 0.55, motif: [accord(tonique, gamme, 1).map(nom).join('+') + ' 1'], de: mesures - 1, a: mesures });
    return { tempo: tempo, tonalite: tonalite, mesures: mesures, pistes: pistes };
  }

  return { generer: generer, tonaliteValide: tonaliteValide };
});
