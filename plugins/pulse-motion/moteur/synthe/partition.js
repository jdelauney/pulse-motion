/* Pulse Motion – partition : lecture (notes françaises ou anglaises, accords, silences, frappes), validation en
 * français, évènements datés pour le synthétiseur. Mesure à 4 temps ; durée en fraction de ronde.
 *
 * Module pur : chargé tel quel dans la page (global M.synthe.partition) et par Node (require).
 */
(function (racine, fabrique) {
  var C = typeof require === 'function' && typeof module === 'object' ? require('./catalogue.js') : racine.M.synthe.catalogue;
  var api = fabrique(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M.synthe = racine.M.synthe || {}; racine.M.synthe.partition = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var DEMITONS = { do: 0, re: 2, 'ré': 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11, c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  var NOMS = ['do', 'do#', 're', 'mib', 'mi', 'fa', 'fa#', 'sol', 'lab', 'la', 'sib', 'si'];
  var NOTE = /^(do|ré|re|mi|fa|sol|la|si|[a-g])(#|b|♯|♭)?(-?\d)$/i;
  var DUREE = /^(\d+)(?:\/(\d+))?$/;

  /** Nom de note -> numéro midi, ou null. */
  function midi(nom) {
    var m = NOTE.exec(String(nom).trim());
    if (!m) return null;
    var alt = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
    return (parseInt(m[3], 10) + 1) * 12 + DEMITONS[m[1].toLowerCase()] + alt;
  }
  function frequence(nom) {
    var n = midi(nom);
    return n === null ? null : 440 * Math.pow(2, (n - 69) / 12);
  }
  function nomDeMidi(n) { return NOMS[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); }
  function dureeMesure(tempo) { return 4 * 60 / tempo; }

  /** « re4+fa4 1/4 0.7 » -> { notes: [nom] | 'x' | null (silence), fraction, velocite } ou { erreur } */
  function lirePas(texte) {
    var champs = String(texte).trim().split(/\s+/);
    if (!champs[0]) return { erreur: 'vide' };
    if (champs.length < 2) return { erreur: 'durée manquante (ex. « do4 1/4 »)' };
    var d = DUREE.exec(champs[1]);
    var fraction = d ? parseInt(d[1], 10) / (d[2] ? parseInt(d[2], 10) : 1) : NaN;
    if (!(fraction > 0)) return { erreur: 'durée « ' + champs[1] + ' » : une fraction de ronde (1, 1/2, 1/4, 3/8…)' };
    var velocite = champs[2] === undefined ? 1 : parseFloat(champs[2]);
    if (!(velocite >= 0 && velocite <= 1)) return { erreur: 'vélocité « ' + champs[2] + ' » : un nombre de 0 à 1' };
    if (champs[0] === '-') return { notes: null, fraction: fraction, velocite: velocite };
    if (champs[0].toLowerCase() === 'x') return { notes: 'x', fraction: fraction, velocite: velocite };
    var notes = champs[0].split('+');
    for (var i = 0; i < notes.length; i++) {
      var n = midi(notes[i]);
      if (n === null) return { erreur: '« ' + notes[i] + ' » n\'est pas une note (do4, ré#3, sib2, a4…)' };
      if (n < 12 || n > 108) return { erreur: '« ' + notes[i] + ' » hors de l\'étendue (do0 à do8)' };
    }
    return { notes: notes, fraction: fraction, velocite: velocite };
  }

  /** -> messages en français, vide si la partition est valide. */
  function validerPartition(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return ['La partition doit être un objet JSON.'];
    var err = [];
    if (!(typeof p.tempo === 'number' && p.tempo >= 40 && p.tempo <= 220)) err.push('« tempo » doit être un nombre de battements par minute, de 40 à 220.');
    if (!(Number.isInteger(p.mesures) && p.mesures >= 1)) err.push('« mesures » doit être un nombre entier de mesures (au moins 1).');
    if (!Array.isArray(p.pistes) || !p.pistes.length) { err.push('« pistes » doit contenir au moins une piste.'); return err; }
    p.pistes.forEach(function (piste, i) {
      var nom = 'piste ' + (i + 1);
      if (!piste || typeof piste !== 'object') { err.push(nom + ' : un objet { instrument, motif } est attendu.'); return; }
      if (C.INSTRUMENTS.indexOf(piste.instrument) < 0) err.push(nom + ' : instrument « ' + piste.instrument + ' » inconnu (' + C.INSTRUMENTS.join(', ') + ').');
      if (piste.volume !== undefined && !(typeof piste.volume === 'number' && piste.volume >= 0 && piste.volume <= 1)) err.push(nom + ' : « volume » de 0 à 1.');
      ['de', 'a'].forEach(function (k) { if (piste[k] !== undefined && !(Number.isInteger(piste[k]) && piste[k] >= 0)) err.push(nom + ' : « ' + k + ' » doit être un numéro de mesure (entier, à partir de 0).'); });
      if (!Array.isArray(piste.motif) || !piste.motif.length) { err.push(nom + ' : motif vide.'); return; }
      piste.motif.forEach(function (pas, j) {
        var r = lirePas(pas);
        if (r.erreur) err.push(nom + ', note ' + (j + 1) + ' : ' + r.erreur + '.');
      });
    });
    return err;
  }

  /** Partition valide -> évènements [{ t, instrument, frequences, duree, velocite, volume }], triés, coupés à duree. */
  function evenements(p, options) {
    var mesure = dureeMesure(p.tempo), fin = p.mesures * mesure;
    if (options && options.duree !== undefined) fin = Math.min(fin, options.duree);
    var liste = [];
    p.pistes.forEach(function (piste) {
      var pas = piste.motif.map(lirePas);
      var debut = (piste.de || 0) * mesure;
      var arret = Math.min(fin, (piste.a === undefined ? p.mesures : piste.a) * mesure);
      var t = debut, k = 0, garde = 0;
      while (t < arret - 1e-9 && garde++ < 100000) {
        var s = pas[k % pas.length];
        var duree = s.fraction * mesure;
        if (s.notes) {
          liste.push({
            t: Math.round(t * 1e6) / 1e6, instrument: piste.instrument,
            frequences: s.notes === 'x' ? [] : s.notes.map(frequence),
            duree: Math.round(Math.min(duree, arret - t) * 1e6) / 1e6, velocite: s.velocite, volume: piste.volume === undefined ? 1 : piste.volume,
          });
        }
        t += duree;
        k++;
      }
    });
    liste.sort(function (a, b) { return a.t - b.t; });
    return liste;
  }

  return { frequence: frequence, midi: midi, nomDeMidi: nomDeMidi, dureeMesure: dureeMesure, validerPartition: validerPartition, evenements: evenements };
});
