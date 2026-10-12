/* Pulse Motion – WAV PCM : écriture 16 bits, lecture 16 bits ou flottant 32 bits, base64.
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

  return { ecrire: ecrire, lire: lire, base64: base64 };
});
