/* Pulse Motion – son de la vidéo : un seul mixage (voix, musique, plus tard bruitages), rendu hors temps réel,
 * utilisé par la lecture, l'export dans le navigateur et l'export fidèle.
 *
 *   M.aSon()       vrai si la vidéo a au moins une source sonore
 *   M.rendreSon()  -> Promise<{ buffer: AudioBuffer|null, sonie: number|null, avertissements: [texte] }>, une fois par page
 *
 * Sources embarquées par l'assembleur : un bloc script de type text/plain d'id « pm-son-… » contenant une URL data:,
 * désigné dans pm-donnees (musique.source, scenes[].voix.source). Musique baissée sous la parole (ducking : gain et creux à 2,5 kHz),
 * puis sonie ramenée à −16 LUFS (M.sonie).
 * Navigateur seulement ; dépend de horloge (M.donnees, M.minutage, M.duree), mixage et sonie.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var TAUX = 48000;
  var promesse = null;

  /** Prises de voix placées dans la vidéo : [{ scene, source, debut, mots }]. */
  function prisesVoix() {
    var d = M.donnees || {};
    return (d.scenes || []).map(function (sc, i) {
      var v = sc.voix;
      if (!v || !v.source || !M.minutage) return null;
      return { scene: sc.id, source: v.source, debut: M.minutage.scenes[i].debut + (v.debut || 0), mots: v.mots || [] };
    }).filter(Boolean);
  }

  M.aSon = function () {
    var d = M.donnees;
    return !!(d && ((d.musique && d.musique.source) || prisesVoix().length));
  };

  async function decoder(contexte, id) {
    var el = document.getElementById(id);
    if (!el) throw new Error('source « ' + id + ' » absente de la page');
    var octets = await (await fetch(el.textContent.trim())).arrayBuffer();
    return contexte.decodeAudioData(octets);
  }

  function automatiser(param, points) {
    param.setValueAtTime(points[0].v, 0);
    for (var i = 1; i < points.length; i++) param.linearRampToValueAtTime(points[i].v, points[i].t);
  }

  async function rendre() {
    var d = M.donnees, duree = M.duree, X = M.mixage, D = X.DUCKING;
    var contexte = new OfflineAudioContext(2, Math.max(1, Math.ceil(duree * TAUX)), TAUX);
    var avertissements = [], sources = 0, musiqueIllisible = false, entendues = [];
    var volumeVoix = d.voix && typeof d.voix.volume === 'number' ? d.voix.volume : 1;

    var prises = prisesVoix();
    for (var i = 0; i < prises.length; i++) {
      var p = prises[i];
      try {
        var tampon = await decoder(contexte, p.source);
        var voix = contexte.createBufferSource();
        voix.buffer = tampon;
        var gainVoix = contexte.createGain();
        gainVoix.gain.value = volumeVoix;
        voix.connect(gainVoix).connect(contexte.destination);
        voix.start(p.debut);
        entendues.push(p);
        sources++;
      } catch (e) {
        avertissements.push('La voix de la scène « ' + p.scene + ' » n\'a pas pu être lue.');
      }
    }

    if (d.musique && d.musique.source) {
      try {
        var musique = contexte.createBufferSource();
        musique.buffer = await decoder(contexte, d.musique.source);
        var volume = typeof d.musique.volume === 'number' ? d.musique.volume : 1;
        var fondus = contexte.createGain();
        automatiser(fondus.gain, X.pointsFondus(duree, volume));
        var points = X.pointsDucking(X.groupesParole(entendues, D.ecart), D);
        var baisse = contexte.createGain();
        automatiser(baisse.gain, points.map(function (q) { return { t: q.t, v: Math.pow(10, q.db / 20) }; }));
        var creux = contexte.createBiquadFilter();
        creux.type = 'peaking';
        creux.frequency.value = D.frequence;
        creux.Q.value = D.q;
        automatiser(creux.gain, points.map(function (q) { return { t: q.t, v: q.db * D.creux }; }));
        musique.connect(fondus).connect(baisse).connect(creux).connect(contexte.destination);
        musique.start(0);
        sources++;
      } catch (e) {
        musiqueIllisible = true;
      }
    }
    if (musiqueIllisible) {
      avertissements.push(sources ? 'La musique n\'a pas pu être lue : son exporté sans musique.' : 'La musique n\'a pas pu être lue : vidéo exportée sans son.');
    }
    if (!sources) return { buffer: null, sonie: null, avertissements: avertissements };

    var buffer = await contexte.startRendering();
    var r = M.sonie.normaliser([buffer.getChannelData(0), buffer.getChannelData(1)], TAUX);
    return { buffer: buffer, sonie: isFinite(r.integree) ? r.integree : null, avertissements: avertissements };
  }

  M.rendreSon = function () {
    if (!promesse) promesse = rendre();
    return promesse;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
