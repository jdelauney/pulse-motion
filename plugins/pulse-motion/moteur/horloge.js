/* Pulse Motion – horloge : l'état visible ne dépend que de t.
 *
 * M.demarrer()        lit #pm-donnees et les scènes, calcule le minutage, rend t = 0
 * M.rendre(t)         pose l'état de la page à l'instant t (synchrone)
 * M.pret             Promise résolue quand le temps SMIL a démarré (après « load »)
 * M.seek(t)           attend M.pret, rend t puis attend polices et images (Promise)
 * M.temps()           instant courant
 * M.chaqueImage(id, fn(p, tScene))   seul point d'entrée JavaScript d'une scène
 * M.surRendu(fn(t))   prévenu après chaque rendu (lecteur, export)
 * M.rendreScene(id, t) pose l'état d'une seule scène (mesures des calques de particules)
 * M.surSeek(fn(t))    M.seek attend la promesse renvoyée (calques de particules)
 * M.modeCapture(bool) Date.now et performance.now suivent t (export)
 * M.enCapture()      vrai entre M.modeCapture(true) et M.modeCapture(false)
 *
 * Aléa reproductible et horloge virtuelle : idée et algorithme mulberry32 repris de
 * showtime (skills/showtime/runtime/stage.js), licence MIT.
 * Navigateur seulement ; dépend de courbes, minutage, transitions, tween (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var EPOCH = 1767225600000; // 2026-01-01T00:00:00Z : Date.now() à t = 0 en capture

  var reel = {
    now: racine.performance.now.bind(racine.performance),
    dateNow: Date.now,
    raf: racine.requestAnimationFrame.bind(racine),
  };
  M.reel = reel;

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Math.random = mulberry32(0x5eed1234);

  var etat = { t: 0, scenes: [], rappels: {}, auditeurs: [], attentes: [], capture: false };

  // Le temps SMIL ne démarre qu'une tâche après « load » : on rend à nouveau à ce moment-là.
  M.pret = new Promise(function (resolve) {
    function apresChargement() { setTimeout(function () { if (M.minutage) M.rendre(etat.t); resolve(); }, 0); }
    if (document.readyState === 'complete') apresChargement();
    else racine.addEventListener('load', apresChargement);
  });

  function arrondi(x) { return Math.round(x * 10000) / 10000; }

  function lireElements(section) {
    var liste = [];
    var n = 0;
    // Un effet de particules est minuté même sans data-start (comme dans scripts/lib/extraire.js).
    section.querySelectorAll('[data-start],[data-dur],[data-tween],[data-effet]').forEach(function (el) {
      var cle = el.id || ('_' + (++n));
      el.setAttribute('data-pm-cle', cle);
      liste.push({ cle: cle, start: el.getAttribute('data-start'), dur: el.getAttribute('data-dur'), el: el });
    });
    return liste;
  }

  M.demarrer = function () {
    var donnees = JSON.parse(document.getElementById('pm-donnees').textContent);
    M.donnees = donnees;
    M.ips = (donnees.format && donnees.format.ips) || 30;
    var erreurs = [];
    var sections = {};
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) { sections[s.getAttribute('data-scene')] = s; });

    var elementsParScene = {};
    donnees.scenes.forEach(function (sc) {
      elementsParScene[sc.id] = sections[sc.id] ? lireElements(sections[sc.id]) : [];
    });
    M.dureeTemps = donnees.tempo && donnees.tempo.bpm > 0 ? 60 / donnees.tempo.bpm : null;
    var min = M.calculerMinutage(donnees.scenes, elementsParScene, { dureeTemps: M.dureeTemps });
    M.minutage = min;
    M.duree = min.duree;

    etat.scenes = min.scenes.map(function (info, index) {
      var sec = sections[info.id];
      var elements = elementsParScene[info.id].map(function (e) {
        var tweens = [];
        var attr = e.el.getAttribute('data-tween');
        if (attr) {
          try { tweens = M.analyserTween(attr); } catch (err) {
            erreurs.push({ regle: 'tween-invalide', scene: info.id, element: e.cle, message: 'Scène « ' + info.id + ' », élément « ' + e.cle + ' » : ' + err.message });
          }
        }
        var temps = min.elements[info.id][e.cle];
        return { el: e.el, debut: temps.debut, fin: temps.fin, tweens: tweens };
      });
      var debuts = new Map();
      elements.forEach(function (e) { debuts.set(e.el, e.debut); });
      return {
        info: info,
        index: index,
        sec: sec,
        elements: elements,
        debuts: debuts,
        svgs: sec ? Array.prototype.slice.call(sec.querySelectorAll('svg')) : [],
      };
    });
    M.erreurs = min.erreurs.concat(erreurs);
    M.erreurs.forEach(function (e) { console.warn('[Pulse Motion] ' + e.message); });
    M.rendre(0);
    document.documentElement.setAttribute('data-pm-pret', '');
  };

  function rendreScene(s, t) {
    var info = s.info;
    // Aléa propre à la scène : ne dépend que de t et de la scène, pas du chemin pour arriver à t.
    Math.random = mulberry32((0x5eed1234 ^ Math.imul(Math.round(t * M.ips) + 1, 0x9e3779b1) ^ Math.imul(s.index + 1, 0x85ebca6b)) >>> 0);
    // Transition d'entrée : chevauchement, ou entrée depuis le fond pour la première scène.
    var dureeEntree = info.entree > 0 ? info.entree : (s.index === 0 ? M.CHEVAUCHEMENT : 0);
    var q = dureeEntree > 0 ? (t - info.debut) / dureeEntree : 1;
    var st = M.styleTransition(info.transition, q);
    s.sec.style.opacity = st.opacity;
    s.sec.style.transform = st.transform;
    s.sec.style.clipPath = st.clipPath;

    s.elements.forEach(function (e) {
      var p = M.progression(t, e.debut, e.fin);
      e.el.style.setProperty('--p', String(arrondi(p)));
      e.el.setAttribute('data-etat', M.etat(t, e.debut, e.fin));
      e.tweens.forEach(function (c) {
        if (c.prop === 'nombre') e.el.textContent = M.texteTween(c, p);
        else e.el.style.setProperty(c.prop, M.texteTween(c, p));
      });
    });

    // Animations CSS et WAAPI : en pause, positionnées depuis le début de l'élément minuté porteur.
    s.sec.getAnimations({ subtree: true }).forEach(function (a) {
      a.pause();
      var base = info.debut;
      var cible = a.effect && a.effect.target;
      while (cible && cible !== s.sec) {
        if (s.debuts.has(cible)) { base = s.debuts.get(cible); break; }
        cible = cible.parentElement;
      }
      a.currentTime = Math.max(0, (t - base) * info.rythme * 1000);
    });

    // SMIL : temps de la scène.
    s.svgs.forEach(function (svg) {
      if (svg.pauseAnimations) {
        svg.pauseAnimations();
        svg.setCurrentTime(Math.max(0, (t - info.debut) * info.rythme));
      }
    });

    (etat.rappels[info.id] || []).forEach(function (fn) {
      try { fn(M.progression(t, info.debut, info.fin), Math.max(0, (t - info.debut) * info.rythme)); } catch (err) {
        console.error('[Pulse Motion] Scène « ' + info.id + ' » : erreur dans M.chaqueImage : ' + err.message);
      }
    });
  }

  M.rendre = function (t) {
    if (!M.minutage) throw new Error('M.demarrer() doit être appelé avant M.rendre().');
    t = Math.max(0, Math.min(M.duree, Number(t) || 0));
    etat.t = t;
    // Aléa ré-amorcé par image : la même image quel que soit le chemin pour arriver à t.
    Math.random = mulberry32((0x5eed1234 ^ Math.imul(Math.round(t * M.ips) + 1, 0x9e3779b1)) >>> 0);
    var visibles = M.scenesVisibles(M.minutage, t);
    // Toutes les scènes sont rendues (l'état d'une scène masquée reste juste) ; seules les visibles s'affichent.
    etat.scenes.forEach(function (s) {
      if (!s.sec) return;
      var affichage = visibles.indexOf(s.info.id) < 0 ? 'none' : '';
      if (s.sec.style.display !== affichage) s.sec.style.display = affichage;
      rendreScene(s, t);
    });
    etat.auditeurs.forEach(function (fn) { fn(t); });
    return t;
  };

  M.seek = function (t) {
    return M.pret.then(function () {
      M.rendre(t);
      var attentes = [document.fonts ? document.fonts.ready : Promise.resolve()];
      document.querySelectorAll('#pm-scene img').forEach(function (img) {
        if (!img.complete) attentes.push(img.decode().catch(function () {}));
      });
      etat.attentes.forEach(function (fn) { attentes.push(Promise.resolve(fn(etat.t))); });
      return Promise.all(attentes);
    }).then(function () { return etat.t; });
  };

  M.temps = function () { return etat.t; };
  M.chaqueImage = function (idScene, fn) { (etat.rappels[idScene] = etat.rappels[idScene] || []).push(fn); };
  M.surRendu = function (fn) { etat.auditeurs.push(fn); };
  M.surSeek = function (fn) { etat.attentes.push(fn); };
  M.rendreScene = function (idScene, t) {
    for (var i = 0; i < etat.scenes.length; i++) {
      var s = etat.scenes[i];
      if (s.info.id === idScene && s.sec) { rendreScene(s, Math.max(0, Math.min(M.duree, Number(t) || 0))); return; }
    }
  };

  M.enCapture = function () { return etat.capture; };
  M.modeCapture = function (actif) {
    etat.capture = !!actif;
    if (actif) {
      racine.performance.now = function () { return etat.t * 1000; };
      Date.now = function () { return EPOCH + Math.round(etat.t * 1000); };
    } else {
      racine.performance.now = reel.now;
      Date.now = reel.dateNow;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
