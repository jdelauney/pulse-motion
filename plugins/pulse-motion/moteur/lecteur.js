/* Pulse Motion – lecteur : barre de lecture de la page (aperçu et page livrée).
 *
 * Espace : lecture/pause · ←/→ : une image · Maj+←/→ : scène précédente/suivante
 * B : boucle sur la scène courante · clic sur l'image : lecture/pause.
 * M.enLecture() : vrai pendant la lecture (composition des shaders : cadence des photographies).
 * M.boucler({ debut, fin } | null) : boucle de lecture posée par l'atelier des effets (fenêtre d'un effet).
 * Les champs du panneau de l'atelier (#pm-atelier) et du studio (#pm-studio) gardent le clavier.
 * Sous l'aperçu (window.__PM_APERCU__), écoute /_pm/evenements : rechargement à la
 * même position après une retouche, bandeau en cas d'erreur d'assemblage.
 * Son : mixage du moteur (M.rendreSon), préparé 1 s après le chargement (sauf en capture) ou au premier ▶,
 * joué par un AudioContext calé sur t.
 * Navigateur seulement ; dépend de horloge et audio (global M).
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
    // Son : tampon mixé par M.rendreSon, joué par un AudioContext créé au premier ▶ (geste de la personne).
    var son = { attendu: !!(M.aSon && M.aSon()), tampon: null, contexte: null, source: null, debutContexte: 0, debutT: 0, prepare: false, coupe: false };
    var lecture = false, dernier = 0, boucle = null;
    // Composition des shaders (P6) : photographies moins fréquentes pendant la lecture.
    M.enLecture = function () { return lecture; };

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

    function signaler(message) {
      bandeau.textContent = (bandeau.hidden || !bandeau.textContent ? '' : bandeau.textContent + ' · ') + message;
      bandeau.hidden = false;
    }
    function arreterSon() {
      if (!son.source) return;
      try { son.source.stop(); } catch (e) { /* déjà arrêtée */ }
      son.source.disconnect();
      son.source = null;
    }
    function lancerSon(t) {
      arreterSon();
      if (son.coupe) return;
      if (!son.tampon || !son.contexte || t >= son.tampon.duration - 0.05) return;
      if (son.contexte.state === 'suspended') son.contexte.resume();
      var s = son.contexte.createBufferSource();
      s.buffer = son.tampon;
      s.connect(son.contexte.destination);
      s.start(0, Math.max(0, t));
      son.source = s;
      son.debutContexte = son.contexte.currentTime;
      son.debutT = t;
    }
    function preparerSon() {
      if (!son.attendu || son.prepare) return;
      son.prepare = true;
      M.rendreSon().then(function (r) {
        son.tampon = r.buffer;
        son.attendu = !!r.buffer;
        r.avertissements.forEach(signaler);
        if (lecture) lancerSon(M.temps());
        afficher(M.temps());
      }, function () {
        son.attendu = false;
        signaler('Le son n\'a pas pu être préparé.');
      });
    }
    // Son coupé (studio : enregistrement au micro) : la lecture continue, sans son.
    M.couperSon = function (couper) {
      son.coupe = !!couper;
      if (son.coupe) arreterSon();
      else if (lecture) lancerSon(M.temps());
    };
    M.etatSon = function () {
      return { attendu: son.attendu, pret: !!son.tampon, enLecture: !!son.source, coupe: son.coupe, bloque: sonBloque(),
        position: son.source ? son.debutT + son.contexte.currentTime - son.debutContexte : null };
    };
    // Pas de préparation d'avance en capture, ni dans la page du contrôle (M.sansSon) : le rendu du son y prendrait le temps des mesures.
    // ni dans une page ouverte pour la capture (?capture=1), même lente à passer en mode capture.
    var pageCapture = /[?&]capture=1(&|$)/.test(location.search);
    setTimeout(function () { if (!(M.enCapture && M.enCapture()) && !M.sansSon && !pageCapture) preparerSon(); }, 1000);

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
      if (lecture && son.attendu && !son.tampon) etiquette.textContent += ' · son en préparation';
      else if (lecture && sonBloque()) etiquette.textContent += ' · son bloqué par le navigateur : cliquez pour l\'entendre';
      if (lecture && son.source) {
        var position = son.debutT + son.contexte.currentTime - son.debutContexte;
        if (Math.abs(position - t) > 0.05) lancerSon(t);
      }
    }
    M.surRendu(afficher);
    // Lecture relancée sans geste (rechargement après une retouche) : le navigateur garde le son suspendu
    // jusqu'au premier clic ou à la première touche, qui le reprend.
    function sonBloque() { return !!(son.source && son.contexte && son.contexte.state === 'suspended'); }
    // Le clic (ou la touche) qui débloque le son ne met pas aussi la vidéo en pause.
    var gesteDeblocage = false;
    function debloquer() {
      if (!son.contexte || son.contexte.state !== 'suspended') return;
      if (sonBloque()) {
        gesteDeblocage = true;
        setTimeout(function () { gesteDeblocage = false; }, 600);
      }
      son.contexte.resume().then(function () { if (lecture) lancerSon(M.temps()); afficher(M.temps()); });
    }
    document.addEventListener('pointerdown', debloquer, true);
    document.addEventListener('keydown', debloquer, true);

    function jouer() {
      if (M.temps() >= M.duree) M.rendre(0);
      lecture = true;
      bouton.textContent = '⏸';
      bouton.setAttribute('aria-label', 'Pause');
      if (son.attendu && !son.contexte && racine.AudioContext) son.contexte = new racine.AudioContext();
      preparerSon();
      lancerSon(M.temps());
      dernier = M.reel.now();
      M.reel.raf(boucler);
    }
    function pause() {
      lecture = false;
      bouton.textContent = '▶';
      bouton.setAttribute('aria-label', 'Lecture');
      arreterSon();
    }
    function basculer() {
      if (gesteDeblocage) { gesteDeblocage = false; return; }
      if (lecture) pause(); else jouer();
    }
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
      if (lecture) lancerSon(M.temps());
    }
    // Boucle posée par l'atelier des effets (fenêtre d'un effet) ; null la retire. La touche B reste la boucle de scène.
    M.boucler = function (plage) {
      boucle = plage && plage.fin > plage.debut ? { debut: plage.debut, fin: plage.fin } : null;
      afficher(M.temps());
    };

    bouton.addEventListener('click', basculer);
    document.getElementById('pm-scene').addEventListener('click', basculer);
    curseur.addEventListener('input', function () { aller(parseFloat(curseur.value)); });
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT' && e.key !== ' ') return;
      // Studio de voix et atelier des effets : leurs champs gardent le clavier.
      if (e.target && e.target.closest && e.target.closest('#pm-studio, #pm-atelier')) return;
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

    // Rechargement après une retouche, à la même position. Pendant un export (M.exportEnCours) ou une prise du studio,
    // il attend la fin (M.finExport, M.reprendreRechargement) pour ne pas l'interrompre.
    M.recharger = function () {
      try { sessionStorage.setItem(CLE_POSITION, JSON.stringify({ t: M.temps(), lecture: lecture })); } catch (e) { /* ignoré */ }
      location.reload();
    };
    // Page occupée : export en cours, studio de voix avec une prise pas encore gardée, ou atelier avec un réglage
    // pas encore enregistré.
    var rechargementEnAttente = false;
    function occupee() {
      return !!(M.exportEnCours || (M.studio && M.studio.occupe && M.studio.occupe()) || (M.atelier && M.atelier.occupe && M.atelier.occupe()));
    }
    M.rechargerQuandPossible = function () {
      if (occupee()) { rechargementEnAttente = true; return; }
      M.recharger();
    };
    /** Rechargement demandé pendant que la page était occupée : fait dès qu'elle ne l'est plus. */
    M.reprendreRechargement = function () {
      if (rechargementEnAttente && !occupee()) { rechargementEnAttente = false; M.recharger(); }
    };
    M.finExport = function () {
      M.exportEnCours = false;
      M.reprendreRechargement();
    };

    if (racine.__PM_APERCU__ && racine.EventSource) {
      var source = new EventSource('/_pm/evenements');
      source.addEventListener('recharger', function () { M.rechargerQuandPossible(); });
      source.addEventListener('erreur', function (ev) {
        var message = 'Erreur d\'assemblage';
        try { message = JSON.parse(ev.data).message; } catch (e) { /* ignoré */ }
        bandeau.textContent = message;
        bandeau.hidden = false;
      });
    }
    // Erreurs d'assemblage (transmises par l'aperçu) et de minutage : visibles tout de suite.
    // Les informations (gravité « info ») ne sont pas des erreurs : pas de bandeau pour elles.
    var erreurs = (racine.__PM_ERREURS__ || []).concat(M.erreurs || []).filter(function (e) { return e.gravite !== 'info'; });
    if (erreurs.length) {
      bandeau.textContent = erreurs.map(function (e) { return e.message; }).join(' · ');
      bandeau.hidden = false;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
