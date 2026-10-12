/* Pulse Motion – son de la vidéo : un seul mixage (voix, musique, plus tard bruitages), rendu hors temps réel,
 * utilisé par la lecture, l'export dans le navigateur et l'export fidèle.
 *
 *   M.aSon()       vrai si la vidéo a au moins une source sonore
 *   M.rendreSon()  -> Promise<{ buffer: AudioBuffer|null, sonie: number|null, avertissements: [texte] }>, une fois par page
 *
 * Sources embarquées par l'assembleur : un bloc script de type text/plain d'id « pm-son-… » contenant une URL data:,
 * désigné dans pm-donnees (musique.source, scenes[].voix.source). Musique baissée sous la parole (ducking : gain et creux à 2,5 kHz),
 * puis sonie de référence (bus à plein volume) ramenée à −16 LUFS (M.sonie) ; les volumes de la personne baissent ensuite.
 * Navigateur seulement ; dépend de horloge (M.donnees, M.minutage, M.duree), mixage et sonie.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var TAUX = 48000;
  var SONIE = -16;
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
    return !!(d && ((d.musique && (d.musique.source || d.musique.partition)) || prisesVoix().length));
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

  function nouveauContexte() {
    return new OfflineAudioContext(2, Math.max(1, Math.ceil(M.duree * TAUX)), TAUX);
  }
  function canaux(tampon) { return [tampon.getChannelData(0), tampon.getChannelData(1)]; }
  function volumeDe(objet) { return objet && typeof objet.volume === 'number' ? objet.volume : 1; }

  /** Chaque bus est rendu seul, à plein volume ; les volumes de la personne s'appliquent au mélange. */
  async function rendre() {
    var d = M.donnees, duree = M.duree, X = M.mixage, D = X.DUCKING;
    var avertissements = [], bus = [], musiqueIllisible = false, entendues = [];

    var prises = prisesVoix();
    if (prises.length) {
      var contexteVoix = nouveauContexte();
      for (var i = 0; i < prises.length; i++) {
        var p = prises[i];
        try {
          var voix = contexteVoix.createBufferSource();
          voix.buffer = await decoder(contexteVoix, p.source);
          voix.connect(contexteVoix.destination);
          voix.start(p.debut);
          entendues.push(p);
        } catch (e) {
          avertissements.push('La voix de la scène « ' + p.scene + ' » n\'a pas pu être lue.');
        }
      }
      if (entendues.length) bus.push({ tampon: await contexteVoix.startRendering(), volume: volumeDe(d.voix) });
    }

    if (d.musique && (d.musique.source || d.musique.partition)) {
      try {
        var contexte = nouveauContexte();
        // Musique importée (décodée), ou générée : partition jouée par le synthétiseur, coupée à la durée de la vidéo.
        var entree = contexte.createGain();
        if (d.musique.source) {
          var musique = contexte.createBufferSource();
          musique.buffer = await decoder(contexte, d.musique.source);
          musique.connect(entree);
          musique.start(0);
        } else {
          var bruit = M.synthe.bruit(contexte, 4242);
          M.synthe.partition.evenements(d.musique.partition, { duree: duree }).forEach(function (e) { M.synthe.instruments.jouer(contexte, entree, e, bruit); });
        }
        var fondus = contexte.createGain();
        automatiser(fondus.gain, X.pointsFondus(duree, 1));
        var points = X.pointsDucking(X.groupesParole(entendues, D.ecart), D);
        var baisse = contexte.createGain();
        automatiser(baisse.gain, points.map(function (q) { return { t: q.t, v: Math.pow(10, q.db / 20) }; }));
        var creux = contexte.createBiquadFilter();
        creux.type = 'peaking';
        creux.frequency.value = D.frequence;
        creux.Q.value = D.q;
        automatiser(creux.gain, points.map(function (q) { return { t: q.t, v: q.db * D.creux }; }));
        entree.connect(fondus).connect(baisse).connect(creux).connect(contexte.destination);
        bus.push({ tampon: await contexte.startRendering(), volume: volumeDe(d.musique) });
      } catch (e) {
        musiqueIllisible = true;
      }
    }
    if (musiqueIllisible) {
      avertissements.push(bus.length ? 'La musique n\'a pas pu être lue : son exporté sans musique.' : 'La musique n\'a pas pu être lue : vidéo exportée sans son.');
    }
    if (!bus.length) return { buffer: null, sonie: null, avertissements: avertissements };

    // Référence : tous les bus à plein volume, ramenés à −16 LUFS. Les volumes de la personne (« baisse la musique »)
    // s'appliquent ensuite : une musique seule à 0,5 sort 6 dB plus bas.
    var n = bus[0].tampon.length;
    var sources = bus.map(function (b) { return canaux(b.tampon); });
    var reference = sources[0];
    if (bus.length > 1) {
      reference = [new Float32Array(n), new Float32Array(n)];
      sources.forEach(function (s) { for (var c = 0; c < 2; c++) for (var k = 0; k < n; k++) reference[c][k] += s[c][k]; });
    }
    var lref = M.sonie.mesurer(reference, TAUX).integree;
    var gain = isFinite(lref) ? Math.pow(10, Math.min(SONIE - lref, 40) / 20) : 1;
    var sortie = bus[0].tampon, mix = sources[0];
    for (var c = 0; c < 2; c++) {
      for (var k = 0; k < n; k++) {
        var somme = 0;
        for (var b = 0; b < bus.length; b++) somme += bus[b].volume * sources[b][c][k];
        mix[c][k] = gain * somme;
      }
    }
    // Crêtes limitées sans changer la sonie obtenue.
    var lmix = M.sonie.mesurer(mix, TAUX).integree;
    var sonie = isFinite(lmix) ? M.sonie.normaliser(mix, TAUX, { cible: lmix }).integree : null;
    return { buffer: sortie, sonie: sonie, avertissements: avertissements };
  }

  M.rendreSon = function () {
    if (!promesse) promesse = rendre();
    return promesse;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
