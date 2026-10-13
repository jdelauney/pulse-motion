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
 * Collisions (P3) : chaque effet dont une recette a « collisions » reçoit la table de ses obstacles (bords, éléments
 * data-obstacle et formes de sa scène, éléments data-obstacle="video" des scènes voisines, obstacles du déroulé) ;
 * leurs repères sont mesurés avec la zone d'émission à chaque point de la grille (P.mesurerReperes), les scènes voisines
 * rendues à cet instant si elles sont visibles ; toutes les scènes rendues pour une mesure sont rendues de nouveau à t.
 * M.particules.remplacerEffet(idScene, ordre, effet) -> Promise   atelier : la recette compilée d'un effet remplacée,
 *   simulation recréée, instant courant rendu ; appels servis dans l'ordre ; rejette si l'effet n'a pas de simulation
 *   (balise en erreur), si WebGPU manque ou si une texture est illisible
 * M.particules.decrire(idScene) -> [{ ordre, calque, nom, debut, fin, rythme, actif, desactive, collisions }]   fenêtres (atelier)
 * M.particules.raison      message du moteur quand WebGPU est indisponible (null sinon)
 * ordre : rang de la balise parmi les data-effet de la scène, effets en erreur compris (comme l'assemblage).
 *
 * Réglages d'un calque (bloom, seuil, tons) : ceux de la recette au bloom le plus fort parmi tous les
 * effets du calque dans la scène (constants pour la scène ; à égalité, le premier).
 * Scène masquée : simulations et cible de rendu libérées, recréées au retour.
 * Zone d'émission : boîte de l'ancre (ou de la balise data-effet) relative à la scène, en cqh,
 * mesurée sur une grille de 30 points par seconde de τ en rendant la scène à ces instants
 * (M.rendreScene) : elle ne dépend que de τ, jamais du chemin suivi pour arriver à t.
 * Navigateur seulement ; dépend de horloge, gpu, simulation, rendu.
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};
  const CALQUES = ['arriere', 'avant'];
  const SANS_GPU = 'Effet non affiché : WebGPU indisponible. Ouvrez la vidéo dans Chrome ou Edge récent.';

  const GARDE_GPU = 10000;
  const etat = { gpu: null, rendu: null, scenes: [], obstacles: new Map(), t: 0, rendu_t: null, pret: Promise.resolve(), disponible: false, raison: null };

  function panneau(el, message) {
    if (el.querySelector(':scope > .pm-effet-panneau')) return;
    const d = document.createElement('div');
    d.className = 'pm-effet-panneau';
    d.textContent = message;
    el.appendChild(d);
  }

  /** Réglages d'un calque : ceux de la recette au bloom le plus fort parmi ses effets (à égalité, le premier). */
  function reglagesCalque(effets, nom) {
    let rc = null;
    effets.forEach((fx) => { if (fx.calque === nom && (!rc || fx.effet.rendu_calque.bloom > rc.bloom)) rc = fx.effet.rendu_calque; });
    return rc;
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
          debut: temps ? temps.debut : info.debut,
          zones: new Map(),
          sim: null,
          table: null,
          reperes: new Map(),
          largeurCqh: 0,
        });
      });
      if (!effets.length) return;
      const sc = { info, section, effets, calques: {}, reglages: {} };
      CALQUES.forEach((nom) => {
        if (!effets.some((fx) => fx.calque === nom)) return;
        sc.reglages[nom] = reglagesCalque(effets, nom);
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
      fx.largeurCqh = 100 * fx.section.clientWidth / Math.max(1, fx.section.clientHeight);
      fx.table = O.construireTable({ largeurCqh: fx.largeurCqh, solRecette: O.solDe(fx.effet), propres, voisins, video: M.donnees.obstaclesVideo || [] });
      fx.reperes = new Map();
    }
    return { entrees: fx.table.entrees, largeurCqh: fx.largeurCqh, actif: fx.table.actif };
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

  /** Zone (et repères des obstacles) au point g de la grille (τ = g / 30), mesurés une fois en rendant la scène à cet instant. */
  function grille(fx, g, mesures) {
    let z = fx.zones.get(g);
    const avecReperes = !!(fx.table && fx.table.actif);
    if (!z || (avecReperes && !fx.reperes.has(g))) {
      const t = instantGrille(fx, g);
      M.rendreScene(fx.info.id, t);
      mesures.scenes.add(fx.info.id);
      affichee(fx.section, () => {
        z = mesurer(fx);
        if (avecReperes) fx.reperes.set(g, mesurerTable(fx, t, mesures));
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
  }

  /** Effet désactivé (mémoire GPU insuffisante, texture illisible) : tampons libérés, panneau ; l'export le refuse. */
  function desactiver(fx, raison) {
    fx.desactive = raison;
    liberer(fx);
    console.error('[Pulse Motion] Effet de particules : ' + raison + '.');
    panneau(fx.el, 'Effet non affiché : ' + raison);
  }

  function rendreScene(sc, t, device) {
    const mesures = { scenes: new Set() };
    const listes = { arriere: [], avant: [] };
    sc.effets.forEach((fx) => {
      const tau = (t - fx.debut) * fx.info.rythme;
      if (tau < 0 || tau >= fx.effet.fin) { liberer(fx); return; }
      if (fx.desactive) return;
      device.pushErrorScope('out-of-memory');
      try {
        if (!fx.sim) {
          fx.sim = new P.Simulation(device, fx.effet, monde(fx));
          fx.sim.emetteurs.forEach((e) => etat.rendu.preparerEmetteur(e));
        }
        const deltas = fx.sim.avancer(tau, zonesDe(fx, mesures));
        deltas.forEach((delta, i) => listes[fx.calque].push({ sim: fx.sim, i, delta }));
      } finally {
        device.popErrorScope().then((err) => { if (err) desactiver(fx, 'mémoire du GPU insuffisante'); }, () => {});
      }
    });
    // Toutes les scènes rendues à d'autres instants pour les mesures reviennent à t.
    mesures.scenes.forEach((id) => M.rendreScene(id, t));
    const largeurCqh = 100 * sc.section.clientWidth / Math.max(1, sc.section.clientHeight);
    Object.keys(sc.calques).forEach((nom) => {
      const canvas = sc.calques[nom];
      ajuster(canvas, sc.section);
      const rc = sc.reglages[nom];
      etat.rendu.dessiner(etat.rendu.cible(canvas), listes[nom], {
        largeurCqh, dureeImage: sc.info.rythme / (M.ips || 30), bloom: rc.bloom, seuil: rc.seuil_bloom, tons: rc.tons,
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

  function demarrerGPU() {
    const obtention = obtenirAvecGarde();
    obtention.then((gpu) => {
      if (gpu && !gpu.erreur) return;
      const msg = gpu ? 'Effet non affiché : ' + message(gpu.erreur) : SANS_GPU;
      etat.disponible = false;
      etat.raison = msg;
      etat.scenes.forEach((sc) => sc.effets.forEach((fx) => panneau(fx.el, msg)));
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
      etat.scenes.forEach((sc) => sc.effets.forEach((fx) => panneau(fx.el, etat.raison)));
    });
  }

  /** Perte du GPU : tout ce qui vivait sur l'ancien device est oublié, puis recréé. */
  function perdu(gpu) {
    if (etat.gpu !== gpu) return;
    etat.gpu = null;
    etat.rendu = null;
    etat.rendu_t = null;
    etat.disponible = false;
    etat.scenes.forEach((sc) => {
      sc.echec = false;
      sc.effets.forEach(liberer);
    });
    demarrerGPU();
  }

  /** Une police chargée après coup change les mesures : on les refait. */
  function polices_changees() {
    if (!etat.gpu) return;
    etat.scenes.forEach((sc) => sc.effets.forEach((fx) => { fx.zones.clear(); fx.table = null; fx.reperes = new Map(); liberer(fx); }));
    etat.rendu_t = null;
    rendre(etat.t);
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
      if (!perte && etat.gpu === gpu) return null;
      await gpu.device.lost;
    }
  }

  const SANS_GPU_EXPORT = 'Cette vidéo contient des effets de particules, qui demandent WebGPU : ouvrez l\'aperçu dans Chrome ou Edge récent pour l\'exporter.';

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
  }

  function refuser(raison) {
    throw new Error('Effet de particules non rendu (' + raison + ') : export interrompu.');
  }

  /** Avant une capture foreignObject : l'image de chaque calque affiché, en PNG, sur son canvas.
   *  Pas de vidéo sans ses effets (spec §10) : en cas de refus, aucune image périmée ne reste. */
  async function preparerCapture() {
    if (!etat.scenes.length) return;
    try {
      await etat.pret;
      if (!etat.gpu || !etat.rendu) refuser('WebGPU indisponible');
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
    liberer(fx);
    fx.effet = effet;
    fx.desactive = null;
    fx.zones = new Map(); // l'ancre a pu bouger (page d'atelier)
    fx.table = null;
    fx.reperes = new Map();
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
    preparerCapture,
    image(idScene, calque) {
      return M.particules.lirePixels(idScene, calque).then((p) => createImageBitmap(versImageData(p)));
    },
    verifierExport() {
      if (!etat.scenes.length) return Promise.resolve();
      return etat.pret.then(() => { if (!etat.disponible) throw new Error(SANS_GPU_EXPORT); });
    },
    lireOrdre(idScene, ordre, emetteur) {
      const sc = trouver(idScene);
      const fx = sc && sc.effets.find((f) => f.ordre === ordre);
      if (!fx || !fx.sim || !etat.rendu) return Promise.reject(new Error('Effet ' + ordre + ' de la scène « ' + idScene + ' » non dessiné.'));
      return etat.rendu.lireOrdre(fx.sim.emetteurs[emetteur]);
    },
  };

  M.demarrerParticules = function () {
    etat.obstacles = recenserObstacles();
    etat.scenes = recenser();
    if (!etat.scenes.length) return;
    M.surRendu(rendre);
    M.surSeek(seekGPU);
    if (racine.document && document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', polices_changees);
    etat.t = M.temps();
    demarrerGPU();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
