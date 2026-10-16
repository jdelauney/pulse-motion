/* Pulse Motion – son réactif (P7) : chaque piste lue par la vidéo (M.donnees.son) est analysée une fois, hors temps réel,
 * après M.pret (M.analyseSon sur M.pistesBrutes) ; lecture à t, fonction de t seulement ; variables CSS du son sur
 * #pm-scene à chaque rendu ; M.seek attend la fin de l'analyse (export identique à l'aperçu).
 *
 * M.demarrerSonReactif()     après M.demarrer() ; sans M.donnees.son : rien à analyser, M.son.pret résolue
 * M.son.pret                 Promise résolue quand l'analyse est faite (ou impossible : M.son.erreur)
 * M.son.actif()              la vidéo lit le son ; M.son.fait() : analyse terminée
 * M.son.pistes()             pistes analysées ; M.son.erreur(piste) -> message | null (piste illisible)
 * M.son.lire(piste, t) -> { volume, basses, mediums, aigus, battement, phase, enveloppe, syllabe }  (zéros sans la piste)
 * M.son.spectre(piste, t), M.son.onde(piste, t) -> Uint8Array(512) | null
 * M.son.battements(piste), M.son.syllabes(piste) -> [t] ; M.son.empreinte(piste) -> texte | null (tests)
 * Variables CSS (M.donnees.son.css) : --son-volume, --son-basses, --son-mediums, --son-aigus, --son-battement, --son-phase
 * (musique), --voix-enveloppe (voix), 4 décimales, 0 tant que l'analyse n'est pas faite.
 * Navigateur seulement ; dépend de horloge, audio (M.pistesBrutes), analyse-son.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var VARIABLES = [['--son-volume', 'volume'], ['--son-basses', 'basses'], ['--son-mediums', 'mediums'], ['--son-aigus', 'aigus'],
    ['--son-battement', 'battement'], ['--son-phase', 'phase']];
  var etat = { tables: {}, erreurs: {}, fait: false };
  var resoudre;
  var pret = new Promise(function (r) { resoudre = r; });

  function besoin() { return (M.donnees && M.donnees.son) || null; }
  function vide() {
    var r = {};
    Object.keys(M.analyseSon.VIDE).forEach(function (k) { r[k] = 0; });
    return r;
  }

  M.son = {
    get pret() { return pret; },
    actif: function () { return !!besoin(); },
    fait: function () { return etat.fait; },
    pistes: function () { return Object.keys(etat.tables); },
    erreur: function (p) { return etat.erreurs[p] || null; },
    lire: function (p, t) { var tb = etat.tables[p]; return tb ? M.analyseSon.lire(tb, t) : vide(); },
    spectre: function (p, t) { var tb = etat.tables[p]; return tb ? M.analyseSon.spectreA(tb, t) : null; },
    onde: function (p, t) { var tb = etat.tables[p]; return tb ? M.analyseSon.ondeA(tb, t) : null; },
    battements: function (p) { var tb = etat.tables[p]; return tb ? tb.battements.slice() : []; },
    syllabes: function (p) { var tb = etat.tables[p]; return tb ? tb.syllabes.slice() : []; },
    empreinte: function (p) { var tb = etat.tables[p]; return tb ? M.analyseSon.empreinte(tb) : null; },
  };

  function poserVariables(t) {
    var b = besoin();
    if (!b || !b.css) return;
    var scene = document.getElementById('pm-scene');
    if (!scene) return;
    var m = M.son.lire('musique', t);
    VARIABLES.forEach(function (v) { scene.style.setProperty(v[0], m[v[1]].toFixed(4)); });
    scene.style.setProperty('--voix-enveloppe', M.son.lire('voix', t).enveloppe.toFixed(4));
  }

  async function analyser(b) {
    await M.pret;
    var r = await M.pistesBrutes(b.pistes);
    b.pistes.forEach(function (p) {
      var x = r.pistes[p];
      if (!x) return;
      if (x.erreur) {
        etat.erreurs[p] = x.erreur;
        console.error('[Pulse Motion] Son réactif : ' + x.erreur);
        return;
      }
      etat.tables[p] = M.analyseSon.analyser(x.echantillons, r.taux, { duree: M.duree, voix: p === 'voix' });
    });
  }

  M.demarrerSonReactif = function () {
    var b = besoin();
    if (!b) { etat.fait = true; resoudre(); return; }
    M.surRendu(poserVariables);
    // Un seek rend avant la fin de l'analyse : les variables sont reposées à t une fois l'analyse faite.
    M.surSeek(function () { return pret.then(function () { poserVariables(M.temps()); }); });
    poserVariables(M.temps());
    var travail = b.pistes.length ? analyser(b) : Promise.resolve();
    travail.catch(function (e) {
      var m = 'Le son n\'a pas pu être analysé (' + String(e && e.message || e) + ').';
      b.pistes.forEach(function (p) { if (!etat.tables[p] && !etat.erreurs[p]) etat.erreurs[p] = m; });
      console.error('[Pulse Motion] ' + m);
    }).then(function () {
      etat.fait = true;
      resoudre();
      poserVariables(M.temps());
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
