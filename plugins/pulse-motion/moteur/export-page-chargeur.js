/* Pulse Motion – chargeur du bloc d'export de la page qui sait faire son MP4 (spec Retouches et ergonomie, 5.18).
 *
 * Inclus seulement dans une page demandée avec « page.boutonMp4: true » (scripts/lib/page-mp4.js), après le moteur. Rien ne
 * se charge avant le clic : le bouton « MP4 » s'ajoute au lecteur si le navigateur encode le H.264 (VideoEncoder) ; sinon la
 * page dit « Ouvrez cette page dans Chrome ou Edge pour obtenir le MP4 ». Au clic : le bloc « pm-module-export » (base64 du
 * gzip des modules) est décompressé par DecompressionStream, chaque module devient une URL blob: (imports « /_pm/… »
 * réécrits), puis moteur/export-page.mjs fait l'export dans le navigateur (mêmes modules que l'aperçu). Marche en file://.
 * Jamais sous l'aperçu (il a son propre bouton) ni dans une page ouverte pour la capture ou l'export.
 */
(function (racine) {
  'use strict';
  if (racine.__PM_APERCU__ || /[?&](capture|export|planche)=/.test(location.search)) return;
  var M = racine.M;
  var CONSEIL = 'Ouvrez cette page dans Chrome ou Edge pour obtenir le MP4';
  var TAILLES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };

  function encodeH264() {
    if (typeof racine.VideoEncoder === 'undefined' || !racine.VideoEncoder.isConfigSupported || typeof racine.DecompressionStream === 'undefined') return Promise.resolve(false);
    var t = TAILLES[(M.donnees && M.donnees.format && M.donnees.format.ratio) || '16:9'] || TAILLES['16:9'];
    return racine.VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: t[0], height: t[1], bitrate: 6e6 })
      .then(function (r) { return Boolean(r && r.supported); }, function () { return false; });
  }

  var modules = null;
  /** Modules du bloc, décompressés une fois ; -> Promise du module export-page.mjs. */
  function charger() {
    if (modules) return modules;
    modules = (async function () {
      var texte = document.getElementById('pm-module-export').textContent.trim();
      var brut = atob(texte);
      var octets = new Uint8Array(brut.length);
      for (var i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
      var flux = new Blob([octets]).stream().pipeThrough(new racine.DecompressionStream('gzip'));
      var codes = JSON.parse(await new Response(flux).text());
      var urls = {};
      Object.keys(codes).forEach(function (adresse) {
        var code = adresse.indexOf('/vendor/') >= 0 ? codes[adresse]
          : codes[adresse].replace(/(['"])(\/_pm\/[a-z0-9/.-]+)\1/g, function (m, q, a) { return urls[a] ? q + urls[a] + q : m; });
        urls[adresse] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      });
      await import(urls['/_pm/capture.js']);
      return import(urls['/_pm/export-page.mjs']);
    })();
    modules.catch(function () { modules = null; });
    return modules;
  }

  function poser(barre, ok) {
    if (!barre || document.getElementById('pm-bouton-export') || document.getElementById('pm-conseil-mp4')) return;
    if (!ok) {
      var conseil = document.createElement('span');
      conseil.id = 'pm-conseil-mp4';
      conseil.textContent = CONSEIL;
      conseil.style.cssText = 'font-size:12px;opacity:.7;white-space:nowrap';
      barre.appendChild(conseil);
      return;
    }
    var bouton = document.createElement('button');
    bouton.id = 'pm-bouton-export';
    bouton.type = 'button';
    bouton.textContent = 'MP4';
    bouton.title = 'Exporter en MP4';
    bouton.setAttribute('aria-label', 'Exporter en MP4');
    bouton.style.cssText = 'width:auto;padding:0 12px;border-radius:16px;font-weight:600';
    bouton.addEventListener('click', function (e) {
      e.stopPropagation();
      charger().then(function (m) { return m.lancerExportPage(); }, function (err) {
        // Bloc illisible : le dire, sans rien d'autre.
        racine.alert('Le MP4 ne peut pas être fait depuis cette page (' + (err && err.message ? err.message : err) + '). Demandez à Claude « exporte ma vidéo ».');
      });
    });
    barre.appendChild(bouton);
  }

  M.chargerExportPage = charger;
  var pret = M.pret && M.pret.then ? M.pret : Promise.resolve();
  pret.then(encodeH264).then(function (ok) {
    M.exportPagePossible = ok;
    var essais = 0;
    (function attendre() {
      var barre = document.getElementById('pm-lecteur');
      if (barre) poser(barre, ok);
      else if (essais++ < 50) setTimeout(attendre, 100);
    })();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
