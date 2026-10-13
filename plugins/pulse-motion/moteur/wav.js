/* Pulse Motion – WAV PCM : écriture 16 bits, lecture 16 bits ou flottant 32 bits, base64 ; traitement d'une prise
 * de voix (mono, passe-haut, silences, crête).
 *
 * Module pur : chargé tel quel dans la page (global M.wav) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.wav = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** { taux, canaux: Float32Array[] } -> Uint8Array (WAV PCM 16 bits, échantillons entrelacés). */
  function ecrire(son) {
    var canaux = son.canaux, nc = canaux.length, n = canaux[0].length, taille = n * nc * 2;
    var octets = new Uint8Array(44 + taille);
    var v = new DataView(octets.buffer);
    function texte(pos, s) { for (var i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)); }
    texte(0, 'RIFF'); v.setUint32(4, 36 + taille, true); texte(8, 'WAVE');
    texte(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, son.taux, true); v.setUint32(28, son.taux * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
    texte(36, 'data'); v.setUint32(40, taille, true);
    var pos = 44;
    for (var i = 0; i < n; i++) {
      for (var c = 0; c < nc; c++) {
        var x = Math.max(-1, Math.min(1, canaux[c][i]));
        v.setInt16(pos, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
        pos += 2;
      }
    }
    return octets;
  }

  /** Uint8Array (WAV PCM 16 bits ou flottant 32 bits) -> { taux, canaux: Float32Array[] }. */
  function lire(octets) {
    var v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
    function texte(pos, l) { var s = ''; for (var i = 0; i < l; i++) s += String.fromCharCode(v.getUint8(pos + i)); return s; }
    if (octets.byteLength < 12 || texte(0, 4) !== 'RIFF' || texte(8, 4) !== 'WAVE') throw new Error('ce fichier n\'est pas un WAV');
    var pos = 12, fmt = null;
    while (pos + 8 <= octets.byteLength) {
      var id = texte(pos, 4), taille = v.getUint32(pos + 4, true), corps = pos + 8;
      if (id === 'fmt ') {
        fmt = { format: v.getUint16(corps, true), canaux: v.getUint16(corps + 2, true), taux: v.getUint32(corps + 4, true), bits: v.getUint16(corps + 14, true) };
      } else if (id === 'data') {
        if (!fmt) throw new Error('WAV sans description du format');
        var flottant = (fmt.format === 3 || fmt.format === 0xFFFE) && fmt.bits === 32;
        var entier = (fmt.format === 1 || fmt.format === 0xFFFE) && fmt.bits === 16;
        if (!flottant && !entier) throw new Error('WAV non pris en charge (PCM 16 bits ou flottant 32 bits attendus, reçu ' + fmt.bits + ' bits)');
        var pas = fmt.bits / 8 * fmt.canaux;
        var n = Math.floor(Math.min(taille, octets.byteLength - corps) / pas);
        var canaux = [];
        for (var c = 0; c < fmt.canaux; c++) canaux.push(new Float32Array(n));
        for (var i = 0; i < n; i++) {
          for (c = 0; c < fmt.canaux; c++) {
            var p = corps + i * pas + c * fmt.bits / 8;
            canaux[c][i] = flottant ? v.getFloat32(p, true) : v.getInt16(p, true) / 32768;
          }
        }
        return { taux: fmt.taux, canaux: canaux };
      }
      pos = corps + taille + (taille % 2);
    }
    throw new Error('WAV sans données');
  }

  /** Uint8Array -> base64 (Node : Buffer ; navigateur : btoa par morceaux). */
  function base64(octets) {
    if (typeof Buffer !== 'undefined') return Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength).toString('base64');
    var morceaux = [];
    for (var i = 0; i < octets.length; i += 0x8000) morceaux.push(String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000)));
    return btoa(morceaux.join(''));
  }

  /** Canaux -> un seul canal (moyenne). */
  function mono(canaux) {
    if (canaux.length === 1) return Float32Array.from(canaux[0]);
    var n = canaux[0].length, x = new Float32Array(n);
    for (var i = 0; i < n; i++) { var s = 0; for (var c = 0; c < canaux.length; c++) s += canaux[c][i]; x[i] = s / canaux.length; }
    return x;
  }

  /** Passe-haut du deuxième ordre (Butterworth) : retire grondements et souffle grave. -> nouveau tableau */
  function passeHaut(canal, taux, frequence) {
    var f = frequence || 80, K = Math.tan(Math.PI * f / taux), Q = Math.SQRT1_2, a0 = 1 + K / Q + K * K;
    var b0 = 1 / a0, b1 = -2 / a0, b2 = 1 / a0, a1 = 2 * (K * K - 1) / a0, a2 = (1 - K / Q + K * K) / a0;
    var y = new Float32Array(canal.length), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < canal.length; i++) {
      var v = canal[i], s = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = s; y[i] = s;
    }
    return y;
  }

  /** Plage gardée après rognage : { debut, fin } (indices) ; silence retiré (fenêtres de 10 ms sous seuil dBFS), marge gardée. */
  function rognage(canal, taux, options) {
    var o = options || {}, seuil = Math.pow(10, (o.seuil === undefined ? -45 : o.seuil) / 20), marge = Math.round((o.marge === undefined ? 0.08 : o.marge) * taux);
    var pas = Math.max(1, Math.round(taux / 100)), premier = -1, dernier = -1;
    for (var debut = 0; debut < canal.length; debut += pas) {
      var m = 0;
      for (var i = debut; i < Math.min(canal.length, debut + pas); i++) { var a = Math.abs(canal[i]); if (a > m) m = a; }
      if (m >= seuil) { if (premier < 0) premier = debut; dernier = Math.min(canal.length, debut + pas); }
    }
    if (premier < 0) return { debut: 0, fin: Math.min(1, canal.length) };
    return { debut: Math.max(0, premier - marge), fin: Math.min(canal.length, dernier + marge) };
  }

  /** Silence retiré au début et à la fin, marge gardée. Jamais vide. */
  function rogner(canal, taux, options) {
    var r = rognage(canal, taux, options);
    return canal.length ? canal.slice(r.debut, r.fin) : new Float32Array(1);
  }

  /** Crête ramenée à cible dBFS (en place) ; un silence reste un silence. */
  function normaliserCrete(canal, cible) {
    var m = 0;
    for (var i = 0; i < canal.length; i++) { var a = Math.abs(canal[i]); if (a > m) m = a; }
    if (m > 0) { var g = Math.pow(10, (cible === undefined ? -3 : cible) / 20) / m; for (i = 0; i < canal.length; i++) canal[i] *= g; }
    return canal;
  }

  /** Prise brute -> prise prête : mono, passe-haut 80 Hz, silences rognés, crête à −3 dBFS ; decalage : secondes
   *  retirées au début (pour recaler des temps mesurés sur la prise brute). */
  function preparerPrise(son) {
    var filtre = passeHaut(mono(son.canaux), son.taux, 80);
    var r = rognage(filtre, son.taux);
    var x = normaliserCrete(filtre.length ? filtre.slice(r.debut, r.fin) : new Float32Array(1), -3);
    return { taux: son.taux, canaux: [x], decalage: r.debut / son.taux };
  }

  /** Durée (s) où l'on entend quelque chose : fenêtres de 20 ms dont le niveau efficace dépasse seuil (0,02 ≈ −34 dBFS).
   *  À mesurer sur la prise brute, avant sa normalisation (qui remonterait un souffle au niveau d'une voix).
   *  Une prise vide (silence, clic, souffle) en a moins de 0,3 s. */
  function dureeParole(son, seuil) {
    var s = seuil === undefined ? 0.02 : seuil;
    var x = passeHaut(mono(son.canaux), son.taux), n = Math.max(1, Math.round(0.02 * son.taux)), fenetres = 0;
    for (var i = 0; i + n <= x.length; i += n) {
      var e = 0;
      for (var k = i; k < i + n; k++) e += x[k] * x[k];
      if (Math.sqrt(e / n) > s) fenetres++;
    }
    return fenetres * n / son.taux;
  }

  return { ecrire: ecrire, lire: lire, base64: base64, mono: mono, passeHaut: passeHaut, rognage: rognage, rogner: rogner, normaliserCrete: normaliserCrete, preparerPrise: preparerPrise, dureeParole: dureeParole };
});
