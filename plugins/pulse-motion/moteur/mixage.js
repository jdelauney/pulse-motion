/* Pulse Motion – courbes du mixage : groupes de parole, baisse de la musique sous la voix (ducking), fondus ; boucle parfaite
 * (spec Rendu et export, 5.18) : pas de fondus, et ce qui dépasse la fin replié au début (replierBoucle).
 *
 * Module pur : chargé tel quel dans la page (global M.mixage) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.mixage = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DUCKING = { attenuation: -10, avant: 0.1, apres: 0.25, ecart: 0.3, creux: 0.4, frequence: 2500, q: 1 };
  var FONDU_ENTREE = 0.5;
  var FONDU_SORTIE = 1.5;

  /** Prises placées dans la vidéo -> groupes de parole [{ debut, fin }], triés, écarts < ecart fusionnés. */
  function groupesParole(prises, ecart) {
    if (ecart === undefined) ecart = DUCKING.ecart;
    var mots = [];
    prises.forEach(function (p) { (p.mots || []).forEach(function (m) { mots.push({ debut: p.debut + m.t0, fin: p.debut + m.t1 }); }); });
    mots.sort(function (a, b) { return a.debut - b.debut; });
    var groupes = [];
    mots.forEach(function (m) {
      var d = groupes[groupes.length - 1];
      if (d && m.debut - d.fin < ecart) d.fin = Math.max(d.fin, m.fin);
      else groupes.push({ debut: m.debut, fin: m.fin });
    });
    return groupes;
  }

  function arrondi(x) { return Math.round(x * 1e6) / 1e6; }

  /** Groupes -> points d'automatisation [{ t, db }], t strictement croissants à partir de 0. */
  function pointsDucking(groupes, o) {
    var fusion = [];
    groupes.forEach(function (g) {
      var d = fusion[fusion.length - 1];
      if (d && g.debut - o.avant <= d.fin + o.apres) d.fin = Math.max(d.fin, g.fin);
      else fusion.push({ debut: g.debut, fin: g.fin });
    });
    var pts = [{ t: 0, db: 0 }];
    function ajouter(t, db) {
      t = arrondi(t);
      var der = pts[pts.length - 1];
      if (t <= der.t) der.db = db; else pts.push({ t: t, db: db });
    }
    fusion.forEach(function (g) {
      ajouter(Math.max(0, g.debut - o.avant), 0);
      ajouter(g.debut, o.attenuation);
      ajouter(g.fin, o.attenuation);
      ajouter(g.fin + o.apres, 0);
    });
    return pts;
  }

  /** Fondus de la musique : entrée 0,5 s, sortie 1,5 s, ramenés dans la moitié d'une vidéo courte. -> [{ t, v }] */
  function pointsFondus(duree, volume, options) {
    // En boucle, la musique ne s'éteint ni ne s'allume : la fin rejoint le début.
    if (options && options.boucle) return [{ t: 0, v: volume }, { t: arrondi(duree), v: volume }];
    var entree = Math.min(FONDU_ENTREE, duree / 2);
    var sortie = Math.max(duree - FONDU_SORTIE, duree / 2);
    var pts = [{ t: 0, v: 0 }, { t: arrondi(entree), v: volume }];
    if (sortie > entree) pts.push({ t: arrondi(sortie), v: volume });
    pts.push({ t: arrondi(duree), v: 0 });
    return pts.filter(function (p, i) { return i === 0 || p.t > pts[i - 1].t; });
  }

  /** Longueur rendue en plus de la vidéo pour une boucle : la queue (réverbérations, résonances) repliée au début. */
  var QUEUE_BOUCLE = 2;
  /**
   * Boucle parfaite (5.18) : canaux rendus sur n + queue échantillons -> canaux de n échantillons, la queue [n, n + q) ajoutée au
   * début, et le tout début du son d'origine ouvert en fondu sur fondu secondes (10 ms) : au premier échantillon, la jointure vaut
   * exactement la suite du son à la fin, sans clic.
   */
  function replierBoucle(canaux, n, taux, fondu) {
    var f = Math.max(1, Math.round((fondu === undefined ? 0.01 : fondu) * taux));
    return canaux.map(function (c) {
      var sortie = new Float32Array(n);
      for (var i = 0; i < n; i++) sortie[i] = c[i] * (i < f ? i / f : 1);
      for (var j = n; j < c.length && j - n < n; j++) sortie[j - n] += c[j];
      return sortie;
    });
  }

  return { DUCKING: DUCKING, groupesParole: groupesParole, pointsDucking: pointsDucking, pointsFondus: pointsFondus, replierBoucle: replierBoucle, QUEUE_BOUCLE: QUEUE_BOUCLE };
});
