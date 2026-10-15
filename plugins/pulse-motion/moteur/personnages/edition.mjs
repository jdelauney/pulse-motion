/* Pulse Motion – atelier des personnages : modèle d'édition d'une pose ou d'un clip (pur, sans DOM).
 *
 *   const ed = creerEdition({ type: 'clip', nom: 'marche', objet, lu, gabarit }, { clips: M.clips, squelette: M.squelette });
 *   ed.aller(0.3); ed.regler('cuisseAvant', -30); ed.deplacerCle(1, 0.2); ed.annuler(); ed.versObjet();
 *
 * Unités des clés : phase dans [0, 1] pour un clip bouclé, secondes sinon ; `temps` est toujours en secondes.
 * Régler un angle dans un clip agit sur la clé de l'instant courant (créée au besoin, avec ce seul angle).
 * Clip « au-sol » : bassinY se lit et se règle comme le décalage de la piste. Clip additif : valeurs = différences.
 * Annulation : 100 pas ; un geste (debutGeste … finGeste) compte pour un seul pas.
 */
export const PAS_IMAGE = 1 / 25;
const EPS = 1e-3;
const clone = (x) => JSON.parse(JSON.stringify(x));
const arrondi = (v) => Math.round(v * 1000) / 1000;
const arrondis = (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, arrondi(v)]));

export function nouvelObjet(type) {
  if (type === 'pose') return { angles: {} };
  return { boucle: true, duree: 1, pieds: 'au-sol', cles: [{ t: 0, pose: 'debout' }] };
}

export function creerEdition(options, { clips: K, squelette: S }) {
  const lu = options.lu || { poses: {}, clips: {}, gabarits: {} };
  const type = options.type;
  let gabarit = options.gabarit || null;
  let objet = clone(options.objet || nouvelObjet(type));
  delete objet.nom;
  if (type === 'pose' && !objet.angles) objet.angles = {};
  let temps = 0;
  let selection = null;
  let passe = [];
  let futur = [];
  let geste = false;
  let gesteMemorise = false;
  let reference = JSON.stringify(objet);

  const estClip = () => type === 'clip';
  const auSol = () => estClip() && objet.pieds === 'au-sol' && !objet.additif;

  function memoriser() {
    if (geste) { if (gesteMemorise) return; gesteMemorise = true; }
    passe.push(JSON.stringify(objet));
    if (passe.length > 100) passe.shift();
    futur = [];
  }
  function trier() {
    const choisie = selection !== null ? objet.cles[selection] : null;
    objet.cles.sort((a, b) => a.t - b.t);
    selection = choisie ? objet.cles.indexOf(choisie) : null;
  }
  const position = () => (estClip() ? K.position(objet, temps) : 0);
  const versTemps = (u) => (estClip() && objet.boucle ? u * objet.duree : u);
  const cleSous = (u) => (estClip() ? objet.cles.findIndex((c) => Math.abs(c.t - u) < EPS) : -1);
  const libre = (u, sauf) => objet.cles.every((c, i) => i === sauf || Math.abs(c.t - u) >= EPS);
  const borner = (u) => (objet.boucle ? Math.min(1, Math.max(0, u)) : Math.max(0, u));
  /** Valeurs des pistes à l'instant t, sans pose au sol (bassinY = décalage). */
  const pistesEn = (t) => (estClip() ? K.echantillonner(Object.assign({}, objet, { pieds: 'libres' }), t, lu, gabarit) : Object.assign({}, objet.angles));

  function poseEn(t) {
    if (!estClip()) return Object.assign({}, S.REPOS, objet.angles);
    if (objet.additif) return K.ajouter(Object.assign({}, S.REPOS), objet, t, lu);
    return Object.assign({}, S.REPOS, K.echantillonner(objet, t, lu, gabarit));
  }

  const ed = {
    nom: options.nom || '',
    get type() { return type; },
    get objet() { return objet; },
    get temps() { return temps; },
    get selection() { return selection; },
    get gabarit() { return gabarit; },
    changerGabarit(g) { gabarit = g || null; },
    unite: () => (estClip() && objet.boucle ? 'phase' : 's'),
    duree: () => (estClip() ? K.duree(objet) : 0),
    longueurFrise: () => (!estClip() || objet.boucle ? 1 : Math.max(1, K.duree(objet) + 0.5)),
    position,
    cleSous,
    voisines() {
      if (!estClip()) return [null, null];
      const u = position();
      const ts = objet.cles.map((c) => c.t).filter((t) => Math.abs(t - u) >= EPS);
      let avant = Math.max(...ts.filter((t) => t < u));
      let apres = Math.min(...ts.filter((t) => t > u));
      if (objet.boucle) {
        if (!Number.isFinite(avant) && ts.length) avant = Math.max(...ts);
        if (!Number.isFinite(apres) && ts.length) apres = Math.min(...ts);
      }
      return [Number.isFinite(avant) ? avant : null, Number.isFinite(apres) ? apres : null];
    },
    pose: () => poseEn(temps),
    poseEn,
    poseA: (u) => poseEn(versTemps(u)),
    valeurs() {
      if (!estClip()) return poseEn(0);
      if (objet.additif) return pistesEn(temps);
      const v = poseEn(temps);
      if (auSol()) v.bassinY = pistesEn(temps).bassinY || 0;
      return v;
    },
    modifie: () => JSON.stringify(objet) !== reference,
    marquerEnregistre() { reference = JSON.stringify(objet); },
    aller(t) { temps = estClip() && !objet.boucle ? Math.max(0, t) : t; },
    allerA(u) { this.aller(versTemps(u)); },
    avancer(dt) { this.aller(temps + dt); },
    selectionner(i) { selection = i; },
    debutGeste() { geste = true; gesteMemorise = false; },
    finGeste() { geste = false; gesteMemorise = false; },
    regler(angle, valeur) { this.reglerPlusieurs({ [angle]: valeur }); },
    reglerPlusieurs(angles) {
      memoriser();
      if (!estClip()) { Object.assign(objet.angles, arrondis(angles)); return; }
      const u = arrondi(position());
      let i = cleSous(u);
      if (i < 0) { objet.cles.push({ t: u, angles: {} }); selection = objet.cles.length - 1; trier(); i = selection; }
      const c = objet.cles[i];
      c.angles = Object.assign(c.angles || {}, arrondis(angles));
      selection = i;
    },
    ajouterCle() {
      const u = arrondi(position());
      const deja = cleSous(u);
      if (deja >= 0) { selection = deja; return deja; }
      memoriser();
      const valeurs = pistesEn(temps);
      const angles = {};
      for (const n of Object.keys(K.pistes(objet, lu))) if (typeof valeurs[n] === 'number') angles[n] = arrondi(valeurs[n]);
      objet.cles.push({ t: u, angles });
      selection = objet.cles.length - 1;
      trier();
      return selection;
    },
    deplacerCle(i, u) {
      const v = arrondi(borner(u));
      if (!objet.cles[i] || !libre(v, i)) return false;
      memoriser();
      objet.cles[i].t = v;
      selection = i;
      trier();
      return true;
    },
    dupliquerCle(i, u) {
      const v = arrondi(borner(u));
      if (!objet.cles[i] || !libre(v, -1)) return -1;
      memoriser();
      const copie = Object.assign(clone(objet.cles[i]), { t: v });
      objet.cles.push(copie);
      selection = objet.cles.length - 1;
      trier();
      return selection;
    },
    supprimerCle(i) {
      if (!objet.cles[i] || objet.cles.length <= 1) return false;
      memoriser();
      objet.cles.splice(i, 1);
      selection = null;
      return true;
    },
    courbe(i, nom) {
      if (!objet.cles[i]) return;
      memoriser();
      if (!nom || nom === 'sine-inout') delete objet.cles[i].courbe;
      else objet.cles[i].courbe = nom;
    },
    poserPose(nom) {
      if (!lu.poses[nom]) throw new Error(`Atelier : pose « ${nom} » introuvable.`);
      if (estClip() && objet.additif) throw new Error('Atelier : un calque additif ne cite pas de pose (ses valeurs sont des différences).');
      memoriser();
      if (!estClip()) { objet.angles = clone(lu.poses[nom].angles || {}); return; }
      const u = arrondi(position());
      const i = cleSous(u);
      if (i < 0) { objet.cles.push({ t: u, pose: nom }); selection = objet.cles.length - 1; trier(); return; }
      objet.cles[i] = { t: objet.cles[i].t, pose: nom, ...(objet.cles[i].courbe ? { courbe: objet.cles[i].courbe } : {}) };
      selection = i;
    },
    proprietes(ch) {
      const avant = JSON.stringify(objet);
      if (estClip() && ch.boucle !== undefined && ch.boucle !== objet.boucle) {
        if (ch.boucle === false) {
          const d = objet.duree || 1;
          objet.cles.forEach((c) => { c.t = arrondi(c.t * d); });
          delete objet.duree; delete objet.miroir;
        } else {
          const fin = objet.cles.length ? objet.cles[objet.cles.length - 1].t : 0;
          const d = fin > 0 ? fin : 1;
          objet.cles.forEach((c) => { c.t = arrondi(c.t / d); });
          objet.duree = arrondi(d);
        }
        objet.boucle = ch.boucle;
      }
      for (const k of ['duree', 'foulee', 'pieds', 'miroir', 'additif', 'description']) {
        if (!(k in ch) || (k !== 'description' && !estClip())) continue;
        if (ch[k] === null || ch[k] === '') delete objet[k];
        else objet[k] = ch[k];
      }
      // Un pas d'annulation seulement si quelque chose a changé.
      if (JSON.stringify(objet) !== avant && !(geste && gesteMemorise)) {
        passe.push(avant);
        if (passe.length > 100) passe.shift();
        futur = [];
        if (geste) gesteMemorise = true;
      }
    },
    annuler() {
      if (!passe.length) return false;
      futur.push(JSON.stringify(objet));
      objet = JSON.parse(passe.pop());
      selection = null;
      return true;
    },
    retablir() {
      if (!futur.length) return false;
      passe.push(JSON.stringify(objet));
      objet = JSON.parse(futur.pop());
      selection = null;
      return true;
    },
    versObjet() {
      const o = clone(objet);
      delete o.nom;
      if (Array.isArray(o.cles)) { o.cles.sort((a, b) => a.t - b.t); o.cles.forEach((c) => { c.t = arrondi(c.t); }); }
      return o;
    },
  };
  return ed;
}
