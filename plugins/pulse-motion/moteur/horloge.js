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
 * M.enCapture()      vrai entre M.modeCapture(true) et M.modeCapture(false) (classe pm-capture sur <html>)
 * M.typeTransition(info) transition CSS d'une scène (une transition par shader : « aucune » si prête, sinon « fondu »)
 *
 * Aléa reproductible et horloge virtuelle : idée et algorithme mulberry32 repris de
 * showtime (skills/showtime/runtime/stage.js), licence MIT.
 * Caméra (data-camera, data-profondeur) et temps figé ou accéléré (data-gel, data-vitesse) : chaque
 * élément voit le temps de ses conteneurs ; une caméra voit celui de ses ancêtres, pas le sien.
 * Navigateur seulement ; dépend de courbes, minutage, transitions, tween, lettres, camera, temps (global M).
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

  /** Plages de temps des conteneurs de el (de l'extérieur vers l'intérieur), jusqu'à la section. */
  function chaineTemps(el, sec, plagesParEl) {
    var liste = [];
    while (el) {
      if (plagesParEl.has(el)) liste.unshift(plagesParEl.get(el));
      if (el === sec) break;
      el = el.parentElement;
    }
    return liste;
  }

  /** Instant absolu vu à travers une chaîne de plages (gel, vitesse), au temps t. */
  function tempsVu(chaine, t, info) {
    if (!chaine.length) return t;
    var tau = (t - info.debut) * info.rythme;
    for (var i = 0; i < chaine.length; i++) tau = M.appliquerTemps(chaine[i], tau);
    return info.debut + tau / info.rythme;
  }

  /** Conteneurs de temps, caméras et plans de parallaxe d'une section ; les erreurs vont dans erreurs. */
  function lireMiseEnScene(sec, idScene, erreurs) {
    var plagesParEl = new Map();
    var cameras = [];
    if (!sec) return { plagesParEl: plagesParEl, cameras: cameras };
    function signaler(regle, message) { erreurs.push({ regle: regle, scene: idScene, message: 'Scène « ' + idScene + ' » : ' + message }); }
    // La section elle-même peut porter un gel ou une vitesse (toute la scène), pas une caméra.
    var conteneurs = Array.prototype.slice.call(sec.querySelectorAll('[data-gel],[data-vitesse]'));
    if (sec.matches('[data-gel],[data-vitesse]')) conteneurs.unshift(sec);
    if (sec.hasAttribute('data-camera')) signaler('camera-invalide', 'data-camera se pose sur un conteneur à l\'intérieur de la scène, pas sur la <section> (dont les transitions déplacent déjà l\'image).');
    conteneurs.forEach(function (el) {
      try { plagesParEl.set(el, M.analyserTemps(el.getAttribute('data-gel'), el.getAttribute('data-vitesse'), M.dureeTemps)); } catch (err) { signaler('temps-invalide', err.message); }
    });
    sec.querySelectorAll('[data-camera]').forEach(function (el) {
      var clauses = [];
      try { clauses = M.analyserCamera(el.getAttribute('data-camera'), M.dureeTemps); } catch (err) { signaler('camera-invalide', err.message); }
      cameras.push({ el: el, clauses: clauses, chaine: chaineTemps(el.parentElement, sec, plagesParEl) });
    });
    sec.querySelectorAll('[data-profondeur]').forEach(function (el) {
      var valeur = el.getAttribute('data-profondeur');
      if (/^\d*\.?\d+$/.test(valeur)) el.style.setProperty('--pm-profondeur', valeur);
      else signaler('profondeur-invalide', 'data-profondeur « ' + valeur + ' » doit être un nombre (1 : suit la caméra, 0 : plan fixe, 0.3 : plan lointain).');
    });
    return { plagesParEl: plagesParEl, cameras: cameras };
  }

  function lireElements(section) {
    var liste = [];
    var n = 0;
    // Un effet de particules, un milieu (data-milieu) ou un shader (data-shader) est minuté même sans data-start (comme dans
    // scripts/lib/extraire.js).
    section.querySelectorAll('[data-start],[data-dur],[data-tween],[data-effet],[data-milieu],[data-son],[data-shader]').forEach(function (el) {
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

    M.dureeTemps = donnees.tempo && donnees.tempo.bpm > 0 ? 60 / donnees.tempo.bpm : null;
    // Texte lettre par lettre : découpé avant de relever les animations.
    donnees.scenes.forEach(function (sc) {
      if (sections[sc.id] && M.decouper) erreurs.push.apply(erreurs, M.decouper(sections[sc.id], sc.id, M.dureeTemps));
    });
    var elementsParScene = {};
    donnees.scenes.forEach(function (sc) {
      elementsParScene[sc.id] = sections[sc.id] ? lireElements(sections[sc.id]) : [];
    });
    var min = M.calculerMinutage(donnees.scenes, elementsParScene, { dureeTemps: M.dureeTemps, decalageTemps: (donnees.tempo && donnees.tempo.decalage) || 0, grilleFixe: !!(donnees.tempo && donnees.tempo.grille) });
    M.minutage = min;
    M.duree = min.duree;

    etat.scenes = min.scenes.map(function (info, index) {
      var sec = sections[info.id];
      var scene = lireMiseEnScene(sec, info.id, erreurs);
      var elements = elementsParScene[info.id].map(function (e) {
        var tweens = [];
        var attr = e.el.getAttribute('data-tween');
        if (attr) {
          try { tweens = M.analyserTween(attr); } catch (err) {
            erreurs.push({ regle: 'tween-invalide', scene: info.id, element: e.cle, message: 'Scène « ' + info.id + ' », élément « ' + e.cle + ' » : ' + err.message });
          }
        }
        var temps = min.elements[info.id][e.cle];
        return { el: e.el, debut: temps.debut, fin: temps.fin, tweens: tweens, chaine: chaineTemps(e.el, sec, scene.plagesParEl) };
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
        cameras: scene.cameras,
        chaine: function (el) {
          if (!scene.plagesParEl.size) return [];
          if (!this.chaines.has(el)) this.chaines.set(el, chaineTemps(el, sec, scene.plagesParEl));
          return this.chaines.get(el);
        },
        chaines: new Map(),
      };
    });
    M.erreurs = min.erreurs.concat(erreurs);
    M.erreurs.forEach(function (e) { console.warn('[Pulse Motion] ' + e.message); });
    M.rendre(0);
    document.documentElement.setAttribute('data-pm-pret', '');
  };

  /** Transition CSS d'une scène : celle du déroulé ; une transition par shader prête (calques, M.transitionShader) n'en a
   *  pas, sinon repli en fondu (GPU pas encore prêt, absent, ou shader qui ne compile pas). */
  function typeTransition(info) {
    var tr = info.transition;
    if (!tr || typeof tr === 'string') return tr;
    return M.transitionShader && M.transitionShader(info.id) ? 'aucune' : 'fondu';
  }
  M.typeTransition = typeTransition;

  function rendreScene(s, t) {
    var info = s.info;
    // Aléa propre à la scène : ne dépend que de t et de la scène, pas du chemin pour arriver à t.
    Math.random = mulberry32((0x5eed1234 ^ Math.imul(Math.round(t * M.ips) + 1, 0x9e3779b1) ^ Math.imul(s.index + 1, 0x85ebca6b)) >>> 0);
    // Transition d'entrée : chevauchement, ou entrée depuis le fond pour la première scène.
    var dureeEntree = info.entree > 0 ? info.entree : (s.index === 0 ? (info.dureeTransition || 0) : 0);
    var q = dureeEntree > 0 ? (t - info.debut) / dureeEntree : 1;
    var st = M.styleTransition(typeTransition(info), q);
    s.sec.style.opacity = st.opacity;
    s.sec.style.transform = st.transform;
    s.sec.style.clipPath = st.clipPath;

    s.elements.forEach(function (e) {
      var te = tempsVu(e.chaine, t, info);
      var p = M.progression(te, e.debut, e.fin);
      e.el.style.setProperty('--p', String(arrondi(p)));
      e.el.setAttribute('data-etat', M.etat(te, e.debut, e.fin));
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
      var te = cible ? tempsVu(s.chaine(cible), t, info) : t;
      while (cible && cible !== s.sec) {
        if (s.debuts.has(cible)) { base = s.debuts.get(cible); break; }
        cible = cible.parentElement;
      }
      a.currentTime = Math.max(0, (te - base) * info.rythme * 1000);
    });

    // SMIL : temps de la scène.
    s.svgs.forEach(function (svg) {
      if (svg.pauseAnimations) {
        svg.pauseAnimations();
        svg.setCurrentTime(Math.max(0, (tempsVu(s.chaine(svg), t, info) - info.debut) * info.rythme));
      }
    });

    // Caméras : cadrage au temps de leurs conteneurs ; --pm-cam-dx/dy pour la parallaxe (data-profondeur).
    s.cameras.forEach(function (c) {
      var st = M.styleCamera(M.etatCamera(c.clauses, (tempsVu(c.chaine, t, info) - info.debut) * info.rythme));
      c.el.style.transform = st.transform;
      c.el.style.filter = st.filter;
      c.el.style.setProperty('--pm-cam-dx', String(st.dx));
      c.el.style.setProperty('--pm-cam-dy', String(st.dy));
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
  /** Instant vu par un élément à travers les arrêts sur image et accélérés (data-gel, data-vitesse) de ses conteneurs. */
  M.tempsVuPar = function (el, t) {
    for (var i = 0; i < etat.scenes.length; i++) {
      var s = etat.scenes[i];
      if (s.sec && s.sec.contains(el)) return tempsVu(s.chaine(el), t, s.info);
    }
    return t;
  };
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
    // Classe pm-capture : ce qui n'est destiné qu'à l'aperçu (alertes sur les effets) est masqué dans les images.
    if (racine.document && document.documentElement) document.documentElement.classList.toggle('pm-capture', etat.capture);
    if (actif) {
      racine.performance.now = function () { return etat.t * 1000; };
      Date.now = function () { return EPOCH + Math.round(etat.t * 1000); };
    } else {
      racine.performance.now = reel.now;
      Date.now = reel.dateNow;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
