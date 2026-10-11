/* Pulse Motion – lecteur : barre de lecture de la page (aperçu et page livrée).
 *
 * Espace : lecture/pause · ←/→ : une image · Maj+←/→ : scène précédente/suivante
 * B : boucle sur la scène courante · clic sur l'image : lecture/pause.
 * Sous l'aperçu (window.__PM_APERCU__), écoute /_pm/evenements : rechargement à la
 * même position après une retouche, bandeau en cas d'erreur d'assemblage.
 * Navigateur seulement ; dépend de horloge (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var CLE_POSITION = 'pm-position';

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'texte') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }

  function horodatage(t) {
    var s = Math.floor(t);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  M.demarrerLecteur = function () {
    var ips = M.ips;
    var scenes = M.minutage.scenes;
    var musique = document.getElementById('pm-musique');
    var volume = M.donnees.musique && typeof M.donnees.musique.volume === 'number' ? M.donnees.musique.volume : 1;
    var lecture = false, dernier = 0, boucle = null;

    var barre = el('div', { id: 'pm-lecteur' }, document.body);
    var bouton = el('button', { type: 'button', 'aria-label': 'Lecture', texte: '▶' }, barre);
    var piste = el('div', { class: 'pm-piste' }, barre);
    var curseur = el('input', { type: 'range', min: '0', max: String(M.duree), step: String(1 / ips), value: '0', 'aria-label': 'Position' }, piste);
    var reperes = el('div', { class: 'pm-reperes' }, piste);
    scenes.forEach(function (s) {
      var r = el('span', { title: s.id }, reperes);
      r.style.left = (100 * s.debut / M.duree) + '%';
    });
    var etiquette = el('span', { class: 'pm-etiquette' }, barre);
    var bandeau = el('div', { id: 'pm-bandeau', hidden: '' }, document.body);

    function indexScene(t) {
      var i = 0;
      scenes.forEach(function (s, k) { if (t >= s.debut) i = k; });
      return i;
    }

    function afficher(t) {
      curseur.value = String(t);
      var i = indexScene(t);
      etiquette.textContent = 'Scène ' + (i + 1) + '/' + scenes.length + ' · ' + scenes[i].id + (boucle ? ' (boucle)' : '') +
        ' · ' + horodatage(t) + ' / ' + horodatage(M.duree);
      if (musique && lecture) {
        musique.volume = Math.max(0, Math.min(1, volume * Math.min(1, t / 0.5, (M.duree - t) / 1.5)));
        if (Math.abs(musique.currentTime - t) > 0.15) musique.currentTime = t;
      }
    }
    M.surRendu(afficher);

    function jouer() {
      if (M.temps() >= M.duree) M.rendre(0);
      lecture = true;
      bouton.textContent = '⏸';
      bouton.setAttribute('aria-label', 'Pause');
      if (musique) { musique.currentTime = M.temps(); musique.play().catch(function () {}); }
      dernier = M.reel.now();
      M.reel.raf(boucler);
    }
    function pause() {
      lecture = false;
      bouton.textContent = '▶';
      bouton.setAttribute('aria-label', 'Lecture');
      if (musique) musique.pause();
    }
    function basculer() { if (lecture) pause(); else jouer(); }
    function boucler() {
      if (!lecture) return;
      var maintenant = M.reel.now();
      var t = M.temps() + (maintenant - dernier) / 1000;
      dernier = maintenant;
      if (boucle && t >= boucle.fin) t = boucle.debut;
      if (t >= M.duree) { M.rendre(M.duree); pause(); return; }
      M.rendre(t);
      M.reel.raf(boucler);
    }
    function aller(t) {
      M.rendre(t);
      if (musique && lecture) musique.currentTime = M.temps();
    }

    bouton.addEventListener('click', basculer);
    document.getElementById('pm-scene').addEventListener('click', basculer);
    curseur.addEventListener('input', function () { aller(parseFloat(curseur.value)); });
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT' && e.key !== ' ') return;
      var i = indexScene(M.temps());
      if (e.key === ' ') { e.preventDefault(); basculer(); }
      else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); aller(scenes[Math.min(i + 1, scenes.length - 1)].debut); }
      else if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); aller(scenes[Math.max(i - 1, 0)].debut); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); aller(M.temps() + 1 / ips); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); aller(M.temps() - 1 / ips); }
      else if (e.key === 'b' || e.key === 'B') { boucle = boucle ? null : scenes[i]; afficher(M.temps()); }
    });

    // Position conservée au rechargement provoqué par l'aperçu.
    var sauvee = null;
    try { sauvee = JSON.parse(sessionStorage.getItem(CLE_POSITION) || 'null'); sessionStorage.removeItem(CLE_POSITION); } catch (e) { /* stockage indisponible */ }
    if (sauvee && typeof sauvee.t === 'number') { M.rendre(sauvee.t); if (sauvee.lecture) jouer(); }
    else afficher(M.temps());

    if (racine.__PM_APERCU__ && racine.EventSource) {
      var source = new EventSource('/_pm/evenements');
      source.addEventListener('recharger', function () {
        try { sessionStorage.setItem(CLE_POSITION, JSON.stringify({ t: M.temps(), lecture: lecture })); } catch (e) { /* ignoré */ }
        location.reload();
      });
      source.addEventListener('erreur', function (ev) {
        var message = 'Erreur d\'assemblage';
        try { message = JSON.parse(ev.data).message; } catch (e) { /* ignoré */ }
        bandeau.textContent = message;
        bandeau.hidden = false;
      });
    }
    // Erreurs d'assemblage (transmises par l'aperçu) et de minutage : visibles tout de suite.
    var erreurs = (racine.__PM_ERREURS__ || []).concat(M.erreurs || []);
    if (erreurs.length) {
      bandeau.textContent = erreurs.map(function (e) { return e.message; }).join(' · ');
      bandeau.hidden = false;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
