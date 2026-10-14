/* Pulse Motion – calques de particules : canvas par scène, horloge, minutage, ancres.
 *
 * M.demarrerParticules()   après M.demarrer() : canvas des calques, GPU, rendu à chaque image
 * M.particules.pret        Promise résolue quand le GPU est prêt ou absent (renouvelée après une perte)
 * M.particules.disponible  WebGPU utilisable
 * M.particules.lirePixels(idScene, calque) -> Promise<{ largeur, hauteur, donnees }>
 * M.particules.lireEtat(idScene, ordre, emetteur) -> Promise<Float32Array>
 * M.particules.image(idScene, calque) -> Promise<ImageBitmap>   image du calque (export)
 * M.particules.preparerCapture() -> Promise   pose canvas.__pmImage (PNG en data:) sur les calques affichés ;
 *   rejette (images remises à null) si un effet visible n'est pas rendu : WebGPU absent, effet désactivé
 *   (mémoire, texture illisible) ou scène en échec — pas de vidéo sans ses effets
 * M.particules.verifierExport() -> Promise    rejette si des effets existent et que WebGPU manque
 * M.particules.lireOrdre(idScene, ordre, emetteur) -> Promise<Uint32Array>   paires clé, index après tri (tests)
 * M.particules.lireContacts(idScene, ordre, emetteur) -> Promise<Float32Array>   contacts des particules (collisions, tests)
 * M.particules.lireHauteurs(idScene, ordre) -> Promise<Float32Array>   profils d'empilement de l'effet (tests)
 * Couche commune des obstacles du déroulé : chaque effet qui y empile part de la somme des contributions des effets
 * commencés avant lui ; la contribution d'un effet (ses sommes au dernier pas avant min(fin de son affichage, début de
 * l'effet qui hérite)) est calculée une fois par instant en simulant l'effet, puis gardée (perdue avec le GPU, refaite
 * après un changement de recette). La couche héritée est dessinée (bande sous les particules, couleur des effets qui
 * l'ont formée) dans le calque de l'effet qui hérite, tant qu'il est affiché.
 * Collisions (P3) : chaque effet dont une recette a « collisions » reçoit la table de ses obstacles (bords, éléments
 * data-obstacle et formes de sa scène, éléments data-obstacle="video" des scènes voisines, obstacles du déroulé) ;
 * leurs repères sont mesurés avec la zone d'émission à chaque point de la grille (P.mesurerReperes), les scènes voisines
 * rendues à cet instant si elles sont visibles ; toutes les scènes rendues pour une mesure sont rendues de nouveau à t.
 * M.particules.remplacerEffet(idScene, ordre, effet) -> Promise   atelier : la recette compilée d'un effet remplacée,
 *   simulation recréée, instant courant rendu ; appels servis dans l'ordre ; rejette si l'effet n'a pas de simulation
 *   (balise en erreur), si WebGPU manque ou si une texture est illisible
 * M.particules.decrire(idScene) -> [{ ordre, calque, nom, debut, fin, rythme, actif, desactive, collisions }]   fenêtres (atelier)
 * M.particules.raison      message du moteur quand WebGPU est indisponible (null sinon)
 * M.particules.alertes     messages d'exécution (masque vide d'une forme exacte, obstacles ou couches au-delà des limites) ;
 *   masque vide : aussi un panneau d'alerte (.pm-effet-alerte, masqué en capture) sur les effets qui visent les formes
 * M.particules.formesVides() -> Promise<[{ scene, element, message }]>   formes exactes au masque vide (contrôle, sans GPU)
 * M.particules.photosVides() -> Promise<[{ scene, element, regle, message }]>   photographies des effets de fragmentation :
 *   ancre-vide (rien à photographier : effet désactivé), photographie-trop-grande (densité augmentée) ; sans GPU.
 *   Page de contrôle : après cet appel, les raccords sont posés selon t même sans GPU (la page mesurée cache les
 *   éléments comme la vidéo exportée : pas de chevauchement ni de lisibilité mesurés sur un élément remplacé)
 * M.particules.donneesFragments(idScene, ordre) -> [données | null]   données de fragments de l'effet (tests)
 * Fragments (P4) : chaque élément photographié (M.figer.photo) une fois par instant et densité, après la porte de
 * disponibilité, à la résolution de sortie 1080p du format, recadré sur sa boîte opaque (contenu visible) ; listes de pixels, appariement de Hilbert, éclats
 * (M.fragments) ; fx.effet : fx.effetOrigine avec le nombre de particules de la photographie ; repères de l'ancre et de
 * l'élément visé mesurés avec la zone d'émission ; raccords : classe pm-fragment-cache (visibility: hidden) posée selon t
 * (M.fragments.raccord), seulement quand l'effet est affiché.
 * Formes exactes : masque de chaque élément data-obstacle="forme" à la fin de son minutage (M.figer.masque), une fois,
 * après la porte de disponibilité (polices chargées) ; champs de distance sur le GPU (P.creerFormes), recréés après une
 * perte du GPU (masques gardés) ; refaits après un changement de polices.
 * Fonds et auras par shader (P6) : balises data-pm-shader (M.donnees.shaders, usage « fond ») ; une scène a des calques
 * dès qu'elle a des effets ou des fonds ; shaders compilés au démarrage du GPU (P.Shaders) ; chaque fond actif (de son
 * début à sa fin, ou à la fin de la scène sans data-dur) est mesuré à t (repère de l'ancre, ou de la balise : plein cadre)
 * et dessiné dans la cible HDR de son calque avant les particules ; un calque sans effet a bloom 0 et tons neutres.
 * M.shaders.erreurs() -> [{ nom, usage, scene, message, erreurs }]   shaders qui ne compilent pas (panneau ; export refusé)
 * M.shaders.decrire(idScene) -> [{ ordre, nom, calque, debut, fin, actif, erreur }]   fonds d'une scène (atelier, tests)
 * M.shaders.regler(idScene, ordre, valeurs) -> Promise   atelier : réglages d'un fond réécrits, instant courant redessiné
 * Composition (P6) : transitions par shader et post-traitements (M.donnees.shaders, usages « transition » et « post ») sur un
 * canvas .pm-composition au-dessus des scènes (M.codeShader.planComposition, P.Composition) ; photographies des scènes
 * visibles (M.figer.photo, option scene ; images des calques posées avant) : pleine résolution à chaque seek en capture
 * (export), demi-résolution sinon, au plus toutes les 100 ms pendant la lecture, à chaque image à l'arrêt ; classe pm-compose
 * sur #pm-scene (scènes réelles invisibles) quand toutes les photographies du plan existent. Une transition qui ne compile
 * pas : panneau sur la scène, fondu (M.transitionShader faux) ; un post-traitement : panneau, ignoré ; export refusé.
 * M.transitionShader(id) -> bool        transition par shader de la scène prête (horloge : pas de style CSS d'entrée)
 * M.shaders.lireComposition() -> Promise<{ largeur, hauteur, donnees }>   pixels du canvas de composition (tests)
 * M.shaders.composition() -> { photos: [{ scene, t, exact }], faites }    état des photographies (tests)
 * ordre : rang de la balise parmi les data-effet de la scène, effets en erreur compris (comme l'assemblage).
 *
 * Réglages d'un calque (bloom, seuil, tons) : ceux de la recette au bloom le plus fort parmi tous les
 * effets du calque dans la scène (constants pour la scène ; à égalité, le premier).
 * Scène masquée : simulations et cible de rendu libérées, recréées au retour.
 * Zone d'émission : boîte de l'ancre (ou de la balise data-effet) relative à la scène, en cqh,
 * mesurée sur une grille de 30 points par seconde de τ en rendant la scène à ces instants
 * (M.rendreScene) : elle ne dépend que de τ, jamais du chemin suivi pour arriver à t.
 * Modules WGSL des recettes (P6) : compilés au démarrage du GPU (Rendu.verifierModules) ; un module qui ne compile pas désactive
 * son effet (panneau, M.shaders.erreurs, usage « module ») ; l'atelier refuse une recette dont un module ne compile pas.
 * Navigateur seulement ; dépend de horloge, gpu, simulation, rendu.
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};
  const CALQUES = ['arriere', 'avant'];
  const SANS_GPU = 'Effet non affiché : WebGPU indisponible. Ouvrez la vidéo dans Chrome ou Edge récent.';
  const CACHE = 'pm-fragment-cache';
  // Calque sans effet de particules (fonds seuls) : couleurs exactes.
  const REGLAGES_FONDS = { bloom: 0, seuil_bloom: 1, tons: 'neutre' };
  // Hauteur de sortie 1080p de chaque format (pixels de sortie des photographies).
  const HAUTEURS_SORTIE = { '16:9': 1080, '9:16': 1920, '1:1': 1080, '4:5': 1350 };

  const GARDE_GPU = 10000;
  const etat = { gpu: null, rendu: null, scenes: [], obstacles: new Map(), masques: null, formes: null, alertes: [], t: 0, rendu_t: null, pret: Promise.resolve(), disponible: false, raison: null,
    photos: new Map(), problemesPhotos: [], promesseFragments: null, controle: false, shaders: null, erreursShaders: [] };

  function panneau(el, message) {
    if (el.querySelector(':scope > .pm-effet-panneau')) return;
    const d = document.createElement('div');
    d.className = 'pm-effet-panneau';
    d.textContent = message;
    el.appendChild(d);
  }

  /** Alerte sur un effet qui reste affiché (aperçu seulement : masquée pendant une capture) ; une ligne par message. */
  function panneauAlerte(el, message) {
    let d = el.querySelector(':scope > .pm-effet-alerte');
    if (!d) {
      d = document.createElement('div');
      d.className = 'pm-effet-alerte';
      el.appendChild(d);
    }
    if (d.textContent.split('\n').indexOf(message) < 0) d.textContent = d.textContent ? d.textContent + '\n' + message : message;
  }

  /** Largeur de l'image en cqh : boîte de #pm-scene (celle de toutes les scènes, même masquées). */
  function largeurScene() {
    const s = document.getElementById('pm-scene');
    return 100 * s.clientWidth / Math.max(1, s.clientHeight);
  }

  /** Réglages d'un calque : ceux de la recette au bloom le plus fort parmi ses effets (à égalité, le premier). */
  function reglagesCalque(effets, nom) {
    let rc = null;
    effets.forEach((fx) => { if (fx.calque === nom && (!rc || fx.effet.rendu_calque.bloom > rc.bloom)) rc = fx.effet.rendu_calque; });
    return rc;
  }

  /** Fonds et auras par shader d'une scène (balises data-pm-shader), dans l'ordre du document. */
  function recenserFonds(info, section) {
    section.querySelectorAll('[data-pm-shader-erreur]').forEach((el) => panneau(el, el.getAttribute('data-pm-shader-erreur')));
    const balises = Array.from(section.querySelectorAll('[data-shader]'));
    const fonds = [];
    section.querySelectorAll('[data-pm-shader]').forEach((el) => {
      const d = (M.donnees.shaders || [])[Number(el.getAttribute('data-pm-shader'))];
      if (!d || d.usage !== 'fond') return;
      const temps = (M.minutage.elements[info.id] || {})[el.getAttribute('data-pm-cle')];
      fonds.push({
        el, info, section, donnee: d, ordre: balises.indexOf(el), calque: d.calque,
        ancre: d.ancre ? section.querySelector('#' + CSS.escape(d.ancre)) : null,
        debut: temps ? temps.debut : info.debut,
        // Sans data-dur : jusqu'à la fin de la scène (un fond est une ambiance).
        fin: el.hasAttribute('data-dur') && temps ? temps.fin : info.fin,
        shader: null, erreur: null,
      });
    });
    return fonds;
  }

  function recenser() {
    const scenes = [];
    M.minutage.scenes.forEach((info) => {
      const section = document.querySelector('#pm-scene > section[data-scene="' + CSS.escape(info.id) + '"]');
      if (!section) return;
      section.querySelectorAll('[data-pm-effet-erreur]').forEach((el) => panneau(el, el.getAttribute('data-pm-effet-erreur')));
      const effets = [];
      const balises = Array.from(section.querySelectorAll('[data-effet]'));
      section.querySelectorAll('[data-pm-effet]').forEach((el) => {
        const d = (M.donnees.effets || [])[Number(el.getAttribute('data-pm-effet'))];
        if (!d) return;
        const temps = (M.minutage.elements[info.id] || {})[el.getAttribute('data-pm-cle')];
        effets.push({
          el, info, section,
          ordre: balises.indexOf(el),
          effet: d.effet,
          calque: d.calque,
          ancre: d.ancre ? section.querySelector('#' + CSS.escape(d.ancre)) : null,
          cible: d.cible ? section.querySelector('#' + CSS.escape(d.cible)) : null,
          effetOrigine: d.effet,
          fragments: null,
          ancres: new Map(),
          debut: temps ? temps.debut : info.debut,
          zones: new Map(),
          sim: null,
          table: null,
          reperes: new Map(),
          largeurCqh: 0,
        });
      });
      const fonds = recenserFonds(info, section);
      if (!effets.length && !fonds.length) return;
      const sc = { info, section, effets, fonds, calques: {}, reglages: {} };
      CALQUES.forEach((nom) => {
        if (!effets.some((fx) => fx.calque === nom) && !fonds.some((f) => f.calque === nom)) return;
        sc.reglages[nom] = reglagesCalque(effets, nom) || REGLAGES_FONDS;
        const canvas = document.createElement('canvas');
        canvas.className = 'pm-calque';
        canvas.setAttribute('data-pm-calque', nom);
        canvas.setAttribute('aria-hidden', 'true');
        section.appendChild(canvas);
        sc.calques[nom] = canvas;
      });
      section.classList.add('pm-avec-calques');
      scenes.push(sc);
    });
    return scenes;
  }

  /** Obstacles déclarés de toutes les scènes (index dans M.donnees.obstacles), avec leur élément quand il y en a un. */
  function recenserObstacles() {
    const parScene = new Map();
    (M.donnees.obstacles || []).forEach((d, index) => {
      const section = document.querySelector('#pm-scene > section[data-scene="' + CSS.escape(d.scene) + '"]');
      if (!section) return;
      const decl = Object.assign({ index }, d);
      if (d.genre === 'element' || d.genre === 'forme') {
        decl.el = section.querySelector('[data-pm-obstacle="' + index + '"]');
        if (!decl.el) return;
      }
      if (!parScene.has(d.scene)) parScene.set(d.scene, []);
      parScene.get(d.scene).push(decl);
    });
    return parScene;
  }

  /** Scènes qui peuvent être visibles en même temps que idScene (transitions) : la précédente et la suivante. */
  function voisinsDe(idScene) {
    const ids = M.minutage.scenes.map((s) => s.id);
    const i = ids.indexOf(idScene);
    return [ids[i - 1], ids[i + 1]].filter(Boolean);
  }

  /** Obstacles d'un effet (null si aucune recette n'a « collisions ») ; table construite une fois. */
  function monde(fx) {
    if (!fx.effet.emetteurs.some((em) => em.collisions)) return null;
    if (!fx.table) {
      const O = M.obstacles;
      const propres = etat.obstacles.get(fx.info.id) || [];
      const voisins = voisinsDe(fx.info.id).flatMap((id) => (etat.obstacles.get(id) || []).filter((d) => d.video && d.el));
      // Jamais la section de l'effet : masquée à l'instant courant, elle n'a pas de boîte (largeur nulle).
      fx.largeurCqh = largeurScene();
      fx.table = O.construireTable({ largeurCqh: fx.largeurCqh, solRecette: O.solDe(fx.effet), propres, voisins, video: M.donnees.obstaclesVideo || [], effet: fx.effet });
      O.attacherFormes(fx.table, couchePour);
      fx.reperes = new Map();
      const ab = fx.table.abandonnes;
      if (ab.obstacles) alerter('Scène « ' + fx.info.id + ' », effet « ' + fx.effet.nom + ' » : ' + ab.obstacles + ' obstacle(s) ignoré(s), au-delà de ' + O.MAX_TABLE + ' par effet (ceux de la vidéo sont gardés).');
      if (ab.profils) alerter('Scène « ' + fx.info.id + ' », effet « ' + fx.effet.nom + ' » : ' + ab.profils + ' obstacle(s) sans couche d\'empilement, au-delà de ' + O.MAX_PROFILS + ' (ceux de la vidéo sont gardés) ; les particules s\'y posent sans s\'accumuler.');
    }
    return { entrees: fx.table.entrees, largeurCqh: fx.largeurCqh, actif: fx.table.actif, tans: fx.table.tans, formes: etat.formes ? { vue: etat.formes.vue } : null };
  }

  /** Couche du champ de distance d'une forme : numéro, null (masque vide), undefined (pas encore calculée). */
  function couchePour(decl) {
    if (!etat.masques || !etat.masques.has(decl.index)) return undefined;
    if (!etat.masques.get(decl.index)) return null;
    return etat.formes ? etat.formes.couches.get(decl.index) : undefined;
  }

  function alerter(message) {
    if (etat.alertes.indexOf(message) >= 0) return;
    etat.alertes.push(message);
    console.warn('[Pulse Motion] ' + message);
  }

  function messageFormeVide(d) {
    const nom = d.el.id ? '#' + d.el.id : '<' + d.el.localName + '>';
    return 'Scène « ' + d.scene + ' » : l\'obstacle de forme exacte « ' + nom + ' » est invisible à la fin de son minutage (masque vide) ; il est ignoré. Le laisser visible à la fin de son minutage, ou retirer data-obstacle="forme".';
  }

  /** Masques calculés une fois (promesse partagée : contrôle de la vidéo et préparation du GPU). */
  function masquesPromis() {
    if (!etat.promesseMasques) etat.promesseMasques = calculerMasques().then((m) => { etat.masques = m; return m; });
    return etat.promesseMasques;
  }

  /** Panneau d'alerte sur chaque effet dont les particules visent une forme exacte au masque vide. */
  function signalerFormesVides() {
    const O = M.obstacles;
    etat.obstacles.forEach((liste) => liste.forEach((d) => {
      if (d.genre !== 'forme' || !d.el || !etat.masques.has(d.index) || etat.masques.get(d.index)) return;
      etat.scenes.forEach((sc) => {
        if (sc.info.id !== d.scene && !(d.video && voisinsDe(d.scene).indexOf(sc.info.id) >= 0)) return;
        sc.effets.forEach((fx) => {
          if (fx.effet.emetteurs.some((em) => em.collisions && (em.collisions.masque & O.CATEGORIES.formes))) panneauAlerte(fx.el, messageFormeVide(d));
        });
      });
    }));
  }

  /** Masques des formes exactes de toutes les scènes, chacun à la fin du minutage de son élément. */
  async function calculerMasques() {
    const masques = new Map();
    const decls = [];
    etat.obstacles.forEach((liste) => liste.forEach((d) => { if (d.genre === 'forme' && d.el) decls.push(d); }));
    for (const d of decls) {
      const info = M.minutage.scenes.find((s) => s.id === d.scene);
      const cle = d.el.getAttribute('data-pm-cle');
      const temps = cle ? (M.minutage.elements[d.scene] || {})[cle] : null;
      const tFin = Math.min(temps ? temps.fin : info.fin, info.fin - 1e-6);
      const section = d.el.closest('#pm-scene > section');
      M.rendreScene(d.scene, tFin);
      let promesse = null;
      let hauteurSection = 0;
      // Hauteur de la section lue pendant qu'elle est affichée : une scène masquée a une hauteur nulle.
      affichee(section, () => { hauteurSection = section.clientHeight; promesse = M.figer.masque(d.el); });
      M.rendreScene(d.scene, etat.t);
      const m = await promesse;
      if (!m.alpha.some((a) => a >= 128)) {
        alerter(messageFormeVide(d));
        masques.set(d.index, null);
      } else {
        m.hauteurCqh = m.hauteurPx * 100 / Math.max(1, hauteurSection);
        masques.set(d.index, m);
      }
    }
    return masques;
  }

  /** Champs de distance des formes sur le device (masques calculés une fois) ; tables des effets refaites. */
  async function preparerFormes(device) {
    if (!etat.masques) await masquesPromis();
    signalerFormesVides();
    if (etat.formes) { try { etat.formes.texture.destroy(); } catch (e) { /* device perdu */ } }
    etat.formes = null;
    const indices = Array.from(etat.masques.keys()).filter((i) => etat.masques.get(i));
    if (indices.length) {
      const f = P.creerFormes(device, indices.map((i) => etat.masques.get(i)));
      etat.formes = { texture: f.texture, vue: f.vue, couches: new Map(indices.map((i, k) => [i, k])) };
    }
    etat.scenes.forEach((sc) => sc.effets.forEach((fx) => { fx.table = null; fx.reperes = new Map(); liberer(fx); }));
  }

  // Contributions des effets à la couche commune des obstacles de la vidéo : fx -> (instant -> GPUBuffer, MAX_VIDEO × 256 entiers).
  const contributions = new Map();

  function oublierContributions() {
    contributions.forEach((parInstant) => parInstant.forEach((b) => { try { b.destroy(); } catch (e) { /* device perdu */ } }));
    contributions.clear();
  }

  function empileSurVideo(fx) {
    const m = monde(fx);
    return !!(m && m.actif && m.entrees.some((e) => e.profil !== M.obstacles.AUCUN && e.source.video !== undefined));
  }

  /** Fin d'affichage d'un effet : sa fin, ou celle de sa scène. */
  function finAffichage(fx) { return Math.min(fx.debut + fx.effet.fin / fx.info.rythme, fx.info.fin); }

  /** Couleur de la couche héritée : moyenne, sur les effets qui l'ont formée, de la couleur à mi-vie de leur premier émetteur
   *  qui empile sur les éléments (intensité comprise), opacité de leur table de vie à mi-vie. */
  function couleurCouche(effets) {
    const c = [0, 0, 0, 0];
    let n = 0;
    effets.forEach((f) => {
      const em = f.effet.emetteurs.find((e) => e.collisions && e.collisions.empiler && (e.collisions.masque & M.obstacles.CATEGORIES.elements));
      if (!em) return;
      const t = em.tables;
      const k = 32;
      const intensite = t.intensite[k];
      for (let i = 0; i < 3; i++) c[i] += t.couleur[k * 4 + i] * intensite;
      c[3] += t.couleur[k * 4 + 3] * t.opacite[k];
      n++;
    });
    return n ? c.map((x) => x / n) : c;
  }

  /** Bases des profils de fx : somme des contributions des effets commencés avant lui, chacune prise à l'instant
   *  min(fin de l'effet, début de fx) (transitions comprises) ; null si aucune. Pose fx.couches (couches héritées à dessiner). */
  function basesPour(fx, device) {
    fx.couches = [];
    if (!empileSurVideo(fx)) return null;
    const O = M.obstacles;
    const effets = etat.scenes.flatMap((sc) => sc.effets).filter(empileSurVideo);
    const anterieurs = O.effetsAnterieurs(effets.map((f) => ({ debut: f.debut, fin: finAffichage(f) })), effets.indexOf(fx)).map((j) => effets[j]);
    if (!anterieurs.length) return null;
    const U = GPUBufferUsage;
    const cumul = device.createBuffer({ size: O.MAX_VIDEO * O.CASES * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    anterieurs.forEach((f) => P.additionnerProfils(device, cumul, contribution(f, Math.min(finAffichage(f), fx.debut), device)));
    const couleur = couleurCouche(anterieurs);
    fx.table.entrees.forEach((e) => {
      if (e.profil === O.AUCUN || e.source.video === undefined) return;
      fx.couches.push({ debut: e.profil * O.CASES, genre: e.type, repere: O.repereFixe(e.source, fx.largeurCqh, fx.table.sol), couleur, flou: 0.6 });
    });
    const bases = device.createBuffer({ size: fx.table.tans.length * O.CASES * 4, usage: U.STORAGE | U.COPY_DST });
    const enc = device.createCommandEncoder();
    fx.table.entrees.forEach((e) => {
      if (e.profil !== O.AUCUN && e.source.video !== undefined) enc.copyBufferToBuffer(cumul, e.source.video * O.CASES * 4, bases, e.profil * O.CASES * 4, O.CASES * 4);
    });
    device.queue.submit([enc.finish()]);
    device.queue.onSubmittedWorkDone().then(() => cumul.destroy(), () => {});
    return bases;
  }

  /** Contribution d'un effet à l'instant t (fin de son affichage, ou début d'un effet qui hérite pendant qu'il est encore
   *  affiché) : ses sommes propres au dernier pas avant t, calculées une fois par instant. */
  function contribution(f, t, device) {
    if (!contributions.has(f)) contributions.set(f, new Map());
    const parInstant = contributions.get(f);
    if (parInstant.has(t)) return parInstant.get(t);
    const mesures = { scenes: new Set() };
    const m = monde(f);
    m.bases = basesPour(f, device);
    const sim = new P.Simulation(device, f.effet, m, f.fragments);
    sim.avancer(Math.max(0, (t - f.debut) * f.info.rythme - 1e-6), zonesDe(f, mesures));
    const c = sim.contributionVideo();
    sim.detruire();
    mesures.scenes.forEach((id) => M.rendreScene(id, etat.t));
    parInstant.set(t, c);
    return c;
  }

  // ---- Fragments (P4) ----

  /** Effet dont une recette photographie un élément (naissance sur les pixels, éclats, arrivée sur une cible). */
  function fragmente(fx) { return fx.effetOrigine.emetteurs.some((em) => em.fragment); }

  /** Élément visé par les émetteurs à cible : data-cible si l'un vise « cible », sinon l'ancre. */
  function elementVise(fx) {
    return fx.effetOrigine.emetteurs.some((em) => em.cible && em.cible.source === 'cible') ? fx.cible : fx.ancre;
  }

  function nomElement(el) { return el.id ? '#' + el.id : '<' + el.localName + '>'; }

  function hauteurSortie() { return HAUTEURS_SORTIE[M.donnees && M.donnees.format && M.donnees.format.ratio] || 1080; }

  /** Instant (s de la vidéo) borné à la scène de l'effet. */
  function dansScene(fx, t) { return Math.min(Math.max(t, fx.info.debut), fx.info.fin - 1e-6); }

  /** Photographie d'un élément à l'instant t : { photo, liste, densite, image? }, ou null si rien n'est visible. Gardée par
   *  élément, instant, densité ; densité multipliée par 4 tant qu'il y a plus de PIXELS_MAX pixels opaques (pas pour les
   *  éclats : leur nombre ne dépend pas des pixels). La classe du moteur est retirée le temps du figement.
   *  Boîte opaque : la photographie est recadrée sur ses pixels opaques (un titre en bloc a une boîte de toute la largeur
   *  de la scène pour quelques cqh de texte) ; si la boîte entière a été réduite par le plafond de COTE_MAX px, la boîte
   *  opaque (marge d'un pixel) est photographiée de nouveau à sa propre résolution, puis recadrée. */
  function photographier(el, t, densite, image) {
    const Fr = M.fragments;
    if (!etat.photos.has(el)) etat.photos.set(el, new Map());
    const parEl = etat.photos.get(el);
    const cle = t + '|' + densite + '|' + (image ? 1 : 0);
    if (parEl.has(cle)) return parEl.get(cle);
    const promesse = (async () => {
      const section = el.closest('#pm-scene > section');
      const id = section.getAttribute('data-scene');
      // Figement de l'élément à t (boîte en cqh, photographie de dims, ou de la zone en px CSS).
      const figer = async (dimsDe, zone) => {
        let attente = null;
        let taille = null;
        M.rendreScene(id, t);
        affichee(section, () => {
          const cachee = el.classList.contains(CACHE);
          el.classList.remove(CACHE);
          try {
            const h = Math.max(1, section.clientHeight);
            const b = M.figer.boite(el);
            taille = { largeurCqh: b.largeur * 100 / h, hauteurCqh: b.hauteur * 100 / h, pxCqh: 100 / h, largeurPx: b.largeur, hauteurPx: b.hauteur };
            const dims = dimsDe(taille);
            attente = M.figer.photo(el, zone ? Object.assign({ zone }, dims) : dims);
          } finally {
            if (cachee) el.classList.add(CACHE);
          }
        });
        M.rendreScene(id, etat.t);
        return { ph: await attente, taille };
      };
      let d = densite;
      for (;;) {
        const f0 = await figer((ta) => Fr.dimensionsPhoto(ta.largeurCqh, ta.hauteurCqh, hauteurSortie(), d));
        if (!f0.ph.largeur) return null;
        const ta = f0.taille;
        let photo = { largeur: f0.ph.largeur, hauteur: f0.ph.hauteur, rgba: f0.ph.rgba, largeurCqh: ta.largeurCqh, hauteurCqh: ta.hauteurCqh };
        const b0 = Fr.boiteOpaque(photo);
        if (!b0) return null;
        photo = Fr.recadrer(photo, b0);
        // Résolution voulue pour la boîte opaque, comparée à celle de la photographie de la boîte entière.
        const voulue = Fr.dimensionsPhoto(photo.largeurCqh, photo.hauteurCqh, hauteurSortie(), d);
        if (voulue.largeur > (b0.x1 - b0.x0) * 1.02 + 1 || voulue.hauteur > (b0.y1 - b0.y0) * 1.02 + 1) {
          const sx = ta.largeurPx / f0.ph.largeur;
          const sy = ta.hauteurPx / f0.ph.hauteur;
          const x0 = Math.max(0, (b0.x0 - 1) * sx);
          const y0 = Math.max(0, (b0.y0 - 1) * sy);
          const zone = { x: x0, y: y0, largeur: Math.min(ta.largeurPx, (b0.x1 + 1) * sx) - x0, hauteur: Math.min(ta.hauteurPx, (b0.y1 + 1) * sy) - y0 };
          const f1 = await figer((t1) => Fr.dimensionsPhoto(zone.largeur * t1.pxCqh, zone.hauteur * t1.pxCqh, hauteurSortie(), d), zone);
          const t1 = f1.taille;
          const zoom = { largeur: f1.ph.largeur, hauteur: f1.ph.hauteur, rgba: f1.ph.rgba, largeurCqh: zone.largeur * t1.pxCqh, hauteurCqh: zone.hauteur * t1.pxCqh,
            centre: [(zone.x + zone.largeur / 2 - t1.largeurPx / 2) * t1.pxCqh, (zone.y + zone.hauteur / 2 - t1.hauteurPx / 2) * t1.pxCqh] };
          const b1 = f1.ph.largeur ? Fr.boiteOpaque(zoom) : null;
          if (b1) photo = Fr.recadrer(zoom, b1);
        }
        const liste = Fr.listerPixels(photo);
        if (!liste.total) return null;
        if (!image && liste.total > Fr.PIXELS_MAX) { d *= 4; continue; }
        const bitmap = image ? await createImageBitmap(new ImageData(new Uint8ClampedArray(photo.rgba), photo.largeur, photo.hauteur)) : null;
        return { photo, liste, densite: d, image: bitmap };
      }
    })();
    parEl.set(cle, promesse);
    return promesse;
  }

  /** Problème de photographie : remonté au contrôle de la vidéo (photosVides) ; ancre vide : effet désactivé (panneau,
   *  l'élément reste affiché) ; photographie trop grande : alerte (panneau d'alerte de l'aperçu). */
  function signalerPhoto(fx, el, regle, texte) {
    const message = 'Scène « ' + fx.info.id + ' », effet « ' + fx.effetOrigine.nom + ' » : ' + texte;
    if (!etat.problemesPhotos.some((p) => p.message === message)) {
      etat.problemesPhotos.push({ scene: fx.info.id, element: el ? (el.id || el.localName) : null, regle, message });
    }
    if (regle === 'ancre-vide') desactiver(fx, message);
    else { alerter(message); panneauAlerte(fx.el, message); }
  }

  async function photoOuVide(fx, el, t, densite, image) {
    const r = el ? await photographier(el, t, densite, image) : null;
    if (!r) {
      const quand = String(Math.round(t * 100) / 100).replace('.', ',');
      signalerPhoto(fx, el, 'ancre-vide', 'rien à photographier : ' + (el ? '« ' + nomElement(el) + ' » n\'a aucun pixel visible' : 'aucun élément visé') +
        ' à ' + quand + ' s ; l\'effet n\'est pas affiché. Rendre l\'élément visible à cet instant (texte, couleur, image chargée), ou viser un autre élément.');
      return null;
    }
    if (r.densite > densite) {
      signalerPhoto(fx, el, 'photographie-trop-grande', '« ' + nomElement(el) + ' » a plus d\'un million de pixels opaques : densité portée à ' + r.densite + ' (une particule pour ' + r.densite + ' pixels).');
    }
    return r;
  }

  /** Repères de l'ancre et de l'élément visé au début de l'effet (appariement de Hilbert dans leur repère commun). */
  function reperesDebut(fx) {
    const id = fx.info.id;
    M.rendreScene(id, dansScene(fx, fx.debut));
    const elements = [fx.ancre, elementVise(fx) || fx.ancre];
    const r = affichee(fx.section, () => P.mesurerReperes(elements, fx.section));
    M.rendreScene(id, etat.t);
    return r;
  }

  /** Données de fragmentation d'un effet : photographies, listes (permutées par le pas premier, ou appariées le long d'une
   *  courbe de Hilbert), éclats ; nombre de particules fixé (fx.effet). false : rien à photographier (effet désactivé). */
  async function preparerFragmentsEffet(fx) {
    const Fr = M.fragments;
    const effet = fx.effetOrigine;
    const donnees = effet.emetteurs.map(() => null);
    const totaux = {};
    for (const em of effet.emetteurs) {
      if (!em.fragment) continue;
      const d = { a: null, b: null, eclats: null, image: null, demiA: [0, 0], demiB: [0, 0], centreA: [0, 0], centreB: [0, 0], coteA: 0, coteB: 0, nA: 0, nB: 0 };
      let A = null;
      let B = null;
      if (em.pixels || em.eclats) {
        const t = em.pixels && em.pixels.instant !== null ? fx.info.debut + em.pixels.instant : fx.debut;
        A = await photoOuVide(fx, fx.ancre, dansScene(fx, t), em.eclats ? 1 : em.pixels.densite, !!em.eclats);
        if (!A) return false;
        d.demiA = A.liste.demi;
        d.centreA = A.liste.centre;
        d.coteA = A.liste.cote;
        d.nA = A.liste.total;
      }
      if (em.cible) {
        const el = em.cible.source === 'cible' ? fx.cible : fx.ancre;
        B = await photoOuVide(fx, el, dansScene(fx, fx.debut + em.cible.a / fx.info.rythme), em.cible.densite, false);
        if (!B) return false;
        d.demiB = B.liste.demi;
        d.centreB = B.liste.centre;
        d.coteB = B.liste.cote;
        d.nB = B.liste.total;
      }
      if (em.eclats) {
        const graine = (effet.graine ^ Math.imul(em.index + 1, 0x9e3779b1)) >>> 0;
        d.eclats = Fr.eclats(Fr.voronoi({ largeur: A.photo.largeurCqh, hauteur: A.photo.hauteurCqh, morceaux: em.eclats.morceaux, graine, origine: em.eclats.origine, centre: A.photo.centre }));
        d.image = A.image;
      } else if (A && B) {
        const r0 = reperesDebut(fx);
        const [la, lb] = Fr.ordonnerHilbert([{ liste: A.liste, repere: r0[0] }, { liste: B.liste, repere: em.cible.source === 'cible' ? r0[1] : r0[0] }]);
        const ap = Fr.apparier(la, lb);
        d.a = ap.a;
        d.b = ap.b;
        totaux[em.index] = ap.total;
      } else if (A) {
        d.a = Fr.permuter(A.liste, Fr.pasPremier(A.liste.total, effet.graine)).donnees;
        totaux[em.index] = A.liste.total;
      } else {
        d.b = B.liste.donnees;
        totaux[em.index] = B.liste.total;
      }
      donnees[em.index] = d;
    }
    fx.fragments = donnees;
    fx.effet = Fr.ajusterCapacites(effet, totaux);
    return true;
  }

  async function preparerTousFragments() {
    for (const sc of etat.scenes) {
      for (const fx of sc.effets) {
        if (!fragmente(fx) || fx.fragments || fx.desactive) continue;
        try { await preparerFragmentsEffet(fx); } catch (e) { desactiver(fx, message(e)); }
      }
    }
  }

  /** Données des fragments de tous les effets, une fois (promesse partagée : contrôle de la vidéo et préparation du GPU),
   *  après la porte de disponibilité (temps SMIL, polices). */
  function fragmentsPromis() {
    if (!etat.promesseFragments) etat.promesseFragments = Promise.all([M.pret, polices()]).then(preparerTousFragments);
    return etat.promesseFragments;
  }

  /** Repères de l'ancre (ou de la balise) et de l'élément visé, scène rendue et affichée (zones.ancres). */
  function mesurerAncres(fx) {
    const O = M.obstacles;
    const t = new Float32Array(16);
    const a = fx.ancre || fx.el;
    const r = P.mesurerReperes([a, elementVise(fx) || a], fx.section);
    O.ecrireRepere(t, 0, r[0]);
    O.ecrireRepere(t, 8, r[1]);
    return t;
  }

  function ancresGrille(fx, g, mesures) {
    grille(fx, g, mesures);
    return fx.ancres.get(g);
  }

  /** Raccords (fonction de t) : un élément photographié est caché pendant que ses particules le remplacent (classe
   *  pm-fragment-cache) ; seulement si l'effet est affiché (GPU prêt, photographies faites, ni désactivé ni en échec),
   *  ou, dans la page de contrôle (photosVides appelé), dès que ses photographies sont faites, même sans GPU. */
  function raccorder(t) {
    const caches = new Set();
    const geres = new Set();
    etat.scenes.forEach((sc) => sc.effets.forEach((fx) => {
      if (!fragmente(fx)) return;
      [fx.ancre, fx.cible].forEach((el) => { if (el) geres.add(el); });
      if ((!etat.gpu && !etat.controle) || !fx.fragments || fx.desactive || sc.echec) return;
      const r = M.fragments.raccord(fx.effet, (t - fx.debut) * fx.info.rythme);
      if (r.ancre && fx.ancre) caches.add(fx.ancre);
      if (r.cible && fx.cible) caches.add(fx.cible);
    }));
    geres.forEach((el) => el.classList.toggle(CACHE, caches.has(el)));
  }


  /** Exécute fn avec la section affichée (une scène masquée à l'instant courant n'a pas de boîtes). */
  function affichee(section, fn) {
    const masquee = section.style.display === 'none';
    if (masquee) section.style.display = '';
    try { return fn(); } finally { if (masquee) section.style.display = 'none'; }
  }

  /** Repères de la table d'un effet à l'instant t (la scène de l'effet est déjà rendue à t). */
  function mesurerTable(fx, t, mesures) {
    const O = M.obstacles;
    const entrees = fx.table.entrees;
    const ligne = new Float32Array(entrees.length * O.REPERE);
    const visibles = M.scenesVisibles(M.minutage, t);
    const elements = [];
    const rangs = [];
    const voisines = new Map();
    entrees.forEach((e, i) => {
      const s = e.source;
      if (!s.element) { O.ecrireRepere(ligne, i * O.REPERE, O.repereFixe(s, fx.largeurCqh, fx.table.sol)); return; }
      const id = s.element.scene;
      if (s.voisin && visibles.indexOf(id) < 0) { O.ecrireRepere(ligne, i * O.REPERE, O.INACTIF); return; }
      if (s.voisin && !voisines.has(id)) {
        voisines.set(id, document.querySelector('#pm-scene > section[data-scene="' + CSS.escape(id) + '"]'));
        M.rendreScene(id, t);
        mesures.scenes.add(id);
      }
      elements.push(s.element.el);
      rangs.push(i);
    });
    if (elements.length) {
      const mesurer = () => P.mesurerReperes(elements, fx.section);
      // Sections voisines affichées le temps de la mesure (elles peuvent être masquées à l'instant courant).
      const cadres = Array.from(voisines.values()).reduce((fn, sec) => () => affichee(sec, fn), mesurer)();
      cadres.forEach((r, k) => O.ecrireRepere(ligne, rangs[k] * O.REPERE, r));
    }
    return ligne;
  }

  function mesurer(fx) {
    const s = fx.section.getBoundingClientRect();
    if (!s.height) return [0, 0, 0, 0];
    const r = (fx.ancre || fx.el).getBoundingClientRect();
    const k = 100 / s.height;
    return [(r.left - s.left) * k, (r.top - s.top) * k, r.width * k, r.height * k];
  }

  function instantGrille(fx, g) {
    const info = fx.info;
    return Math.min(Math.max(fx.debut + g / P.GRILLE / info.rythme, info.debut), info.fin - 1e-6);
  }

  /** Zone (et repères des obstacles, et des éléments photographiés) au point g de la grille (τ = g / 30), mesurés une fois
   *  en rendant la scène à cet instant. */
  function grille(fx, g, mesures) {
    let z = fx.zones.get(g);
    const avecReperes = !!(fx.table && fx.table.actif);
    const avecAncres = !!fx.fragments;
    if (!z || (avecReperes && !fx.reperes.has(g)) || (avecAncres && !fx.ancres.has(g))) {
      const t = instantGrille(fx, g);
      M.rendreScene(fx.info.id, t);
      mesures.scenes.add(fx.info.id);
      affichee(fx.section, () => {
        z = mesurer(fx);
        if (avecReperes) fx.reperes.set(g, mesurerTable(fx, t, mesures));
        if (avecAncres) fx.ancres.set(g, mesurerAncres(fx));
      });
      fx.zones.set(g, z);
    }
    return z;
  }

  function reperesGrille(fx, g, mesures) {
    grille(fx, g, mesures);
    return fx.reperes.get(g);
  }

  function zoneA(fx, tau, mesures) {
    const x = Math.max(0, tau) * P.GRILLE;
    const g = Math.floor(x);
    const f = x - g;
    const a = grille(fx, g, mesures);
    if (f === 0) return a;
    const b = grille(fx, g + 1, mesures);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
  }

  /** Fonctions de zone et de repères d'un effet, pour P.Simulation.avancer. */
  function zonesDe(fx, mesures) {
    return {
      a: (x) => zoneA(fx, x, mesures),
      grille: (g) => grille(fx, g, mesures),
      reperes: (g) => reperesGrille(fx, g, mesures),
      ancres: (g) => ancresGrille(fx, g, mesures),
    };
  }

  function ajuster(canvas, section) {
    // Export : un pixel de calque par pixel CSS, comme l'image capturée.
    const dpr = M.enCapture && M.enCapture() ? 1 : racine.devicePixelRatio || 1;
    const l = Math.max(1, Math.round(section.clientWidth * dpr));
    const h = Math.max(1, Math.round(section.clientHeight * dpr));
    if (canvas.width !== l) canvas.width = l;
    if (canvas.height !== h) canvas.height = h;
  }

  function message(e) { return String(e && e.message || e); }

  function liberer(fx) {
    if (!fx.sim) return;
    const sim = fx.sim;
    fx.sim = null;
    try { if (etat.rendu) etat.rendu.oublier(sim); } catch (e) { /* device déjà perdu */ }
    try { sim.detruire(); } catch (e) { /* device déjà perdu */ }
  }

  function rendre(t) {
    etat.t = t;
    raccorder(t);
    if (!etat.gpu) return;
    etat.rendu_t = t;
    const { device } = etat.gpu;
    etat.scenes.forEach((sc) => {
      if (sc.section.style.display === 'none') {
        sc.effets.forEach(liberer);
        Object.keys(sc.calques).forEach((nom) => etat.rendu.oublierCible(sc.calques[nom]));
        return;
      }
      if (sc.echec) return;
      try { rendreScene(sc, t, device); } catch (e) {
        sc.echec = message(e);
        console.error('[Pulse Motion] Effets de particules : ' + message(e));
        sc.effets.forEach((fx) => { liberer(fx); panneau(fx.el, 'Effet non affiché : ' + message(e)); });
      }
    });
    rendreComposition(t);
  }

  /** Effet désactivé (mémoire GPU insuffisante, texture illisible) : tampons libérés, panneau ; l'export le refuse. */
  function desactiver(fx, raison) {
    fx.desactive = raison;
    liberer(fx);
    console.error('[Pulse Motion] Effet de particules : ' + raison + '.');
    panneau(fx.el, 'Effet non affiché : ' + raison);
  }

  /** Fonds affichés à t (shader compilé, dans leur fenêtre) et repère de leur zone (ancre, ou balise), mesuré à t. */
  function fondsActifs(sc, t) {
    const actifs = sc.fonds.filter((f) => f.shader && t >= f.debut && t < f.fin);
    if (!actifs.length) return [];
    const reperes = P.mesurerReperes(actifs.map((f) => f.ancre || f.el), sc.section);
    return actifs.map((f, i) => ({ f, r: reperes[i], t })).filter((a) => a.r.actif);
  }

  /** Entrées d'un fond : τ depuis son début, part de sa fenêtre, zone (boîte de l'élément, échelle comprise) en cqh et en px. */
  function entreesFond(a, largeurCqh, canvas) {
    const { f, r } = a;
    const k = canvas.height / 100;
    return {
      temps: (a.t - f.debut) * f.info.rythme,
      progres: Math.min(1, Math.max(0, (a.t - f.debut) / Math.max(1e-6, f.fin - f.debut))),
      duree: (f.fin - f.debut) * f.info.rythme,
      mode: 0,
      resolution: [2 * r.demi[0], 2 * r.demi[1], 2 * r.demi[0] * k, 2 * r.demi[1] * k],
      scene: [largeurCqh, 100, canvas.width, canvas.height],
      repere: [r.centre[0], r.centre[1], r.angle, f.donnee.debord || 0],
      demi: [r.demi[0], r.demi[1], 0, 0],
    };
  }

  function rendreScene(sc, t, device) {
    const mesures = { scenes: new Set() };
    const listes = { arriere: [], avant: [] };
    const couches = { arriere: [], avant: [] };
    sc.effets.forEach((fx) => {
      const tau = (t - fx.debut) * fx.info.rythme;
      if (tau < 0 || tau >= fx.effet.fin) { liberer(fx); return; }
      if (fx.desactive) return;
      // Effet de fragmentation : seulement une fois ses photographies faites.
      if (fragmente(fx) && !fx.fragments) return;
      device.pushErrorScope('out-of-memory');
      try {
        if (!fx.sim) {
          const m = monde(fx);
          if (m) m.bases = basesPour(fx, device);
          fx.sim = new P.Simulation(device, fx.effet, m, fx.fragments);
          fx.sim.emetteurs.forEach((e) => etat.rendu.preparerEmetteur(e));
        }
        const deltas = fx.sim.avancer(tau, zonesDe(fx, mesures));
        deltas.forEach((delta, i) => { if (!fx.sim.emetteurs[i].inerte) listes[fx.calque].push({ sim: fx.sim, i, delta }); });
        if (fx.sim.hauteursBase) (fx.couches || []).forEach((k) => couches[fx.calque].push(Object.assign({ tampon: fx.sim.hauteursBase }, k)));
      } finally {
        device.popErrorScope().then((err) => { if (err) desactiver(fx, 'mémoire du GPU insuffisante'); }, () => {});
      }
    });
    // Toutes les scènes rendues à d'autres instants pour les mesures reviennent à t.
    mesures.scenes.forEach((id) => M.rendreScene(id, t));
    const largeurCqh = largeurScene();
    // Fonds mesurés après le retour de toutes les scènes à t.
    const fonds = fondsActifs(sc, t);
    Object.keys(sc.calques).forEach((nom) => {
      const canvas = sc.calques[nom];
      ajuster(canvas, sc.section);
      const rc = sc.reglages[nom];
      etat.rendu.dessiner(etat.rendu.cible(canvas), listes[nom], {
        largeurCqh, dureeImage: sc.info.rythme / (M.ips || 30), bloom: rc.bloom, seuil: rc.seuil_bloom, tons: rc.tons, couches: couches[nom],
        fonds: fonds.filter((a) => a.f.calque === nom).map((a) => (passe) => etat.shaders.dessiner(passe, a.f.shader, entreesFond(a, largeurCqh, canvas), null, 'fond')),
      });
    });
  }

  function erreurNonCapturee(ev) {
    const msg = message(ev && ev.error);
    console.error('[Pulse Motion] Erreur GPU : ' + msg);
    etat.scenes.forEach((sc) => {
      if (sc.section.style.display === 'none') return;
      sc.effets.forEach((fx) => panneau(fx.el, 'Effet non affiché : erreur GPU (' + msg + ')'));
    });
  }

  /** GPU, avec un délai de garde : au-delà, on passe au chemin « WebGPU indisponible ». */
  function obtenirAvecGarde() {
    return new Promise((resolve) => {
      let fini = false;
      const minuteur = setTimeout(() => { fini = true; resolve(null); }, GARDE_GPU);
      P.obtenirGPU().then((gpu) => {
        clearTimeout(minuteur);
        if (fini) { if (gpu) gpu.device.destroy(); return; }
        fini = true;
        resolve(gpu);
      }, (e) => {
        clearTimeout(minuteur);
        if (fini) return;
        fini = true;
        resolve({ erreur: e });
      });
    });
  }

  function polices() {
    const f = racine.document && document.fonts;
    return f && f.ready ? Promise.resolve(f.ready).catch(() => {}) : Promise.resolve();
  }

  /** Shaders de la page compilés sur le device (fonds ; transitions et post-traitements : composition). Une erreur : panneau,
   *  rien de dessiné, export refusé. -> compiler(donnee, surEchec) pour les autres usages. */
  async function compilerShaders(device) {
    etat.shaders = new P.Shaders(device);
    etat.erreursShaders = [];
    const compiler = async (donnee, surEchec) => {
      const r = await etat.shaders.compiler(donnee);
      if (r.ok) return r.shader;
      etat.erreursShaders.push({ nom: donnee.nom, usage: donnee.usage, scene: donnee.scene, message: r.message, erreurs: r.erreurs });
      console.error('[Pulse Motion] ' + r.message);
      surEchec(r.message);
      return null;
    };
    for (const sc of etat.scenes) {
      for (const f of sc.fonds) {
        f.erreur = null;
        f.shader = await compiler(f.donnee, (m) => { f.erreur = m; panneau(f.el, 'Fond non affiché : ' + m); });
      }
    }
    return compiler;
  }

  /** Panneau sur chaque balise d'effet ou de fond (WebGPU indisponible, erreur de préparation). */
  function panneauxTous(msg) {
    etat.scenes.forEach((sc) => {
      sc.effets.forEach((fx) => panneau(fx.el, msg));
      sc.fonds.forEach((f) => panneau(f.el, msg));
    });
  }

  // ---- Composition (P6) : transitions et post-traitements par shader, sur un canvas au-dessus des scènes ----

  const COMPOSE = 'pm-compose';
  const PERIODE_PHOTOS = 100; // ms : photographies de l'aperçu, 10 par seconde au plus pendant la lecture
  const comp = {
    transitions: new Map(), posts: new Map(), postsVideo: [], canvas: null,
    photos: new Map(), enCours: null, derniere: -Infinity, aRefaire: false, file: Promise.resolve(), faites: 0,
  };

  function compositionDeclaree() { return comp.transitions.size > 0 || comp.posts.size > 0 || comp.postsVideo.length > 0; }

  function recenserComposition() {
    (M.donnees.shaders || []).forEach((d) => {
      if (d.usage === 'transition') comp.transitions.set(d.scene, { donnee: d, shader: null });
      else if (d.usage === 'post') {
        const p = { donnee: d, shader: null };
        if (d.scene === null) comp.postsVideo.push(p);
        else {
          if (!comp.posts.has(d.scene)) comp.posts.set(d.scene, []);
          comp.posts.get(d.scene).push(p);
        }
      }
    });
    const parRang = (a, b) => a.donnee.rang - b.donnee.rang;
    comp.postsVideo.sort(parRang);
    comp.posts.forEach((l) => l.sort(parRang));
    return compositionDeclaree();
  }

  function sectionDe(id) { return document.querySelector('#pm-scene > section[data-scene="' + CSS.escape(id) + '"]'); }

  /** Transitions et post-traitements compilés (après les fonds) ; une erreur : panneau sur la scène, repli. */
  async function compilerComposition(compiler) {
    const sur = (id, prefixe) => (m) => { const s = id && sectionDe(id); if (s) panneau(s, prefixe + m); };
    for (const [id, tr] of comp.transitions) tr.shader = await compiler(tr.donnee, sur(id, 'Transition remplacée par un fondu : '));
    for (const [id, liste] of comp.posts) for (const p of liste) p.shader = await compiler(p.donnee, sur(id, 'Post-traitement non appliqué : '));
    const premiere = M.minutage.scenes.length ? M.minutage.scenes[0].id : null;
    for (const p of comp.postsVideo) p.shader = await compiler(p.donnee, sur(premiere, 'Post-traitement de la vidéo non appliqué : '));
  }

  M.transitionShader = (id) => !!(etat.gpu && comp.transitions.has(id) && comp.transitions.get(id).shader);

  function planA(t) {
    const transitions = {};
    comp.transitions.forEach((tr, id) => { if (tr.shader) transitions[id] = true; });
    const posts = {};
    comp.posts.forEach((l, id) => { posts[id] = l.filter((p) => p.shader).length; });
    return M.codeShader.planComposition({ scenes: M.minutage.scenes, t, transitions, posts, postsVideo: comp.postsVideo.filter((p) => p.shader).length });
  }

  function canvasComposition() {
    const scene = document.getElementById('pm-scene');
    if (!comp.canvas) {
      const c = document.createElement('canvas');
      c.className = 'pm-composition';
      c.setAttribute('aria-hidden', 'true');
      c.style.display = 'none';
      scene.appendChild(c);
      comp.canvas = c;
    }
    const dpr = M.enCapture && M.enCapture() ? 1 : racine.devicePixelRatio || 1;
    const l = Math.max(1, Math.round(scene.clientWidth * dpr));
    const h = Math.max(1, Math.round(scene.clientHeight * dpr));
    if (comp.canvas.width !== l) comp.canvas.width = l;
    if (comp.canvas.height !== h) comp.canvas.height = h;
    return comp.canvas;
  }

  function masquerComposition() {
    if (comp.canvas) comp.canvas.style.display = 'none';
    const scene = document.getElementById('pm-scene');
    if (scene) scene.classList.remove(COMPOSE);
  }

  /** Composition de t avec les photographies disponibles ; sans plan ou sans toutes ses photographies : masquée (les scènes
   *  réelles restent visibles). -> plan | null */
  function composer(t) {
    const plan = etat.gpu && etat.composition ? planA(t) : null;
    if (!plan || !plan.couches.every((id) => comp.photos.has(id))) { masquerComposition(); return plan; }
    const canvas = canvasComposition();
    const cible = etat.composition.cible(canvas);
    const largeurCqh = largeurScene();
    const plein = (temps, progres, duree) => ({ temps, progres, duree, mode: 1, resolution: [largeurCqh, 100, cible.largeur, cible.hauteur], scene: [largeurCqh, 100, cible.largeur, cible.hauteur] });
    const couches = plan.couches.map((id) => {
      const s = M.minutage.scenes.find((x) => x.id === id);
      const e = plein((t - s.debut) * s.rythme, Math.min(1, Math.max(0, (t - s.debut) / Math.max(1e-6, s.fin - s.debut))), (s.fin - s.debut) * s.rythme);
      return { vue: comp.photos.get(id).vue, posts: (comp.posts.get(id) || []).filter((p) => p.shader).map((p) => ({ shader: p.shader, entrees: e })) };
    });
    let transition = null;
    if (plan.transition) {
      const tr = plan.transition;
      transition = { shader: comp.transitions.get(tr.entrante).shader, entrees: plein(tr.temps, tr.progres, tr.duree),
        sortante: tr.sortante ? plan.couches.indexOf(tr.sortante) : -1, entrante: plan.couches.indexOf(tr.entrante) };
    }
    const ev = plein(t, Math.min(1, t / Math.max(1e-6, M.duree)), M.duree);
    etat.composition.dessiner(cible, { couches, transition, postsVideo: comp.postsVideo.filter((p) => p.shader).map((p) => ({ shader: p.shader, entrees: ev })) });
    canvas.style.display = '';
    document.getElementById('pm-scene').classList.add(COMPOSE);
    return plan;
  }

  /** Images des calques (particules, fonds) des scènes données, posées sur leurs canvas pour le figement (__pmImage). */
  async function imagesCalques(ids) {
    for (const sc of etat.scenes) {
      if (ids.indexOf(sc.info.id) < 0) continue;
      for (const nom of Object.keys(sc.calques)) {
        const canvas = sc.calques[nom];
        const cible = canvas.__pmCible;
        canvas.__pmImage = !etat.rendu || !cible ? null : cible.vide ? vide() : versDataURL(await etat.rendu.lirePixels(cible));
      }
    }
  }

  /** Photographies des scènes du plan dans leur état courant (pleine résolution si exact, sinon demi) ; figements
   *  synchrones ensemble (même instant), rastérisations ensuite. */
  async function photographierScenes(plan, t, exact) {
    const scene = document.getElementById('pm-scene');
    const dpr = M.enCapture && M.enCapture() ? 1 : racine.devicePixelRatio || 1;
    const k = exact ? 1 : 0.5;
    const L = Math.max(1, Math.round(scene.clientWidth * dpr * k));
    const H = Math.max(1, Math.round(scene.clientHeight * dpr * k));
    await imagesCalques(plan.couches);
    const promesses = plan.couches.map((id) => {
      const section = sectionDe(id);
      // Opacité de la transition CSS de la scène (fondu de repli compris), la règle pm-compose mise à part.
      const opacite = section.style.opacity === '' ? 1 : Number(section.style.opacity);
      return M.figer.photo(section, { largeur: L, hauteur: H, scene: { opacite } });
    });
    const photos = await Promise.all(promesses);
    for (let i = 0; i < photos.length; i++) {
      const ph = photos[i];
      if (!ph.largeur || !etat.composition) continue;
      const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(ph.rgba), ph.largeur, ph.hauteur));
      comp.photos.set(plan.couches[i], { vue: etat.composition.photo(plan.couches[i], bitmap), t, exact });
    }
    comp.faites++;
    const garder = new Set(plan.couches);
    Array.from(comp.photos.keys()).forEach((id) => { if (!garder.has(id)) comp.photos.delete(id); });
    if (etat.composition) etat.composition.oublierPhotos(garder);
  }

  /** Aperçu : composition redessinée à chaque image avec les dernières photographies ; nouvelles photographies
   *  (demi-résolution) au plus toutes les 100 ms pendant la lecture, à chaque image à l'arrêt ; une seule à la fois. */
  function rendreComposition(t) {
    if (!compositionDeclaree()) return;
    const plan = composer(t);
    if (!plan) return;
    // Export : les photographies exactes sont faites au seek (seekComposition), pas ici.
    if (M.enCapture && M.enCapture()) return;
    if (plan.couches.every((id) => comp.photos.has(id) && comp.photos.get(id).t === t)) return;
    if (comp.enCours) { comp.aRefaire = true; return; }
    if (M.enLecture && M.enLecture() && M.reel.now() - comp.derniere < PERIODE_PHOTOS) return;
    comp.aRefaire = false;
    comp.enCours = comp.file = comp.file.then(() => photographierScenes(plan, t, false)).then(() => {
      comp.enCours = null;
      comp.derniere = M.reel.now();
      if (etat.gpu) composer(etat.t);
      if (comp.aRefaire) { comp.aRefaire = false; rendreComposition(etat.t); }
    }, (e) => {
      comp.enCours = null;
      console.error('[Pulse Motion] Composition : ' + message(e));
    });
  }

  /** Seek (export, lecteur) : photographies faites à t (pleine résolution en capture), composition dessinée, GPU attendu. */
  async function seekComposition(t) {
    if (!compositionDeclaree() || !etat.gpu) return;
    const plan = planA(t);
    if (!plan) { masquerComposition(); return; }
    // Style d'entrée à jour : une transition par shader prête n'a pas de style CSS (le seek a pu rendre avant le GPU).
    plan.couches.forEach((id) => M.rendreScene(id, t));
    const exact = !!(M.enCapture && M.enCapture());
    const fait = comp.file.then(() => photographierScenes(plan, t, exact));
    comp.file = fait.catch(() => {});
    await fait;
    composer(t);
    await etat.gpu.device.queue.onSubmittedWorkDone();
  }

  /** Modules WGSL des recettes compilés une fois : un effet dont un module ne compile pas est désactivé ; export refusé. */
  async function verifierModules(rendu) {
    const echecs = await rendu.verifierModules(etat.scenes.flatMap((sc) => sc.effets.map((fx) => fx.effet)));
    etat.scenes.forEach((sc) => sc.effets.forEach((fx) => {
      const m = echecs.get(fx.effet);
      if (!m) return;
      etat.erreursShaders.push({ nom: fx.effet.nom, usage: 'module', scene: fx.info.id, message: m, erreurs: [] });
      desactiver(fx, m);
    }));
  }

  function demarrerGPU() {
    const obtention = obtenirAvecGarde();
    obtention.then((gpu) => {
      if (gpu && !gpu.erreur) return;
      const msg = gpu ? 'Effet non affiché : ' + message(gpu.erreur) : SANS_GPU;
      etat.disponible = false;
      etat.raison = msg;
      panneauxTous(msg);
    });
    // Aucune mesure d'ancre avant que la page soit prête : polices, temps SMIL, position du lecteur.
    etat.pret = Promise.all([obtention, M.pret, polices()]).then((r) => {
      const gpu = r[0];
      if (!gpu || gpu.erreur) return;
      const rendu = new P.Rendu(gpu.device, gpu.format);
      return rendu.preparer(etat.scenes.flatMap((sc) => sc.effets.map((fx) => fx.effet))).then((illisibles) => {
        etat.scenes.forEach((sc) => sc.effets.forEach((fx) => {
          if (fx.effet.emetteurs.some((em) => illisibles.has(em.rendu.textureImage))) desactiver(fx, 'texture illisible');
        }));
        return compilerShaders(gpu.device).then((compiler) => {
          etat.composition = new P.Composition(gpu.device, gpu.format, etat.shaders);
          return compilerComposition(compiler);
        }).then(() => verifierModules(rendu)).then(() => preparerFormes(gpu.device)).then(fragmentsPromis);
      }).then(() => {
        etat.gpu = gpu;
        etat.rendu = rendu;
        etat.disponible = true;
        etat.raison = null;
        gpu.device.onuncapturederror = erreurNonCapturee;
        gpu.device.lost.then(() => perdu(gpu));
        rendre(etat.t);
      });
    }).catch((e) => {
      etat.disponible = false;
      etat.raison = 'Effet non affiché : ' + message(e);
      panneauxTous(etat.raison);
    });
  }

  /** Perte du GPU : tout ce qui vivait sur l'ancien device est oublié, puis recréé. */
  function perdu(gpu) {
    if (etat.gpu !== gpu) return;
    etat.gpu = null;
    etat.rendu = null;
    etat.rendu_t = null;
    etat.disponible = false;
    etat.formes = null; // texture de l'ancien device ; les masques (processeur) sont gardés
    etat.shaders = null; // pipelines et uniformes de l'ancien device : recompilés par demarrerGPU
    etat.composition = null;
    comp.photos.clear();
    if (comp.canvas) delete comp.canvas.__pmCible;
    comp.transitions.forEach((tr) => { tr.shader = null; });
    comp.posts.forEach((l) => l.forEach((p) => { p.shader = null; }));
    comp.postsVideo.forEach((p) => { p.shader = null; });
    masquerComposition();
    etat.scenes.forEach((sc) => sc.fonds.forEach((f) => { f.shader = null; }));
    contributions.clear(); // tampons de l'ancien device
    etat.scenes.forEach((sc) => {
      sc.echec = false;
      sc.effets.forEach(liberer);
    });
    demarrerGPU();
  }

  /** Une police chargée après coup change les mesures et les masques des formes : on les refait. */
  function polices_changees() {
    if (!etat.gpu) return;
    const device = etat.gpu.device;
    etat.scenes.forEach((sc) => sc.effets.forEach((fx) => {
      fx.zones.clear(); fx.table = null; fx.reperes = new Map(); liberer(fx);
      // Photographies et données des fragments refaites avec les nouvelles polices.
      fx.fragments = null; fx.effet = fx.effetOrigine; fx.ancres = new Map();
    }));
    etat.masques = null;
    etat.promesseMasques = null;
    etat.photos = new Map();
    etat.promesseFragments = null;
    etat.problemesPhotos = [];
    etat.alertes = [];
    etat.scenes.forEach((sc) => sc.effets.forEach((fx) => fx.el.querySelectorAll(':scope > .pm-effet-alerte').forEach((d) => d.remove())));
    oublierContributions();
    // Une erreur ici ne doit pas laisser « pret » rejetée : les seeks l'attendent.
    etat.pret = preparerFormes(device).then(fragmentsPromis).then(() => {
      etat.rendu_t = null;
      rendre(etat.t);
    }).catch((e) => {
      console.error('[Pulse Motion] Effets de particules : ' + message(e));
      etat.scenes.forEach((sc) => sc.effets.forEach((fx) => panneau(fx.el, 'Effet non affiché : ' + message(e))));
    });
  }

  /** Seek : rend t et attend le GPU ; si le GPU est perdu entre-temps, recommence sur le nouveau. */
  async function seekGPU(t) {
    for (;;) {
      await etat.pret;
      const gpu = etat.gpu;
      if (!gpu) return null;
      if (etat.rendu_t !== t) rendre(t);
      let perte = false;
      try {
        await Promise.race([
          gpu.device.queue.onSubmittedWorkDone(),
          gpu.device.lost.then(() => { perte = true; }),
        ]);
      } catch (e) { perte = true; }
      if (!perte) await new Promise((ok) => setTimeout(ok, 0));
      if (!perte && etat.gpu === gpu) {
        await seekComposition(t);
        return null;
      }
      await gpu.device.lost;
    }
  }

  const SANS_GPU_EXPORT = 'Cette vidéo contient des effets de particules, qui demandent WebGPU : ouvrez l\'aperçu dans Chrome ou Edge récent pour l\'exporter.';
  const SANS_GPU_SHADERS = 'Cette vidéo contient des shaders (fonds, transitions, post-traitements), qui demandent WebGPU : ouvrez l\'aperçu dans Chrome ou Edge récent pour l\'exporter.';

  /** Vrai si la page a des calques (effets, fonds) ; la composition s'y ajoute au plan 5. */
  function aDuTravail() { return etat.scenes.length > 0 || compositionDeclaree(); }

  /** Pixels lus (prémultipliés) -> ImageData (non prémultipliée). */
  function versImageData(p) {
    const d = new Uint8ClampedArray(p.donnees.length);
    for (let i = 0; i < d.length; i += 4) {
      const a = p.donnees[i + 3];
      if (!a) continue;
      const k = 255 / a;
      d[i] = p.donnees[i] * k;
      d[i + 1] = p.donnees[i + 1] * k;
      d[i + 2] = p.donnees[i + 2] * k;
      d[i + 3] = a;
    }
    return new ImageData(d, p.largeur, p.hauteur);
  }

  function versDataURL(p) {
    const c = document.createElement('canvas');
    c.width = p.largeur;
    c.height = p.hauteur;
    c.getContext('2d').putImageData(versImageData(p), 0, 0);
    return c.toDataURL('image/png');
  }

  let imageVide = null;

  /** PNG transparent de 1 × 1 : calque où rien n'est dessiné (pas de relecture). */
  function vide() {
    if (!imageVide) {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      imageVide = c.toDataURL('image/png');
    }
    return imageVide;
  }

  function oublierImages() {
    etat.scenes.forEach((sc) => Object.keys(sc.calques).forEach((nom) => { sc.calques[nom].__pmImage = null; }));
    if (comp.canvas) comp.canvas.__pmImage = null;
  }

  function refuser(raison) {
    throw new Error('Effet de particules non rendu (' + raison + ') : export interrompu.');
  }

  /** Avant une capture foreignObject : l'image de chaque calque affiché, en PNG, sur son canvas.
   *  Pas de vidéo sans ses effets (spec §10) : en cas de refus, aucune image périmée ne reste. */
  async function preparerCapture() {
    if (!aDuTravail()) return;
    try {
      await etat.pret;
      if (!etat.gpu || !etat.rendu) refuser('WebGPU indisponible');
      // Un shader qui ne compile pas : pas de vidéo sans lui (spec P6 §5).
      if (etat.erreursShaders.length) refuser(etat.erreursShaders[0].message);
      // Après le travail soumis : les erreurs de mémoire de l'image courante sont connues.
      await etat.gpu.device.queue.onSubmittedWorkDone();
      const t = etat.t;
      for (const sc of etat.scenes) {
        if (sc.section.style.display === 'none') continue;
        if (sc.echec) refuser(sc.echec);
        sc.effets.forEach((fx) => {
          const tau = (t - fx.debut) * fx.info.rythme;
          if (fx.desactive && tau >= 0 && tau < fx.effet.fin) refuser(fx.desactive);
        });
      }
      for (const sc of etat.scenes) {
        for (const nom of Object.keys(sc.calques)) {
          const canvas = sc.calques[nom];
          const cible = canvas.__pmCible;
          if (sc.section.style.display === 'none' || !cible) canvas.__pmImage = null;
          else canvas.__pmImage = cible.vide ? vide() : versDataURL(await etat.rendu.lirePixels(cible));
        }
      }
      // Canvas de composition : son image, s'il est affiché (export rapide : copie figée de #pm-scene).
      if (comp.canvas) {
        comp.canvas.__pmImage = comp.canvas.style.display === 'none' || !comp.canvas.__pmCible || !etat.composition
          ? null : versDataURL(await etat.composition.lirePixels(comp.canvas.__pmCible));
      }
    } catch (e) {
      oublierImages();
      throw e;
    }
  }

  function trouver(idScene) { return etat.scenes.find((sc) => sc.info.id === idScene); }

  let fileRemplacements = Promise.resolve();

  async function remplacer(idScene, ordre, effet) {
    const sc = trouver(idScene);
    const fx = sc && sc.effets.find((f) => f.ordre === ordre);
    if (!fx) throw new Error('Effet ' + ordre + ' de la scène « ' + idScene + ' » introuvable (balise en erreur au chargement de la page ?).');
    await etat.pret;
    const gpu = etat.gpu;
    if (!gpu || !etat.rendu) throw new Error(etat.raison || SANS_GPU);
    const illisibles = await etat.rendu.preparer([effet]);
    if (effet.emetteurs.some((em) => illisibles.has(em.rendu.textureImage))) throw new Error('Effet non affiché : texture illisible.');
    const echecs = await etat.rendu.verifierModules([effet]);
    if (echecs.size) throw new Error('Effet non affiché : ' + echecs.get(effet));
    liberer(fx);
    fx.effet = effet;
    fx.effetOrigine = effet;
    fx.desactive = null;
    fx.zones = new Map(); // l'ancre a pu bouger (page d'atelier)
    fx.table = null;
    fx.reperes = new Map();
    fx.fragments = null;
    fx.ancres = new Map();
    if (fragmente(fx) && !(await preparerFragmentsEffet(fx))) throw new Error('Effet non affiché : rien à photographier (ancre vide).');
    // Les couches communes en dépendent : tous les effets repartent de contributions recalculées.
    oublierContributions();
    etat.scenes.forEach((s) => s.effets.forEach((f) => { if (f !== fx) liberer(f); }));
    fx.el.querySelectorAll(':scope > .pm-effet-panneau').forEach((p) => p.remove());
    sc.reglages[fx.calque] = reglagesCalque(sc.effets, fx.calque);
    sc.echec = false;
    etat.rendu_t = null;
    rendre(etat.t);
    await gpu.device.queue.onSubmittedWorkDone();
  }

  /** Remplacements servis un par un, dans l'ordre des appels : le dernier demandé est celui qui reste. */
  function remplacerEffet(idScene, ordre, effet) {
    const suite = fileRemplacements.then(() => remplacer(idScene, ordre, effet));
    fileRemplacements = suite.catch(() => {});
    return suite;
  }

  M.particules = {
    get pret() { return etat.pret; },
    get disponible() { return etat.disponible; },
    get device() { return etat.gpu ? etat.gpu.device : null; },
    get raison() { return etat.disponible ? null : etat.raison; },
    get alertes() { return etat.alertes.slice(); },
    /** Formes exactes au masque vide (contrôle de la vidéo, sans GPU) : [{ scene, element, message }]. */
    formesVides() {
      return masquesPromis().then((masques) => {
        const r = [];
        etat.obstacles.forEach((liste) => liste.forEach((d) => {
          if (d.genre === 'forme' && d.el && masques.has(d.index) && !masques.get(d.index)) r.push({ scene: d.scene, element: d.el.id || d.el.localName, message: messageFormeVide(d) });
        }));
        return r;
      });
    },
    /** Problèmes de photographie des effets de fragmentation (contrôle de la vidéo, sans GPU) : [{ scene, element, regle, message }]. */
    photosVides() {
      return fragmentsPromis().then(() => {
        etat.controle = true;
        raccorder(etat.t);
        return etat.problemesPhotos.map((p) => Object.assign({}, p));
      });
    },
    /** Données de fragments d'un effet (tests) : un élément par émetteur, null hors fragments ; null si non préparées. */
    donneesFragments(idScene, ordre) {
      const sc = trouver(idScene);
      const fx = sc && sc.effets.find((f) => f.ordre === ordre);
      return fx ? fx.fragments : null;
    },
    remplacerEffet,
    decrire(idScene) {
      const sc = trouver(idScene);
      return sc ? sc.effets.map((fx) => ({
        ordre: fx.ordre, calque: fx.calque, nom: fx.effet.nom, debut: fx.debut,
        fin: fx.debut + fx.effet.fin / fx.info.rythme, rythme: fx.info.rythme, actif: !!fx.sim, desactive: fx.desactive || null, collisions: !!(monde(fx) && fx.table.actif),
      })) : [];
    },
    lirePixels(idScene, calque) {
      const sc = trouver(idScene);
      const canvas = sc && sc.calques[calque];
      if (!canvas || !etat.rendu || !canvas.__pmCible) return Promise.reject(new Error('Calque « ' + calque + ' » de la scène « ' + idScene + ' » introuvable.'));
      return etat.rendu.lirePixels(canvas.__pmCible);
    },
    lireEtat(idScene, ordre, emetteur) {
      const sc = trouver(idScene);
      const fx = sc && sc.effets.find((f) => f.ordre === ordre);
      if (!fx || !fx.sim) return Promise.reject(new Error('Effet ' + ordre + ' de la scène « ' + idScene + ' » non simulé.'));
      return fx.sim.lireEtat(emetteur);
    },
    lireContacts(idScene, ordre, emetteur) {
      const sc = trouver(idScene);
      const fx = sc && sc.effets.find((f) => f.ordre === ordre);
      if (!fx || !fx.sim) return Promise.reject(new Error('Effet ' + ordre + ' de la scène « ' + idScene + ' » non simulé.'));
      return fx.sim.lireContacts(emetteur);
    },
    lireHauteurs(idScene, ordre) {
      const sc = trouver(idScene);
      const fx = sc && sc.effets.find((f) => f.ordre === ordre);
      if (!fx || !fx.sim) return Promise.reject(new Error('Effet ' + ordre + ' de la scène « ' + idScene + ' » non simulé.'));
      return fx.sim.lireHauteurs();
    },
    preparerCapture,
    image(idScene, calque) {
      return M.particules.lirePixels(idScene, calque).then((p) => createImageBitmap(versImageData(p)));
    },
    verifierExport() {
      if (!aDuTravail()) return Promise.resolve();
      return etat.pret.then(() => {
        if (!etat.disponible) throw new Error(etat.scenes.some((sc) => sc.effets.length) ? SANS_GPU_EXPORT : SANS_GPU_SHADERS);
        if (etat.erreursShaders.length) throw new Error('Export refusé : ' + etat.erreursShaders[0].message);
      });
    },
    lireOrdre(idScene, ordre, emetteur) {
      const sc = trouver(idScene);
      const fx = sc && sc.effets.find((f) => f.ordre === ordre);
      if (!fx || !fx.sim || !etat.rendu) return Promise.reject(new Error('Effet ' + ordre + ' de la scène « ' + idScene + ' » non dessiné.'));
      return etat.rendu.lireOrdre(fx.sim.emetteurs[emetteur]);
    },
  };

  M.shaders = {
    erreurs() { return etat.erreursShaders.map((e) => Object.assign({}, e)); },
    decrire(idScene) {
      const sc = trouver(idScene);
      return sc ? sc.fonds.map((f) => ({ ordre: f.ordre, nom: f.donnee.nom, calque: f.calque, debut: f.debut, fin: f.fin, actif: !!f.shader, erreur: f.erreur })) : [];
    },
    lireComposition() {
      if (!comp.canvas || comp.canvas.style.display === 'none' || !comp.canvas.__pmCible || !etat.composition) return Promise.reject(new Error('Composition non affichée.'));
      return etat.composition.lirePixels(comp.canvas.__pmCible);
    },
    composition() {
      return { photos: Array.from(comp.photos.entries()).map(([scene, p]) => ({ scene, t: p.t, exact: p.exact })), faites: comp.faites };
    },
    async regler(idScene, ordre, valeurs) {
      await etat.pret;
      const sc = trouver(idScene);
      const f = sc && sc.fonds.find((x) => x.ordre === ordre);
      if (!f || !f.shader || !etat.gpu) throw new Error('Fond ' + ordre + ' de la scène « ' + idScene + ' » non affiché (balise en erreur, ou shader qui ne compile pas).');
      etat.shaders.regler(f.shader, valeurs);
      etat.rendu_t = null;
      rendre(etat.t);
      await etat.gpu.device.queue.onSubmittedWorkDone();
    },
  };

  M.demarrerParticules = function () {
    etat.obstacles = recenserObstacles();
    etat.scenes = recenser();
    const avecComposition = recenserComposition();
    if (!etat.scenes.length && !avecComposition) return;
    M.surRendu(rendre);
    M.surSeek(seekGPU);
    if (racine.document && document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', polices_changees);
    etat.t = M.temps();
    demarrerGPU();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
