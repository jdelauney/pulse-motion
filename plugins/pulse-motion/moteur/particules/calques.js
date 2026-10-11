/* Pulse Motion – calques de particules : canvas par scène, horloge, minutage, ancres.
 *
 * M.demarrerParticules()   après M.demarrer() : canvas des calques, GPU, rendu à chaque image
 * M.particules.pret        Promise résolue quand le GPU est prêt ou absent (renouvelée après une perte)
 * M.particules.disponible  WebGPU utilisable
 * M.particules.lirePixels(idScene, calque) -> Promise<{ largeur, hauteur, donnees }>
 * M.particules.lireEtat(idScene, ordre, emetteur) -> Promise<Float32Array>
 *
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

  const etat = { gpu: null, rendu: null, scenes: [], t: 0, rendu_t: null, pret: Promise.resolve(), disponible: false };

  function panneau(el, message) {
    if (el.querySelector(':scope > .pm-effet-panneau')) return;
    const d = document.createElement('div');
    d.className = 'pm-effet-panneau';
    d.textContent = message;
    el.appendChild(d);
  }

  function recenser() {
    const scenes = [];
    M.minutage.scenes.forEach((info) => {
      const section = document.querySelector('#pm-scene > section[data-scene="' + CSS.escape(info.id) + '"]');
      if (!section) return;
      section.querySelectorAll('[data-pm-effet-erreur]').forEach((el) => panneau(el, el.getAttribute('data-pm-effet-erreur')));
      const effets = [];
      section.querySelectorAll('[data-pm-effet]').forEach((el) => {
        const d = (M.donnees.effets || [])[Number(el.getAttribute('data-pm-effet'))];
        if (!d) return;
        const temps = (M.minutage.elements[info.id] || {})[el.getAttribute('data-pm-cle')];
        effets.push({
          el, info, section,
          effet: d.effet,
          calque: d.calque,
          ancre: d.ancre ? section.querySelector('#' + CSS.escape(d.ancre)) : null,
          debut: temps ? temps.debut : info.debut,
          zones: new Map(),
          sim: null,
        });
      });
      if (!effets.length) return;
      const sc = { info, section, effets, calques: {} };
      CALQUES.forEach((nom) => {
        if (!effets.some((fx) => fx.calque === nom)) return;
        const canvas = document.createElement('canvas');
        canvas.className = 'pm-calque';
        canvas.setAttribute('data-pm-calque', nom);
        canvas.setAttribute('aria-hidden', 'true');
        section.appendChild(canvas);
        sc.calques[nom] = canvas;
      });
      scenes.push(sc);
    });
    return scenes;
  }

  function mesurer(fx) {
    const s = fx.section.getBoundingClientRect();
    if (!s.height) return [0, 0, 0, 0];
    const r = (fx.ancre || fx.el).getBoundingClientRect();
    const k = 100 / s.height;
    return [(r.left - s.left) * k, (r.top - s.top) * k, r.width * k, r.height * k];
  }

  /** Zone au point g de la grille (τ = g / 30), mesurée une fois en rendant la scène à cet instant. */
  function grille(fx, g, mesures) {
    let z = fx.zones.get(g);
    if (!z) {
      const info = fx.info;
      const t = Math.min(Math.max(fx.debut + g / P.GRILLE / info.rythme, info.debut), info.fin - 1e-6);
      M.rendreScene(info.id, t);
      z = mesurer(fx);
      fx.zones.set(g, z);
      mesures.faites = true;
    }
    return z;
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

  function ajuster(canvas, section) {
    const dpr = racine.devicePixelRatio || 1;
    const l = Math.max(1, Math.round(section.clientWidth * dpr));
    const h = Math.max(1, Math.round(section.clientHeight * dpr));
    if (canvas.width !== l) canvas.width = l;
    if (canvas.height !== h) canvas.height = h;
  }

  function rendre(t) {
    etat.t = t;
    if (!etat.gpu) return;
    etat.rendu_t = t;
    const { device } = etat.gpu;
    etat.scenes.forEach((sc) => {
      if (sc.section.style.display === 'none') return;
      if (sc.echec) return;
      try { rendreScene(sc, t, device); } catch (e) {
        sc.echec = true;
        console.error('[Pulse Motion] Effets de particules : ' + e.message);
        sc.effets.forEach((fx) => panneau(fx.el, 'Effet non affiché : ' + e.message));
      }
    });
  }

  function rendreScene(sc, t, device) {
    const mesures = { faites: false };
    const listes = { arriere: [], avant: [] };
    sc.effets.forEach((fx) => {
      const tau = (t - fx.debut) * fx.info.rythme;
      if (tau < 0 || tau >= fx.effet.fin) return;
      if (!fx.sim) fx.sim = new P.Simulation(device, fx.effet);
      const deltas = fx.sim.avancer(tau, { a: (x) => zoneA(fx, x, mesures), grille: (g) => grille(fx, g, mesures) });
      deltas.forEach((delta, i) => listes[fx.calque].push({ sim: fx.sim, i, delta }));
    });
    if (mesures.faites) M.rendreScene(sc.info.id, t);
    const largeurCqh = 100 * sc.section.clientWidth / Math.max(1, sc.section.clientHeight);
    Object.keys(sc.calques).forEach((nom) => {
      const canvas = sc.calques[nom];
      ajuster(canvas, sc.section);
      etat.rendu.dessiner(etat.rendu.cible(canvas), listes[nom], largeurCqh);
    });
  }

  function demarrerGPU() {
    etat.pret = P.obtenirGPU().then((gpu) => {
      if (!gpu) {
        etat.disponible = false;
        etat.scenes.forEach((sc) => sc.effets.forEach((fx) => panneau(fx.el, SANS_GPU)));
        return;
      }
      etat.gpu = gpu;
      etat.rendu = new P.Rendu(gpu.device, gpu.format);
      etat.disponible = true;
      gpu.device.lost.then(() => perdu(gpu));
      rendre(etat.t);
    }).catch((e) => {
      etat.disponible = false;
      etat.scenes.forEach((sc) => sc.effets.forEach((fx) => panneau(fx.el, 'Effet non affiché : ' + e.message)));
    });
  }

  /** Perte du GPU : tout ce qui vivait sur l'ancien device est oublié, puis recréé. */
  function perdu(gpu) {
    if (etat.gpu !== gpu) return;
    etat.gpu = null;
    etat.rendu = null;
    etat.rendu_t = null;
    etat.disponible = false;
    etat.scenes.forEach((sc) => sc.effets.forEach((fx) => { fx.sim = null; }));
    demarrerGPU();
  }

  function trouver(idScene) { return etat.scenes.find((sc) => sc.info.id === idScene); }

  M.particules = {
    get pret() { return etat.pret; },
    get disponible() { return etat.disponible; },
    get device() { return etat.gpu ? etat.gpu.device : null; },
    lirePixels(idScene, calque) {
      const sc = trouver(idScene);
      const canvas = sc && sc.calques[calque];
      if (!canvas || !etat.rendu || !canvas.__pmCible) return Promise.reject(new Error('Calque « ' + calque + ' » de la scène « ' + idScene + ' » introuvable.'));
      return etat.rendu.lirePixels(canvas.__pmCible);
    },
    lireEtat(idScene, ordre, emetteur) {
      const sc = trouver(idScene);
      const fx = sc && sc.effets[ordre];
      if (!fx || !fx.sim) return Promise.reject(new Error('Effet ' + ordre + ' de la scène « ' + idScene + ' » non simulé.'));
      return fx.sim.lireEtat(emetteur);
    },
  };

  M.demarrerParticules = function () {
    etat.scenes = recenser();
    if (!etat.scenes.length) return;
    M.surRendu(rendre);
    M.surSeek((t) => etat.pret.then(() => {
      if (!etat.gpu) return null;
      if (etat.rendu_t !== t) rendre(t);
      return etat.gpu.device.queue.onSubmittedWorkDone();
    }));
    etat.t = M.temps();
    demarrerGPU();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
