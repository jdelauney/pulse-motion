/* Pulse Motion – son de la vidéo : un seul mixage (voix, musique, plus tard bruitages), rendu hors temps réel,
 * utilisé par la lecture, l'export dans le navigateur et l'export fidèle.
 *
 *   M.aSon()       vrai si la vidéo a au moins une source sonore
 *   M.rendreSon()  -> Promise<{ buffer: AudioBuffer|null, sonie: number|null, avertissements: [texte] }>, une fois par page
 *   M.rendreSon({ detail: true }) -> la même, plus detail: { taux, voix, autres } (mono, mêmes gains, avant le limiteur ; contrôle)
 *   M.pistesBrutes(noms) -> Promise<{ taux, pistes: { musique?, voix? } }>   pistes mono sans volume, fondus ni ducking (P7)
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

  function catalogue() { return (M.synthe && M.synthe.catalogue) || { TENUS: [], PICS: {}, FORTS: [] }; }

  /**
   * Moments forts déclarés (spec Styles et réalisation, 5.8) : [data-moment-fort] minutés, au plus 1 par scène et 3 par
   * vidéo (les suivants sont ignorés ; contrôle moment-fort-en-trop). -> [{ t, el }] dans l'ordre de la vidéo.
   */
  function momentsForts() {
    var r = [], vues = {};
    if (!M.minutage) return r;
    document.querySelectorAll('#pm-scene section[data-scene] [data-moment-fort]').forEach(function (el) {
      var id = el.closest('section[data-scene]').getAttribute('data-scene');
      var e = M.minutage.elements[id];
      var cle = el.getAttribute('data-pm-cle');
      if (!e || !e[cle] || vues[id] || r.length >= 3) return;
      vues[id] = true;
      r.push({ t: e[cle].debut, el: el });
    });
    return r.sort(function (a, b) { return a.t - b.t; });
  }
  M.momentsForts = function () { return momentsForts().map(function (m) { return { t: m.t, id: m.el.id || null }; }); };
  // Silence de la musique avant un moment fort (s), fondus de sortie et de retour.
  var SILENCE_FORT = 0.6, FONDU_FORT = 0.05, RETOUR_FORT = 0.03;

  // Mixage par bandes (5.8 ; idée seulement, citée par la spec ; valeurs à juger à l'oreille) : passe-haut des bruitages,
  // passe-bas de la musique, largeur de la plage autour du pic, fondus.
  var BANDES = { bruitages: 800, musique: 4000, plage: 0.3, fondu: 0.05 };
  function estFort(ev) { return !!ev.fort || catalogue().FORTS.indexOf(ev.nom) >= 0; }
  /** Plages [{ debut, fin }] où la musique passe au passe-bas : 0,3 s centrées sur le pic de chaque bruitage non fort. */
  function plagesBandes(sons) {
    var C = catalogue(), r = [];
    sons.filter(function (ev) { return !ev.fichier && !estFort(ev); }).map(function (ev) {
      var c = ev.t + (C.PICS[ev.nom] || 0);
      return { debut: Math.max(0, c - BANDES.plage / 2), fin: c + BANDES.plage / 2 };
    }).sort(function (a, b) { return a.debut - b.debut; }).forEach(function (p) {
      var der = r[r.length - 1];
      if (der && p.debut <= der.fin + BANDES.fondu) der.fin = Math.max(der.fin, p.fin);
      else r.push(p);
    });
    return r;
  }
  M.plagesBandes = function () { return plagesBandes(evenementsSons()); };

  /** Sons à jouer : éléments [data-son] (au début résolu de l'élément), transitions. -> [{ t, nom, fichier, volume }] */
  function evenementsSons() {
    var d = M.donnees || {}, liste = [], C = catalogue();
    if (!M.minutage) return liste;
    document.querySelectorAll('#pm-scene section[data-scene] [data-son]').forEach(function (el) {
      var sec = el.closest('section[data-scene]');
      var e = M.minutage.elements[sec.getAttribute('data-scene')];
      var cle = el.getAttribute('data-pm-cle');
      if (!e || !e[cle]) return;
      var v = parseFloat(el.getAttribute('data-son-volume'));
      var nom = el.getAttribute('data-son');
      var fichier = /^fichier:/.test(nom) ? nom.slice(8) : null;
      var ev = { t: e[cle].debut, nom: fichier ? null : nom, fichier: fichier, volume: isFinite(v) ? Math.max(0, Math.min(1, v)) : 1, element: true };
      // Son tenu (5.8) : il dure l'entrée de l'élément (crissement posé à la main garde sa durée de 0,4 s, comme avant).
      if (!fichier && nom !== 'crissement' && C.TENUS.indexOf(nom) >= 0) ev.duree = Math.max(0.05, e[cle].fin - e[cle].debut);
      liste.push(ev);
    });
    // Moment fort : le son fort du style tombe sur l'élément (sauf s'il porte déjà son data-son).
    var fort = (d.momentFort && d.momentFort.son) || null;
    momentsForts().forEach(function (m) {
      if (fort && !m.el.hasAttribute('data-son')) liste.push({ t: m.t, nom: fort, fichier: null, volume: 1, element: true, fort: true });
    });
    var auto = d.bruitages ? d.bruitages.auto : false;
    // Bruitages automatiques (spec S7, 5.15) : true ou « minimal » sonnent aussi les transitions, sauf transitions: false.
    var transitions = d.bruitages && (d.bruitages.transitions === true || ((auto === true || auto === 'minimal') && d.bruitages.transitions !== false));
    if (transitions) {
      M.minutage.scenes.forEach(function (s, i) {
        var son = i > 0 && M.synthe.catalogue.sonTransition(s.transition);
        if (son) liste.push({ t: s.debut, nom: son, fichier: null, volume: 1 });
      });
    }
    if (auto === true || auto === 'minimal') {
      liste.forEach(function (e) { e.explicite = true; });
      if (auto === true) liste = liste.concat(bruitagesAuto(d));
      liste = eclaircir(liste);
    }
    // Calage par le pic (5.8, bruitages.calage = "pic") : le son d'un élément part plus tôt, son pic tombe sur l'élément.
    // Les sons des transitions et les fichiers partent toujours à leur instant.
    if (d.bruitages && d.bruitages.calage === 'pic') {
      liste.forEach(function (e) {
        var pic = e.element && e.nom ? C.PICS[e.nom] : 0;
        if (pic > 0) e.t = Math.max(0, Math.round((e.t - pic) * 1e6) / 1e6);
      });
      liste.sort(function (a, b) { return a.t - b.t; });
    }
    return liste;
  }

  // --- Bruitages automatiques par type d'entrée (spec S7, 5.15) ----------------------------------------------------------
  // Genre de l'élément -> type d'entrée (TYPES_ENTREE de scripts/lib/contrat.js, tables des styles : identite.son.bruitages),
  // son par défaut et gain. Logique de sfxCues (engine/runtime.js d'explainroo, MIT, © 2026 Vincent Schmalbach) : même son
  // à moins de 0,12 s ignoré (0,045 s pour tic), au plus 3 sons par fenêtre de 0,5 s (tic à part), sons posés à la main et
  // transitions jamais filtrés. Aucun son fort (impact, basse, montee) : jamais.
  var DEFAUTS = { image: ['pop', 0.5], forme: ['pop', 0.5], trace: ['souffle', 0.35], point: ['blip', 0.45], chiffre: ['tic', 0.8], titre: [null, 0], texte: [null, 0], ecriture: [null, 0] };
  var FORTS = ['impact', 'basse', 'montee'];
  // Gamme pentatonique de do (octave 5), sans musique générée.
  var PENTATONIQUE = [72, 74, 76, 79, 81];

  function frequence(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function gammeListes(d) {
    var p = d.musique && d.musique.partition;
    var notes = p && p.tonalite && M.synthe && M.synthe.ambiances && M.synthe.ambiances.notesGamme ? M.synthe.ambiances.notesGamme(p.tonalite) : null;
    return notes && notes.length ? notes : PENTATONIQUE;
  }

  function aFond(cs) {
    var bg = cs.backgroundColor;
    var fond = (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) || (cs.backgroundImage && cs.backgroundImage !== 'none');
    var bordure = ['Top', 'Right', 'Bottom', 'Left'].some(function (c) { return parseFloat(cs['border' + c + 'Width']) > 0 && cs['border' + c + 'Style'] !== 'none'; });
    return fond || bordure;
  }

  /** Type d'entrée d'un élément minuté (null : aucun son) ; main : tracé à main levée. */
  function typeEntree(el, sec) {
    if (el.matches('[data-effet],[data-milieu],[data-shader],[data-cadrer],[data-camera],.decor,[data-decor]') || el.closest('.decor,[data-decor]')) return null;
    if (el.matches('[data-fleche],[data-annoter],[data-main-levee]') || el.closest('svg[data-main-levee]')) {
      var main = el.hasAttribute('data-main-levee') || String(getComputedStyle(el).getPropertyValue('--pm-trait') || getComputedStyle(sec).getPropertyValue('--pm-trait')).trim() === 'main';
      return { type: 'trace', main: main };
    }
    var tween = el.getAttribute('data-tween') || '';
    if (el.hasAttribute('data-graphique') || /(^|;)\s*nombre\b/.test(tween)) return { type: 'chiffre' };
    var cle = el.getAttribute('data-texte') || '';
    if (el.tagName === 'LI' || /^point\d*$/.test(cle) || el.querySelector('[data-texte^="point"]')) return { type: 'point' };
    if (el.tagName === 'IMG' || el.matches('[data-logo], .logo, svg:not([aria-hidden="true"])')) return { type: 'image' };
    if (el.hasAttribute('data-code')) return { type: 'ecriture' };
    var texte = el.hasAttribute('data-texte') || /\S/.test(el.textContent || '');
    if (texte) {
      if (aFond(getComputedStyle(el))) return { type: 'forme' };
      return { type: /^(h1|h2)$/i.test(el.tagName) || /titre/.test(cle) ? 'titre' : 'texte' };
    }
    return aFond(getComputedStyle(el)) ? { type: 'forme' } : null;
  }

  function bruitagesAuto(d) {
    var r = [], table = (d.bruitages && d.bruitages.table) || {}, gamme = gammeListes(d), tenus = catalogue().TENUS;
    var matiere = d.bruitages && tenus.indexOf(d.bruitages.matiere) >= 0 ? d.bruitages.matiere : null;
    document.querySelectorAll('#pm-scene section[data-scene]').forEach(function (sec) {
      var e = M.minutage.elements[sec.getAttribute('data-scene')];
      if (!e) return;
      var rangListe = 0;
      sec.querySelectorAll('[data-pm-cle]').forEach(function (el) {
        if (el.hasAttribute('data-son')) return;
        var tps = e[el.getAttribute('data-pm-cle')];
        if (!tps) return;
        var g = typeEntree(el, sec);
        if (!g) return;
        var defaut = DEFAUTS[g.type] || [null, 0];
        var nom = Object.prototype.hasOwnProperty.call(table, g.type) ? table[g.type] : defaut[0];
        // Tracé à main levée : le son tenu de la matière du style (spec Styles et réalisation, 5.7, point 4), sinon crissement,
        // son générique du tracé (conflit 14 de la revue).
        if (g.type === 'trace' && g.main) nom = matiere || 'crissement';
        if (!nom || FORTS.indexOf(nom) >= 0) return;
        var tenu = tenus.indexOf(nom) >= 0;
        var gain = g.type === 'trace' && tenu ? 0.4 : defaut[1] || 0.4;
        var duree = Math.max(0.05, tps.fin - tps.debut);
        if (g.type === 'point') {
          var midi = gamme[rangListe % gamme.length] + 12 * Math.floor(rangListe / gamme.length);
          rangListe++;
          r.push({ t: tps.debut, nom: nom, fichier: null, volume: gain, hauteur: nom === 'blip' ? frequence(midi) : undefined, element: true, duree: tenu ? duree : undefined });
        } else if (g.type === 'chiffre' && nom === 'tic') {
          // Compteur : tic × N, N = borne(arrondi(durée × 10), 4, 18), aux instants 1 − ∛(1 − k/N), gain de 0,8 à 0,4.
          var n = Math.max(4, Math.min(18, Math.round(duree * 10)));
          for (var k = 0; k < n; k++) {
            var x = 1 - Math.cbrt(1 - k / n);
            r.push({ t: tps.debut + duree * x, nom: 'tic', fichier: null, volume: 0.8 - 0.4 * k / Math.max(1, n - 1), element: true });
          }
        } else r.push({ t: tps.debut, nom: nom, fichier: null, volume: gain, duree: tenu ? duree : undefined, element: true });
      });
    });
    return r;
  }

  /** Éclaircit les sons (voir plus haut) ; ordre par instant. */
  function eclaircir(liste) {
    liste.sort(function (a, b) { return a.t - b.t; });
    var sortie = [], dernier = {}, debutFenetre = -Infinity, dansFenetre = 0;
    liste.forEach(function (c) {
      var cle = c.nom || c.fichier;
      var prec = dernier[cle];
      if (!c.explicite && prec !== undefined && c.t - prec < (c.nom === 'tic' ? 0.045 : 0.12)) return;
      if (c.t - debutFenetre > 0.5) { debutFenetre = c.t; dansFenetre = 0; }
      if (!c.explicite && dansFenetre >= 3 && c.nom !== 'tic') return;
      dansFenetre++;
      dernier[cle] = c.t;
      sortie.push(c);
    });
    return sortie;
  }
  /** Sons à jouer, bruitages automatiques compris (contrôle, tests). */
  M.evenementsSons = function () { return evenementsSons(); };

  M.aSon = function () {
    var d = M.donnees;
    return !!(d && ((d.musique && (d.musique.source || d.musique.partition)) || prisesVoix().length || evenementsSons().length));
  };

  async function decoder(contexte, id) {
    var el = document.getElementById(id);
    if (!el) throw new Error('source « ' + id + ' » absente de la page');
    var octets = await (await fetch(el.textContent.trim())).arrayBuffer();
    return contexte.decodeAudioData(octets);
  }

  /**
   * Évènements créés par fenêtres de 4 s : le rendu s'arrête une seconde avant chaque fenêtre (suspend), crée les
   * nœuds de ses notes, puis reprend. Créer tous les nœuds d'avance rendrait le calcul quadratique en la durée.
   */
  var FENETRE = 4;
  function planifierParFenetres(contexte, evenements, duree, jouer) {
    var k = 0;
    function jusqua(fin) { while (k < evenements.length && evenements[k].t < fin) jouer(evenements[k++]); }
    jusqua(FENETRE);
    for (var w = FENETRE; w < duree; w += FENETRE) {
      (function (debut) {
        contexte.suspend(debut - 1).then(function () { jusqua(debut + FENETRE); contexte.resume(); });
      })(w);
    }
  }

  function automatiser(param, points) {
    param.setValueAtTime(points[0].v, 0);
    for (var i = 1; i < points.length; i++) param.linearRampToValueAtTime(points[i].v, points[i].t);
  }

  function nouveauContexte(enPlus) {
    return new OfflineAudioContext(2, Math.max(1, Math.ceil(M.duree * TAUX) + Math.ceil((enPlus || 0) * TAUX)), TAUX);
  }
  function canaux(tampon) { return [tampon.getChannelData(0), tampon.getChannelData(1)]; }
  function volumeDe(objet) { return objet && typeof objet.volume === 'number' ? objet.volume : 1; }

  /** Chaque bus est rendu seul, à plein volume ; les volumes de la personne s'appliquent au mélange. */
  async function rendre(options) {
    // seulement: 'musique' : la musique seule (pour l'écouter), sans voix ni bruitages.
    var seulement = options && options.seulement;
    var d = M.donnees, duree = M.duree, X = M.mixage, D = X.DUCKING;
    var avertissements = [], bus = [], musiqueIllisible = false, entendues = [];
    // Sons et moments forts lus d'abord : la musique se tait avant un moment fort et se filtre sous les bruitages (bandes).
    var sons = seulement ? [] : evenementsSons();
    var forts = momentsForts();
    var bandes = !!(d.bruitages && d.bruitages.bandes === true);

    var prises = seulement ? [] : prisesVoix();
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
      if (entendues.length) bus.push({ tampon: await contexteVoix.startRendering(), volume: volumeDe(d.voix), voix: true });
    }

    if (d.musique && (d.musique.source || d.musique.partition)) {
      try {
        // Boucle parfaite (spec Rendu et export, 5.18) : la musique est rendue un peu au-delà de la fin, sans fondus, puis sa queue
        // est repliée au début (M.mixage.replierBoucle).
        var enBoucle = d.boucle === true;
        var contexte = nouveauContexte(enBoucle ? X.QUEUE_BOUCLE : 0);
        // Musique importée (décodée), ou générée : partition jouée par le synthétiseur, coupée à la durée de la vidéo.
        var entree = contexte.createGain();
        if (d.musique.source) {
          var musique = contexte.createBufferSource();
          musique.buffer = await decoder(contexte, d.musique.source);
          musique.connect(entree);
          musique.start(0);
        } else {
          var bruit = M.synthe.bruit(contexte, 4242);
          planifierParFenetres(contexte, M.synthe.partition.evenements(d.musique.partition, { duree: duree }), duree, function (e) { M.synthe.instruments.jouer(contexte, entree, e, bruit); });
        }
        var fondus = contexte.createGain();
        automatiser(fondus.gain, X.pointsFondus(duree, 1, { boucle: enBoucle }));
        var points = X.pointsDucking(X.groupesParole(entendues, D.ecart), D);
        var baisse = contexte.createGain();
        automatiser(baisse.gain, points.map(function (q) { return { t: q.t, v: Math.pow(10, q.db / 20) }; }));
        var creux = contexte.createBiquadFilter();
        creux.type = 'peaking';
        creux.frequency.value = D.frequence;
        creux.Q.value = D.q;
        automatiser(creux.gain, points.map(function (q) { return { t: q.t, v: q.db * D.creux }; }));
        var chaine = entree.connect(fondus).connect(baisse).connect(creux);
        // Moments forts (spec Styles et réalisation, 5.8) : la musique se tait 0,6 s avant l'élément, puis revient avec lui.
        if (forts.length) {
          var silence = contexte.createGain();
          silence.gain.setValueAtTime(1, 0);
          forts.forEach(function (m) {
            var debut = Math.max(0, m.t - SILENCE_FORT);
            silence.gain.setValueAtTime(1, Math.max(0, debut - FONDU_FORT));
            silence.gain.linearRampToValueAtTime(0, debut);
            silence.gain.setValueAtTime(0, m.t);
            silence.gain.linearRampToValueAtTime(1, m.t + RETOUR_FORT);
          });
          chaine = chaine.connect(silence);
        }
        // Mixage par bandes (5.8, bruitages.bandes) : passe-bas à 4 kHz sur la musique 0,3 s autour du pic de chaque bruitage
        // non fort, fondus de 50 ms (fondu enchaîné entre la musique telle quelle et la musique filtrée).
        var plages = bandes ? plagesBandes(sons) : [];
        if (plages.length) {
          var directe = contexte.createGain(), filtree = contexte.createGain(), bas = contexte.createBiquadFilter();
          bas.type = 'lowpass';
          bas.frequency.value = BANDES.musique;
          directe.gain.setValueAtTime(1, 0);
          filtree.gain.setValueAtTime(0, 0);
          plages.forEach(function (p) {
            directe.gain.setValueAtTime(1, p.debut); directe.gain.linearRampToValueAtTime(0, p.debut + BANDES.fondu);
            directe.gain.setValueAtTime(0, p.fin - BANDES.fondu); directe.gain.linearRampToValueAtTime(1, p.fin);
            filtree.gain.setValueAtTime(0, p.debut); filtree.gain.linearRampToValueAtTime(1, p.debut + BANDES.fondu);
            filtree.gain.setValueAtTime(1, p.fin - BANDES.fondu); filtree.gain.linearRampToValueAtTime(0, p.fin);
          });
          chaine.connect(directe).connect(contexte.destination);
          chaine.connect(bas).connect(filtree).connect(contexte.destination);
        } else chaine.connect(contexte.destination);
        var rendue = await contexte.startRendering();
        if (enBoucle) {
          var nb = Math.max(1, Math.ceil(duree * TAUX));
          var replies = X.replierBoucle(canaux(rendue), nb, TAUX);
          var tampon = new AudioBuffer({ length: nb, numberOfChannels: 2, sampleRate: TAUX });
          tampon.copyToChannel(replies[0], 0);
          tampon.copyToChannel(replies[1], 1);
          rendue = tampon;
        }
        bus.push({ tampon: rendue, volume: volumeDe(d.musique) });
      } catch (e) {
        musiqueIllisible = true;
      }
    }
    // Bruitages : éléments [data-son] et transitions ; non baissés sous la voix.
    if (sons.length) {
      var contexteSons = nouveauContexte();
      var bruitSons = M.synthe.bruit(contexteSons, 777);
      // Fondu de sortie de 0,3 s en fin de vidéo : un son long ne s'arrête pas net.
      var sortieSons = contexteSons.createGain();
      sortieSons.gain.setValueAtTime(1, Math.max(0, duree - 0.3));
      sortieSons.gain.linearRampToValueAtTime(0, duree);
      sortieSons.connect(contexteSons.destination);
      // Bandes (5.8) : les bruitages non forts passent dans un passe-haut à 800 Hz (ils laissent le grave à la musique).
      var aigus = null;
      if (bandes) {
        aigus = contexteSons.createBiquadFilter();
        aigus.type = 'highpass';
        aigus.frequency.value = BANDES.bruitages;
        aigus.connect(sortieSons);
      }
      for (var s = 0; s < sons.length; s++) {
        var ev = sons[s];
        if (ev.fichier) {
          try {
            var src = contexteSons.createBufferSource();
            src.buffer = await decoder(contexteSons, ev.fichier);
            var gf = contexteSons.createGain();
            gf.gain.value = ev.volume;
            src.connect(gf).connect(sortieSons);
            src.start(ev.t);
          } catch (e) { avertissements.push('Un son importé n\'a pas pu être lu.'); }
        } else M.synthe.bruitages.jouer(contexteSons, aigus && !estFort(ev) ? aigus : sortieSons, ev.nom, ev.t, ev.volume, bruitSons, { hauteur: ev.hauteur, duree: ev.duree });
      }
      bus.push({ tampon: await contexteSons.startRendering(), volume: volumeDe(d.bruitages) });
    }
    if (musiqueIllisible) {
      // Formulé pour la lecture comme pour l'export (le même rendu sert aux deux).
      avertissements.push(bus.length ? 'La musique n\'a pas pu être lue : le son est fait sans elle.' : 'La musique n\'a pas pu être lue : la vidéo n\'a pas de son.');
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
    // Détail (contrôle, spec S2 5.11) : voix et autres sons en mono, aux mêmes gains et volumes que le mélange, avant le
    // limiteur. Calculé avant le mélange : celui-ci réécrit le premier bus sur place.
    var detail = null;
    if (options && options.detail) {
      var voixMono = new Float32Array(n), autres = new Float32Array(n);
      for (var bd = 0; bd < bus.length; bd++) {
        var cible = bus[bd].voix ? voixMono : autres;
        var g = gain * bus[bd].volume / 2;
        for (var kd = 0; kd < n; kd++) cible[kd] += g * (sources[bd][0][kd] + sources[bd][1][kd]);
      }
      detail = { taux: TAUX, voix: voixMono, autres: autres };
    }
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
    var r = { buffer: sortie, sonie: sonie, avertissements: avertissements };
    if (detail) r.detail = detail;
    return r;
  }

  var promesseDetail = null;
  M.rendreSon = function (options) {
    if (options && options.seulement) return rendre(options);
    // detail : un rendu à part (gardé), la vidéo et l'export gardent le leur, inchangé.
    if (options && options.detail) {
      if (!promesseDetail) promesseDetail = rendre({ detail: true });
      return promesseDetail;
    }
    if (!promesse) promesse = rendre();
    return promesse;
  };

  /** Pistes brutes du son réactif (P7) : mono 48 kHz à la durée de la vidéo, sans volume, fondus ni ducking.
   *  musique : fichier décodé, ou partition jouée par le synthétiseur (même graine que le mixage) ; voix : toutes les
   *  prises posées à leur début. -> { taux, pistes: { musique?: { echantillons } | { erreur }, voix?: … } } */
  M.pistesBrutes = async function (noms) {
    var d = M.donnees || {};
    var duree = M.duree;
    var pistes = {};
    function contexte() { return new OfflineAudioContext(1, Math.max(1, Math.ceil(duree * TAUX)), TAUX); }
    function texte(e) { return String(e && e.message || e); }
    if (noms.indexOf('musique') >= 0 && d.musique && (d.musique.source || d.musique.partition)) {
      try {
        var c = contexte();
        if (d.musique.source) {
          var s = c.createBufferSource();
          s.buffer = await decoder(c, d.musique.source);
          s.connect(c.destination);
          s.start(0);
        } else {
          var entree = c.createGain();
          entree.connect(c.destination);
          var bruit = M.synthe.bruit(c, 4242);
          planifierParFenetres(c, M.synthe.partition.evenements(d.musique.partition, { duree: duree }), duree, function (e) { M.synthe.instruments.jouer(c, entree, e, bruit); });
        }
        pistes.musique = { echantillons: (await c.startRendering()).getChannelData(0) };
      } catch (e) {
        pistes.musique = { erreur: 'La musique n\'a pas pu être lue (' + texte(e) + ').' };
      }
    }
    if (noms.indexOf('voix') >= 0) {
      var prises = prisesVoix();
      if (prises.length) {
        var cv = contexte();
        var lues = 0;
        var fautes = [];
        for (var i = 0; i < prises.length; i++) {
          try {
            var v = cv.createBufferSource();
            v.buffer = await decoder(cv, prises[i].source);
            v.connect(cv.destination);
            v.start(prises[i].debut);
            lues++;
          } catch (e) { fautes.push(prises[i].scene); }
        }
        pistes.voix = lues ? { echantillons: (await cv.startRendering()).getChannelData(0) }
          : { erreur: 'La voix n\'a pas pu être lue (scènes : ' + fautes.join(', ') + ').' };
      }
    }
    return { taux: TAUX, pistes: pistes };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
