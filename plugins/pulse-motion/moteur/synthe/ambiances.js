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

  var HUMEURS = ['silence', 'calme', 'normale', 'intense'];
  function arrondi(x) { return Math.round(x * 1e6) / 1e6; }

  /**
   * { ambiance, tempo?, tonalite?, intensite?, graine?, duree, scenes: [{ debut, fin, humeur? }] } -> partition
   * Une section par scène, calée sur son vrai début (transitions comprises) et arrêtée au début de la suivante : la grille
   * des temps repart à chaque scène, les temps musicaux de la scène tombent sur la musique. Humeur : « silence » (rien),
   * « calme » (nappe seule), « normale » (couches selon l'intensité ; la première scène, sans humeur, est une introduction
   * sans percussion), « intense » (toutes les couches). La progression d'accords continue d'une section à l'autre.
   */
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
    var duree = o.duree;
    var mesures = Math.max(1, Math.ceil(duree / mesure - 1e-9));
    var brutes = o.scenes && o.scenes.length ? o.scenes : [{ debut: 0, fin: duree }];
    var sections = brutes.map(function (sc, i) {
      var finSection = i + 1 < brutes.length ? brutes[i + 1].debut : duree;
      return { debut: Math.max(0, sc.debut), fin: Math.min(finSection, duree), humeur: sc.humeur || (i === 0 ? 'intro' : 'normale') };
    }).filter(function (sec) { return sec.fin - sec.debut > 1e-6; });
    var progression = recette.progressions[Math.floor(hasard() * recette.progressions.length)];
    var nom = P.nomDeMidi;
    var pistes = [];
    var compteur = 0, renverse = false;

    // Un accord par mesure ; tous les 2 mesures (8 temps), la graine choisit le renversement.
    // racines : fondamentale de chaque accord, gardée pour la basse quand l'accord est renversé.
    function accordsSuivants(n) {
      var accords = [], racines = [];
      for (var i = 0; i < n; i++) {
        var k = compteur + i;
        var notes = accord(tonique, gamme, progression[k % progression.length]);
        racines.push(notes[0]);
        if (k % 2 === 0) renverse = hasard() < 0.5;
        if (renverse) notes = [notes[1], notes[2], notes[0] + 12];
        accords.push(notes);
      }
      compteur += n;
      return { accords: accords, racines: racines };
    }

    sections.forEach(function (sec, idx) {
      var longueur = sec.fin - sec.debut;
      var n = Math.max(1, Math.ceil(longueur / mesure - 1e-9));
      var h = sec.humeur;
      if (h === 'silence') { compteur += n; return; }
      // Accord final : la dernière mesure de la vidéo, ou les deux dernières si elle finit en début de mesure.
      var finales = 0;
      if (idx === sections.length - 1) {
        var reste = longueur - (n - 1) * mesure;
        finales = n >= 2 && reste < mesure / 2 ? 2 : 1;
      }
      var corps = n - finales;
      function cadre(piste, de, a) {
        piste.de = de; piste.a = a; piste.origine = arrondi(sec.debut); piste.jusqua = arrondi(sec.fin);
        pistes.push(piste);
      }
      var pleine = h === 'intense';
      var normale = h === 'normale' || h === 'intro';
      if (corps > 0) {
        var ac = accordsSuivants(corps), accords = ac.accords, racines = ac.racines;
        // Nappe (ou arpèges en tech).
        if (o.ambiance === 'tech' && h !== 'calme') {
          cadre({ instrument: 'pluck', volume: 0.5, motif: [].concat.apply([], accords.map(function (a) {
            var seq = [a[0] + 12, a[1] + 12, a[2] + 12, a[1] + 12];
            return [].concat(seq, seq, seq, seq).map(function (x) { return nom(x) + ' 1/16'; });
          })) }, 0, corps);
          cadre({ instrument: 'pad', volume: 0.35, motif: accords.map(function (a) { return a.map(nom).join('+') + ' 1'; }) }, 0, corps);
        } else if (recette.nappe === 'nappe-bruit') {
          cadre({ instrument: 'nappe-bruit', volume: 0.5, motif: ['x 1'] }, 0, corps);
          cadre({ instrument: 'pad', volume: 0.4, motif: racines.map(function (x) { return nom(x - 12) + '+' + nom(x) + ' 1'; }) }, 0, corps);
        } else {
          cadre({ instrument: 'pad', volume: 0.55, motif: accords.map(function (a) { return a.map(nom).join('+') + ' 1'; }) }, 0, corps);
        }
        // Basse : fondamentale une octave plus bas, au rythme de l'ambiance.
        if (pleine || (normale && intensite >= 0.25)) {
          cadre({ instrument: 'basse', volume: 0.6, motif: [].concat.apply([], racines.map(function (x) {
            var pas = [], temps = 0, j = 0;
            while (temps < 1 - 1e-9) { var r = recette.rythmeBasse[j++ % recette.rythmeBasse.length]; pas.push(nom(x - 12) + ' ' + r); temps += fraction(r); }
            return pas;
          })) }, 0, corps);
        }
        // Pluck (cloche en suspense) : notes de l'accord, variées par la graine.
        if ((pleine || (normale && intensite >= 0.45)) && o.ambiance !== 'tech') {
          var motif = [];
          accords.forEach(function (a) {
            var temps = 0, j = 0;
            while (temps < 1 - 1e-9) {
              var r = recette.rythmePluck[j++ % recette.rythmePluck.length];
              var silence = r.indexOf('- ') === 0;
              var d = silence ? r.slice(2) : r;
              var x = a[Math.floor(hasard() * 3)] + 12;
              motif.push(silence ? '- ' + d : nom(x) + ' ' + d + ' ' + (0.6 + 0.4 * hasard()).toFixed(2));
              temps += fraction(d);
            }
          });
          cadre({ instrument: recette.cloche ? 'cloche' : 'pluck', volume: 0.45, motif: motif }, 0, corps);
        }
        // Percussions : pas dans l'introduction.
        if (pleine || (h === 'normale' && recette.percussions && intensite >= 0.65)) {
          cadre({ instrument: 'kick', volume: 0.7, motif: ['x 1/4'] }, 0, corps);
          cadre({ instrument: 'charleston', volume: 0.35, motif: ['- 1/8', 'x 1/8 0.7'] }, 0, corps);
          if (o.ambiance !== 'suspense') cadre({ instrument: 'caisse', volume: 0.5, motif: ['- 1/4', 'x 1/4'] }, 0, corps);
        }
        // Sub (basse profonde) sur le premier temps, pour les ambiances qui poussent.
        if ((o.ambiance === 'tech' || o.ambiance === 'entrainant') && (pleine || (h === 'normale' && intensite >= 0.8))) {
          cadre({ instrument: 'sub', volume: 0.5, motif: racines.map(function (x) { return nom(x - 24) + ' 1/4'; }).reduce(function (mo, p) { return mo.concat([p, '- 3/4']); }, []) }, 0, corps);
        }
      }
      if (finales) cadre({ instrument: 'pad', volume: 0.55, motif: [accord(tonique, gamme, 1).map(nom).join('+') + ' ' + finales] }, corps, n);
    });

    // Montée sur la dernière seconde avant la dernière scène (au seizième de mesure près), sauf si elle est muette.
    if (sections.length >= 2 && sections[sections.length - 1].humeur !== 'silence') {
      var frontiere = sections[sections.length - 1].debut;
      var seiziemes = Math.max(1, Math.round(16 * Math.min(1, mesure) / mesure));
      var departMontee = frontiere - seiziemes / 16 * mesure;
      if (departMontee >= 0) pistes.push({ instrument: 'riser', volume: 0.5, motif: ['x ' + seiziemes + '/16'], de: 0, a: 1, origine: arrondi(departMontee), jusqua: arrondi(frontiere) });
    }
    return { tempo: tempo, tonalite: tonalite, mesures: mesures, pistes: pistes };
  }

  return { generer: generer, tonaliteValide: tonaliteValide, HUMEURS: HUMEURS };
});
