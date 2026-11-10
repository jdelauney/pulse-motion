/* Pulse Motion – horloge : l'état visible ne dépend que de t.
 *
 * M.demarrer()        lit #pm-donnees et les scènes, calcule le minutage, rend t = 0
 * M.rendre(t)         pose l'état de la page à l'instant t (synchrone)
 * M.pret             Promise résolue quand le temps SMIL a démarré (après « load »)
 * M.seek(t)           attend M.pret, rend t puis attend polices et images (Promise) : images non chargées, <img> dont la
 *                     source a changé, images des scènes qui viennent de s'afficher, <image> SVG (3 passes au plus)
 * M.tenirAJour(id, actif?) la scène est rendue à chaque image même masquée (M.rendre ne rend que les scènes visibles)
 * M.temps()           instant courant
 * M.chaqueImage(id, fn(p, tScene))   seul point d'entrée JavaScript d'une scène
 * M.surRendu(fn(t))   prévenu après chaque rendu (lecteur, export)
 * M.rendreScene(id, t) pose l'état d'une seule scène (mesures des calques de particules)
 * M.surSeek(fn(t))    M.seek attend la promesse renvoyée (calques de particules)
 * M.modeCapture(bool) Date.now et performance.now suivent t (export)
 * M.enCapture()      vrai entre M.modeCapture(true) et M.modeCapture(false) (classe pm-capture sur <html>)
 * M.typeTransition(info) transition CSS d'une scène (une transition par shader : « aucune » si prête, sinon « fondu »)
 * M.reglagesRendu     { paresseux, differentiel } (vrais) : rendu des seules scènes visibles, écritures des seules valeurs
 *                     changées ; faux pour comparer les images (tests)
 *
 * Rendu allégé (spec Rapidité 5.20) : une scène masquée n'est pas rendue (aucun module ne lit l'état d'une scène masquée :
 * les calques de particules et les mesures rendent eux-mêmes la scène qu'ils mesurent, par M.rendreScene) ; une scène qui
 * redevient visible est rendue à t avant d'être affichée. Les styles, --p, data-etat, propriétés des tweens, textes des
 * nombres et currentTime des animations ne s'écrivent que si la valeur a changé depuis la dernière écriture sur cet élément
 * (cache vidé à chaque M.demarrer). Idée de reanimate (put() avec cache), réécrite.
 * Polices : toutes celles de la page sont chargées avant M.pret (une police n'est sinon chargée qu'à son premier usage, et
 * une capture pouvait précéder son arrivée).
 *
 * Aléa reproductible et horloge virtuelle : idée et algorithme mulberry32 repris de
 * showtime (skills/showtime/runtime/stage.js), licence MIT.
 * Boucles de vie (classes pm-v-*, spec Mouvement vivant 5.9) : à M.demarrer, chaque élément qui en porte une reçoit en
 * ligne sa fenêtre (--pm-fenetre, s de la scène : durée de son porteur minuté, lui-même ou l'ancêtre minuté le plus
 * proche ; la scène sans porteur), sa phase (--pm-v-phase, graine du rang parmi les éléments de même classe de la scène) et
 * ses cycles (--pm-v-fois, --pm-v-fois-2 : par animation pm-v-*, M.cyclesVie). Les classes lisent d'abord --pm-phase et
 * --pm-fois : ce que la scène écrit l'emporte. Calcul fait une fois, sans t : la même image quel que soit l'ordre de rendu.
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

  var etat = { t: 0, scenes: [], rappels: {}, auditeurs: [], attentes: [], capture: false, tenues: {}, ecrits: new WeakMap(), decodees: new WeakMap(), visibles: [], avertiImages: false };
  M.reglagesRendu = { paresseux: true, differentiel: true };

  /** Toutes les polices déclarées par la page, chargées (une police n'est sinon chargée qu'à son premier usage). */
  function chargerPolices() {
    if (!document.fonts || typeof document.fonts.forEach !== 'function') return Promise.resolve();
    var attentes = [];
    document.fonts.forEach(function (f) { if (f.status === 'unloaded') attentes.push(f.load().catch(function () {})); });
    return Promise.all(attentes).then(function () { return document.fonts.ready; });
  }

  // Écritures différentielles : dernière valeur écrite, par élément et par propriété.
  function cacheDe(el) {
    var c = etat.ecrits.get(el);
    if (!c) { c = {}; etat.ecrits.set(el, c); }
    return c;
  }
  function changee(el, cle, valeur) {
    if (!M.reglagesRendu.differentiel) return true;
    var c = cacheDe(el);
    if (c[cle] === valeur) return false;
    c[cle] = valeur;
    return true;
  }
  function ecrireStyle(el, prop, valeur) {
    if (changee(el, 's:' + prop, valeur)) el.style[prop] = valeur;
  }
  function ecrirePropriete(el, prop, valeur) {
    if (changee(el, 'p:' + prop, valeur)) el.style.setProperty(prop, valeur);
  }

  // Le temps SMIL ne démarre qu'une tâche après « load » : on rend à nouveau à ce moment-là.
  M.pret = new Promise(function (resolve) {
    function apresChargement() { setTimeout(function () { if (M.minutage) M.rendre(etat.t); chargerPolices().then(resolve, resolve); }, 0); }
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

  /** Bornes des boucles de vie d'une scène (voir l'en-tête) : styles lus par getComputedStyle, valables même dans une
   *  scène masquée. */
  function bornerVie(s) {
    if (!s.sec || !M.cyclesVie) return;
    var liste = s.sec.querySelectorAll('[class*="pm-v-"]');
    if (!liste.length) return;
    var info = s.info, rythme = info.rythme || 1;
    var porteurs = new Map();
    s.elements.forEach(function (e) { porteurs.set(e.el, e); });
    var rangs = {};
    Array.prototype.forEach.call(liste, function (el) {
      var classe = null;
      for (var i = 0; i < el.classList.length && !classe; i++) if (el.classList[i].indexOf('pm-v-') === 0) classe = el.classList[i];
      if (!classe) return;
      rangs[classe] = rangs[classe] === undefined ? 0 : rangs[classe] + 1;
      var porteur = null;
      for (var c = el; c && !porteur; c = c === s.sec ? null : c.parentElement) if (porteurs.has(c)) porteur = porteurs.get(c);
      var W = porteur ? (porteur.fin - porteur.debut) * rythme : (info.fin - info.debut) * rythme;
      el.style.setProperty('--pm-fenetre', String(arrondi(W)));
      el.style.setProperty('--pm-v-phase', String(arrondi(M.phaseVie(rangs[classe], info.id, classe))));
      var cs = racine.getComputedStyle(el);
      var noms = String(cs.animationName || '').split(','), durees = String(cs.animationDuration || '').split(',');
      var continue_ = String(cs.getPropertyValue('--pm-boucle') || '').trim() === 'continue';
      noms.forEach(function (nom, k) {
        if (k > 1 || String(nom).trim().indexOf('pm-v-') !== 0) return;
        var d = String(durees[k % durees.length] || '').trim();
        var P = /ms$/.test(d) ? parseFloat(d) / 1000 : parseFloat(d);
        el.style.setProperty(k === 0 ? '--pm-v-fois' : '--pm-v-fois-2', String(M.cyclesVie(W, P, continue_)));
      });
    });
  }

  M.demarrer = function () {
    var donnees = JSON.parse(document.getElementById('pm-donnees').textContent);
    M.donnees = donnees;
    M.ips = (donnees.format && donnees.format.ips) || 30;
    var erreurs = [];
    var sections = {};
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) { sections[s.getAttribute('data-scene')] = s; });

    M.dureeTemps = donnees.tempo && donnees.tempo.bpm > 0 ? 60 / donnees.tempo.bpm : null;
    etat.ecrits = new WeakMap();
    etat.decodees = new WeakMap();
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
    etat.scenes.forEach(bornerVie);
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
    // Sortie : pendant l'entrée de la scène suivante, certaines transitions (poussée, traversée) font aussi bouger celle-ci ;
    // hors de cette plage, son style de sortie est vide (rien ne reste collé après la transition).
    var suivante = etat.scenes[s.index + 1];
    var sortie = null;
    if (suivante && suivante.info.entree > 0) {
      var qs = (t - suivante.info.debut) / suivante.info.entree;
      if (qs > 0 && qs < 1) sortie = M.styleSortie(typeTransition(suivante.info), qs);
    }
    ecrireStyle(s.sec, 'opacity', sortie && sortie.opacity ? sortie.opacity : st.opacity);
    ecrireStyle(s.sec, 'transform', sortie && sortie.transform ? sortie.transform : st.transform);
    ecrireStyle(s.sec, 'clipPath', st.clipPath);
    ecrireStyle(s.sec, 'filter', sortie && sortie.filter ? sortie.filter : st.filter);

    s.elements.forEach(function (e) {
      var te = tempsVu(e.chaine, t, info);
      var p = M.progression(te, e.debut, e.fin);
      ecrirePropriete(e.el, '--p', String(arrondi(p)));
      var etatEl = M.etat(te, e.debut, e.fin);
      if (changee(e.el, 'a:data-etat', etatEl)) e.el.setAttribute('data-etat', etatEl);
      e.tweens.forEach(function (c) {
        var v = M.texteTween(c, p);
        if (c.prop === 'nombre') { if (changee(e.el, 't:nombre', v)) e.el.textContent = v; }
        else ecrirePropriete(e.el, c.prop, v);
      });
    });

    // Animations CSS et WAAPI : en pause, positionnées depuis le début de l'élément minuté porteur. Celles déjà vues sont
    // gardées : une animation en pause après sa fin (sans fill) n'est plus rendue par getAnimations ; sans elles, revenir
    // en arrière dans une scène restée affichée la laisserait à sa fin (l'état visible ne dépendrait plus seulement de t).
    // Une animation annulée (scène masquée, règle CSS changée) est oubliée.
    var vues = s.animations || (s.animations = new Set());
    s.sec.getAnimations({ subtree: true }).forEach(function (a) { vues.add(a); });
    vues.forEach(function (a) {
      if (a.playState === 'idle' || !a.effect || !a.effect.target || !a.effect.target.isConnected) { vues.delete(a); return; }
      if (a.playState !== 'paused' || !M.reglagesRendu.differentiel) a.pause();
      var base = info.debut;
      var cible = a.effect && a.effect.target;
      var te = cible ? tempsVu(s.chaine(cible), t, info) : t;
      while (cible && cible !== s.sec) {
        if (s.debuts.has(cible)) { base = s.debuts.get(cible); break; }
        cible = cible.parentElement;
      }
      var instant = Math.max(0, (te - base) * info.rythme * 1000);
      if (!M.reglagesRendu.differentiel || a.__pmInstant !== instant || a.currentTime !== instant) { a.currentTime = instant; a.__pmInstant = instant; }
    });

    // Texte brouillé (data-lettres="brouille") : les lettres changent à chaque image, calées comme les animations.
    if (M.brouiller) {
      if (!s.brouilles) s.brouilles = Array.prototype.slice.call(s.sec.querySelectorAll('[data-lettres="brouille"]'));
      s.brouilles.forEach(function (el) {
        var base = info.debut;
        for (var c = el; c && c !== s.sec; c = c.parentElement) {
          if (s.debuts.has(c)) { base = s.debuts.get(c); break; }
        }
        M.brouiller(el, (tempsVu(s.chaine(el), t, info) - base) * info.rythme);
      });
    }

    // SMIL : temps de la scène.
    s.svgs.forEach(function (svg) {
      if (svg.pauseAnimations) {
        svg.pauseAnimations();
        svg.setCurrentTime(Math.max(0, (tempsVu(s.chaine(svg), t, info) - info.debut) * info.rythme));
      }
    });

    // Calque de dessin (spec S7, 5.2 ; moteur/dessin/calque.js) : après les éléments, avant les caméras, au temps vu par
    // son conteneur.
    if (M.dessinerScene) M.dessinerScene(info, t, function (el) { return tempsVu(s.chaine(el), t, info); });

    // Caméras : cadrage au temps de leurs conteneurs ; --pm-cam-dx/dy pour la parallaxe (data-profondeur).
    s.cameras.forEach(function (c) {
      var st = M.styleCamera(M.etatCamera(c.clauses, (tempsVu(c.chaine, t, info) - info.debut) * info.rythme));
      ecrireStyle(c.el, 'transform', st.transform);
      ecrireStyle(c.el, 'filter', st.filter);
      ecrirePropriete(c.el, '--pm-cam-dx', String(st.dx));
      ecrirePropriete(c.el, '--pm-cam-dy', String(st.dy));
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
    etat.visibles = visibles;
    // Seules les scènes visibles sont rendues (et celles que M.tenirAJour garde à jour) ; une scène qui redevient visible
    // est rendue à t dans cette même image, avant d'être affichée.
    var derniere = null;
    etat.scenes.forEach(function (s) {
      if (!s.sec) return;
      var visible = visibles.indexOf(s.info.id) >= 0;
      var affichage = visible ? '' : 'none';
      if (s.sec.style.display !== affichage) s.sec.style.display = affichage;
      derniere = s;
      if (visible || etat.tenues[s.info.id] || !M.reglagesRendu.paresseux) { rendreScene(s, t); derniere = null; }
    });
    // Aléa des auditeurs : celui qu'aurait laissé le rendu de la dernière scène (quand elle est rendue, c'est le sien).
    if (derniere) Math.random = mulberry32((0x5eed1234 ^ Math.imul(Math.round(t * M.ips) + 1, 0x9e3779b1) ^ Math.imul(derniere.index + 1, 0x85ebca6b)) >>> 0);
    etat.auditeurs.forEach(function (fn) { fn(t); });
    return t;
  };

  function rien() {}

  /** Images à attendre avant une capture (spec Rapidité 5.21) : <img> pas encore chargée ; <img> ou <image> SVG d'une scène
   *  visible dont la source a changé, ou qui vient de s'afficher (son décodage n'est pas garanti tant qu'elle était masquée).
   *  Une image décodée pendant qu'elle est visible n'est plus attendue ; masquée, elle le sera de nouveau. */
  function imagesEnAttente() {
    var attentes = [];
    if (document.fonts && document.fonts.status === 'loading') attentes.push(document.fonts.ready);
    etat.scenes.forEach(function (s) {
      if (!s.sec) return;
      var visible = etat.visibles.indexOf(s.info.id) >= 0;
      s.sec.querySelectorAll('img, image').forEach(function (img) {
        var svg = img.tagName.toLowerCase() === 'image';
        var source = svg ? (img.getAttribute('href') || img.getAttribute('xlink:href') || '') : (img.currentSrc || img.src || '');
        if (!visible) { etat.decodees.delete(img); if (!svg && !img.complete) attentes.push(img.decode().catch(rien)); return; }
        if (!svg && !img.complete) { etat.decodees.set(img, source); attentes.push(img.decode().catch(rien)); return; }
        if (etat.decodees.get(img) === source) return;
        etat.decodees.set(img, source);
        if (source && typeof img.decode === 'function') attentes.push(img.decode().catch(rien));
      });
    });
    return attentes;
  }

  M.seek = function (t) {
    function attendre(passe) {
      var attentes = imagesEnAttente();
      if (!attentes.length) return null;
      if (passe >= 3) {
        if (!etat.avertiImages) {
          etat.avertiImages = true;
          var e = { regle: 'image-non-decodee', message: 'Des images n\'étaient toujours pas prêtes après trois essais (vers ' + Math.round(etat.t * 100) / 100 + ' s) : elles pourraient manquer à certaines images.' };
          if (M.erreurs) M.erreurs.push(e);
          console.warn('[Pulse Motion] ' + e.message);
        }
        return null;
      }
      return Promise.all(attentes).then(function () { return attendre(passe + 1); });
    }
    return M.pret.then(function () {
      M.rendre(t);
      var attentes = [document.fonts ? document.fonts.ready : Promise.resolve()];
      etat.attentes.forEach(function (fn) { attentes.push(Promise.resolve(fn(etat.t))); });
      return Promise.all(attentes).then(function () { return attendre(0); });
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
  /** Caméras d'une scène : [{ el, clauses }] (clauses lues par M.analyserCamera ; contrôle du mouvement). */
  M.camerasDeScene = function (idScene) {
    var s = etat.scenes.filter(function (x) { return x.info.id === idScene; })[0];
    return s ? s.cameras.map(function (c) { return { el: c.el, clauses: c.clauses }; }) : [];
  };
  M.tenirAJour = function (idScene, actif) {
    if (actif === false) delete etat.tenues[idScene]; else etat.tenues[idScene] = true;
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
