/* Pulse Motion – panneau « Effets » de l'aperçu (servi par /_pm/atelier/panneau.mjs, jamais dans la page livrée).
 *
 * Bouton « Effets » dans le lecteur (pages avec des effets de particules) : effets de la scène courante (ou clic sur
 * l'image près d'un effet), réglages exposés en curseurs, graine, niveau avancé (toute la recette), boucle de lecture
 * sur la fenêtre de l'effet. Chaque changement recompile la recette dans la page (au plus toutes les 100 ms) et
 * remplace la seule simulation de l'effet (M.particules.remplacerEffet) : l'image change à la position courante, sans
 * rechargement ; une recette invalide marque le champ en cause et l'image garde le dernier état valide.
 * « Enregistrer » écrit data-reglages et data-graine dans la scène ; « Enregistrer comme nouvel effet » écrit
 * effets/<nom>.json (par etend) et y fait pointer la balise. L'aperçu recharge alors la page : le panneau rouvre sur
 * le même effet (sessionStorage). Tant qu'un réglage n'est pas enregistré, la page n'est pas rechargée (M.atelier.occupe).
 * Fonds par shader (P6) : les balises data-shader de la scène sont listées sous les effets ; un fond choisi montre les curseurs
 * de ses réglages (son .json) ; chaque changement est contrôlé (M.codeShader.valeursShader) puis réécrit dans son uniforme
 * (M.shaders.regler), sans recompiler ni recharger ; « Enregistrer » écrit data-reglages (/_pm/atelier/reglages-shader).
 * Pour les tests : M.atelier.choisirFond(ordre, scene?), reglerFond(nom, valeur), enregistrerFond().
 * Pour les tests : M.atelier = { ouvrir, fermer, choisir, regler, retablir, graine, niveau, modifierRecette,
 *   enregistrer, enregistrerComme, occupe, etat, pret }.
 */
import { construireFormulaire, construireReglages, reglagesEnTexte, limiter, compilerPourPage, el } from './editeur.mjs';

const M = globalThis.M;
const CLE = 'pm-atelier';
const DELAI = 100;
const CHARTE = ['primaire', 'accent', 'texte', 'fond'];

let donnees = null;        // /_pm/atelier/scenes, lu au chargement de la page : { charte, scenes }
let panneau = null;
let formulaire = null;
let reglagesUI = null;
let derniere = Promise.resolve();
const textures = new Map();
const etat = {
  ouvert: false, scene: null, ordre: null, niveau: 'simple', genre: 'effet',
  valeurs: {}, graine: 0, graineEcrite: false, graineChangee: false,
  recette: null, recetteModifiee: false, modifie: false,
  erreurs: [], message: '', conflit: false, enCours: false,
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const occupe = () => etat.ouvert && (etat.modifie || etat.enCours);

async function chargerDonnees() {
  try {
    const r = await fetch('/_pm/atelier/scenes', { cache: 'no-store' });
    donnees = r.ok ? await r.json() : { charte: {}, scenes: [] };
  } catch (e) { donnees = { charte: {}, scenes: [] }; }
  for (const d of (M.donnees && M.donnees.effets) || []) {
    for (const em of d.effet.emetteurs) if (em.rendu.textureFichier && em.rendu.textureImage) textures.set(em.rendu.textureFichier, em.rendu.textureImage);
  }
}

function sceneCourante() {
  const t = M.temps();
  let id = M.minutage.scenes.length ? M.minutage.scenes[0].id : null;
  M.minutage.scenes.forEach((s) => { if (t >= s.debut) id = s.id; });
  return id;
}
const sceneDe = (id) => (donnees && donnees.scenes.find((s) => s.id === id)) || null;
const effetDe = (id, ordre) => { const s = sceneDe(id); return s ? s.effets.find((e) => e.ordre === ordre) || null : null; };
const fondDe = (id, ordre) => { const s = sceneDe(id); return s ? (s.shaders || []).find((f) => f.ordre === ordre) || null : null; };

function memoriser() {
  try {
    if (etat.ouvert) sessionStorage.setItem(CLE, JSON.stringify({ ouvert: true, scene: etat.scene, ordre: etat.ordre, niveau: etat.niveau, genre: etat.genre }));
    else sessionStorage.removeItem(CLE);
  } catch (e) { /* stockage indisponible */ }
}

function dire(message) {
  etat.message = message;
  if (!panneau) return;
  const p = panneau.querySelector('.pm-at-message');
  p.textContent = message;
  if (etat.conflit) {
    const b = el('button', { type: 'button', 'data-action': 'recharger', texte: 'Recharger la page' }, p);
    b.style.marginLeft = '8px';
    b.addEventListener('click', () => { etat.modifie = false; M.recharger(); });
  }
}

function construire() {
  if (panneau) return;
  panneau = el('div', { id: 'pm-atelier', role: 'dialog', 'aria-label': 'Effets de particules' }, document.body);
  panneau.style.cssText = 'position:fixed;inset:16px 16px 64px auto;z-index:30;width:380px;overflow:auto;padding:12px 14px;border-radius:10px;'
    + 'background:#1b1b1b;color:#eee;font:14px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgb(0 0 0/.45)';
  const tete = el('div', {}, panneau);
  tete.style.cssText = 'display:flex;justify-content:space-between;align-items:center';
  el('strong', { texte: 'Effets' }, tete);
  el('button', { type: 'button', 'data-action': 'fermer', texte: 'Fermer' }, tete).addEventListener('click', () => fermer());
  el('p', { class: 'pm-at-message', 'aria-live': 'polite' }, panneau).style.cssText = 'margin:8px 0;color:#ffcc80';
  el('div', { class: 'pm-at-liste' }, panneau);
  el('div', { class: 'pm-at-effet' }, panneau);
}

function afficherListe() {
  if (!panneau) return;
  const zone = panneau.querySelector('.pm-at-liste');
  zone.textContent = '';
  const s = sceneDe(etat.scene);
  const fonds = s ? s.shaders || [] : [];
  el('p', { texte: s && s.effets.length ? `Scène « ${etat.scene} » : choisissez un effet (ou cliquez dessus dans l'image).`
    : fonds.length ? `La scène « ${etat.scene} » n'a pas d'effet de particules ; ses fonds :` : `La scène « ${etat.scene} » n'a pas d'effet.` }, zone).style.margin = '4px 0';
  (s ? s.effets : []).forEach((e) => {
    const b = el('button', { type: 'button', 'data-ordre': String(e.ordre), texte: `${e.ordre + 1}. ${e.nom}${e.calque === 'arriere' ? ' (arrière)' : ''}${e.erreur ? ' — en erreur' : ''}` }, zone);
    b.style.cssText = `display:block;width:100%;text-align:left;margin:2px 0;${etat.genre === 'effet' && e.ordre === etat.ordre ? 'outline:2px solid #4caf50' : ''}`;
    b.addEventListener('click', () => choisir(e.ordre));
  });
  fonds.forEach((f) => {
    const b = el('button', { type: 'button', 'data-fond': String(f.ordre), texte: `Fond : ${f.nom}${f.calque === 'avant' ? ' (devant)' : ''}${f.erreur ? ' — en erreur' : ''}` }, zone);
    b.style.cssText = `display:block;width:100%;text-align:left;margin:2px 0;${etat.genre === 'fond' && f.ordre === etat.ordre ? 'outline:2px solid #4caf50' : ''}`;
    b.addEventListener('click', () => choisirFond(f.ordre));
  });
}

function marquer() {
  if (reglagesUI) reglagesUI.marquer(etat.erreurs);
  if (formulaire) formulaire.marquer(etat.erreurs);
}

function etatEnregistrer() {
  const b = panneau && panneau.querySelector('[data-action="enregistrer"]');
  if (!b) return;
  b.disabled = etat.recetteModifiee;
  b.title = etat.recetteModifiee ? 'La recette a changé : enregistrez-la comme nouvel effet.' : 'Écrire les réglages dans la scène';
}

function marquerModifie() {
  etat.modifie = true;
  etatEnregistrer();
}

function poserGraine(n) {
  etat.graine = n >>> 0;
  etat.graineChangee = true;
  marquerModifie();
}

function afficherEffet() {
  if (!panneau) return;
  if (etat.genre === 'fond') { afficherFond(); return; }
  const zone = panneau.querySelector('.pm-at-effet');
  zone.textContent = '';
  formulaire = null;
  reglagesUI = null;
  const info = effetDe(etat.scene, etat.ordre);
  if (!info) return;
  el('h3', { texte: `${info.nom} (${info.calque === 'arriere' ? 'derrière le contenu' : 'devant le contenu'})` }, zone).style.cssText = 'margin:10px 0 4px;font-size:15px';
  if (!etat.recette) { el('p', { texte: info.erreur || 'Recette introuvable.' }, zone); return; }
  const niveaux = el('div', {}, zone);
  [['simple', 'Réglages'], ['avance', 'Recette complète']].forEach(([n, t]) => {
    const b = el('button', { type: 'button', 'data-niveau': n, texte: t, 'aria-pressed': String(etat.niveau === n) }, niveaux);
    b.style.cssText = `margin-right:6px;${etat.niveau === n ? 'font-weight:700' : ''}`;
    b.addEventListener('click', () => niveau(n));
  });
  const contenu = el('div', {}, zone);
  if (etat.niveau === 'simple') {
    reglagesUI = construireReglages(contenu, {
      parametres: etat.recette.parametres, valeurs: etat.valeurs, charte: CHARTE,
      surChangement: (v) => { etat.valeurs = v; marquerModifie(); recompiler(); },
    });
    const g = el('div', { class: 'pm-ed pm-ed-ligne' }, contenu);
    el('span', { texte: 'Tirage (graine)' }, g);
    const boite = el('span', { class: 'pm-ed-valeurs' }, g);
    const champ = el('input', { type: 'number', min: '0', step: '1', value: String(etat.graine), 'aria-label': 'Graine' }, boite);
    const autre = el('button', { type: 'button', texte: 'Autre tirage' }, boite);
    champ.addEventListener('input', () => {
      const n = Number(champ.value);
      if (Number.isInteger(n) && n >= 0) { poserGraine(n); recompiler(); }
    });
    autre.addEventListener('click', () => { poserGraine(etat.graine + 1); champ.value = String(etat.graine); recompiler(); });
  } else {
    formulaire = construireFormulaire(contenu, {
      schema: M.recette.SCHEMA, recette: etat.recette, masquer: ['nom', 'etend'], // le serveur les ignore
      surChangement: (r) => { etat.recette = r; etat.recetteModifiee = true; marquerModifie(); recompiler(); },
    });
  }
  const actions = el('div', { class: 'pm-ed' }, zone);
  actions.style.cssText = 'margin-top:10px;display:grid;gap:6px';
  const enregistrerB = el('button', { type: 'button', 'data-action': 'enregistrer', texte: 'Enregistrer' }, actions);
  enregistrerB.addEventListener('click', () => enregistrer().catch(() => {}));
  const nom = el('input', { type: 'text', class: 'pm-at-nom', placeholder: `${info.nom}-2`, 'aria-label': 'Nom du nouvel effet' }, actions);
  const remplacer = el('label', {}, actions);
  const coche = el('input', { type: 'checkbox' }, remplacer);
  remplacer.append(' remplacer l\'effet du projet de ce nom');
  el('button', { type: 'button', 'data-action': 'enregistrer-comme', texte: 'Enregistrer comme nouvel effet' }, actions)
    .addEventListener('click', () => enregistrerComme(nom.value.trim(), { remplacer: coche.checked }).catch(() => {}));
  el('a', { href: `/_pm/atelier?recette=${encodeURIComponent(info.nom)}`, target: '_blank', texte: 'Ouvrir dans l\'atelier (effet seul)' }, actions).style.color = '#9ecbff';
  etatEnregistrer();
  marquer();
}

function afficherFond() {
  const zone = panneau.querySelector('.pm-at-effet');
  zone.textContent = '';
  formulaire = null;
  reglagesUI = null;
  const info = fondDe(etat.scene, etat.ordre);
  if (!info) return;
  el('h3', { texte: `Fond « ${info.nom} » (${info.calque === 'avant' ? 'devant le contenu' : 'derrière le contenu'})` }, zone).style.cssText = 'margin:10px 0 4px;font-size:15px';
  if (!info.usage) { el('p', { texte: info.erreur || 'Shader introuvable.' }, zone); return; }
  const contenu = el('div', {}, zone);
  reglagesUI = construireReglages(contenu, {
    parametres: info.parametres, valeurs: etat.valeurs, charte: CHARTE,
    surChangement: (v) => { etat.valeurs = v; marquerModifie(); reappliquerFond(); },
  });
  const actions = el('div', { class: 'pm-ed' }, zone);
  actions.style.cssText = 'margin-top:10px;display:grid;gap:6px';
  el('button', { type: 'button', 'data-action': 'enregistrer-fond', texte: 'Enregistrer' }, actions).addEventListener('click', () => enregistrerFond().catch(() => {}));
  marquer();
}

/** Lecture en boucle sur la fenêtre du fond (sans sortir de la scène). */
function bouclerFond() {
  if (!M.boucler) return;
  const d = M.shaders ? M.shaders.decrire(etat.scene).find((x) => x.ordre === etat.ordre) : null;
  const info = M.minutage.scenes.find((s) => s.id === etat.scene);
  if (!d || !info) { M.boucler(null); return; }
  M.boucler({ debut: Math.max(d.debut, info.debut), fin: Math.min(d.fin, info.fin) });
}

/** Réglages contrôlés comme à l'assemblage, puis réécrits dans l'uniforme du fond (image redessinée, sans recompiler). */
async function appliquerFond() {
  const info = fondDe(etat.scene, etat.ordre);
  if (!info || !info.usage) return;
  const v = M.codeShader.valeursShader({ nom: info.nom, parametres: info.parametres }, reglagesEnTexte(etat.valeurs), donnees.charte);
  etat.erreurs = v.erreurs;
  marquer();
  if (v.erreurs.length) { dire('Réglage refusé (voir le champ marqué) : l\'image garde le dernier état valide.'); return; }
  if (!M.particules.disponible) return;
  try {
    await M.shaders.regler(etat.scene, etat.ordre, v.valeurs);
    if (!etat.conflit) dire('');
  } catch (e) { dire(String(e && e.message || e)); }
}
const reappliquerFond = limiter(() => { derniere = appliquerFond(); }, DELAI);

function choisirFond(ordre, scene) {
  const id = scene || etat.scene || sceneCourante();
  const info = fondDe(id, ordre);
  if (!info) return false;
  generation++;
  Object.assign(etat, {
    genre: 'fond', scene: id, ordre,
    valeurs: { ...M.recette.analyserReglages(info.reglages).valeurs },
    recette: null, recetteModifiee: false, modifie: false, conflit: false,
    erreurs: info.erreur ? [{ chemin: '', message: info.erreur }] : [],
  });
  bouclerFond();
  memoriser();
  afficherListe();
  afficherEffet();
  if (!M.particules.disponible) dire(M.particules.raison || 'Fonds non affichés : WebGPU indisponible.');
  else if (info.erreur) dire(`Fond en erreur : ${info.erreur}`);
  else dire('');
  return true;
}

function reglerFond(nom, valeur) {
  if (etat.genre !== 'fond') return Promise.reject(new Error('Aucun fond choisi.'));
  etat.valeurs[nom] = String(valeur);
  marquerModifie();
  afficherEffet();
  derniere = appliquerFond();
  return derniere;
}

function enregistrerFond() {
  const sc = sceneDe(etat.scene);
  if (etat.genre !== 'fond' || !sc || !fondDe(etat.scene, etat.ordre)) return Promise.reject(new Error('Aucun fond choisi.'));
  if (etat.erreurs.length) {
    dire('Des réglages sont refusés (voir les champs marqués) : corrigez-les avant d\'enregistrer.');
    return Promise.reject(new Error('réglages refusés'));
  }
  return envoyer('/_pm/atelier/reglages-shader', {
    fichier: sc.fichier, empreinte: sc.empreinte, scene: etat.scene, ordre: etat.ordre, reglages: reglagesEnTexte(etat.valeurs),
  });
}

/** Lecture en boucle sur la fenêtre de l'effet (sans en sortir de la scène). */
function boucler() {
  if (!M.boucler) return;
  const d = M.particules.decrire(etat.scene).find((x) => x.ordre === etat.ordre);
  const info = M.minutage.scenes.find((s) => s.id === etat.scene);
  if (!d || !info) { M.boucler(null); return; }
  M.boucler({ debut: Math.max(d.debut, info.debut), fin: Math.min(d.fin, info.fin) });
}

let generation = 0; // une compilation dépassée (réponses dans le désordre, texture à charger) est ignorée

async function appliquer() {
  const info = effetDe(etat.scene, etat.ordre);
  if (!info || !etat.recette) return;
  const numero = ++generation;
  // Effet fait uniquement de structures sans data-dur : de son début (data-start, relatif compris, résolu par le minutage de
  // la page) à la fin de la scène (voix comprise), en s de τ ; un effet qui commence à la fin de la scène ou après : 1 s.
  const scene = info.durScene && M.minutage ? M.minutage.scenes.find((s) => s.id === etat.scene) : null;
  const fx = scene && M.particules ? M.particules.decrire(etat.scene).find((x) => x.ordre === etat.ordre) : null;
  const reste = fx ? Math.round((scene.fin - fx.debut) * scene.rythme * 1e6) / 1e6 : null;
  const dur = reste !== null ? (reste > 0 ? reste : 1) : scene && scene.dureeEffective > 0 ? scene.dureeEffective : info.dur;
  const r = await compilerPourPage(M.recette, etat.recette, { reglages: reglagesEnTexte(etat.valeurs), charte: donnees.charte, dur, graine: etat.graine }, textures);
  if (numero !== generation) return;
  etat.erreurs = r.ok ? [] : r.erreurs;
  marquer();
  if (!r.ok) { dire('Réglage refusé (voir le champ marqué) : l\'image garde le dernier état valide.'); return; }
  if (!M.particules.disponible) return;
  if (info.erreur) { dire('Cet effet était en erreur au chargement : enregistrez pour le voir dans la vidéo.'); return; }
  try {
    await M.particules.remplacerEffet(etat.scene, etat.ordre, r.effet);
    boucler();
    if (!etat.conflit) dire('');
  } catch (e) { dire(String(e && e.message || e)); }
}
const recompiler = limiter(() => { derniere = appliquer(); }, DELAI);

function choisir(ordre, scene) {
  const id = scene || etat.scene || sceneCourante();
  const info = effetDe(id, ordre);
  if (!info) return false;
  generation++;
  Object.assign(etat, {
    genre: 'effet', scene: id, ordre,
    valeurs: { ...M.recette.analyserReglages(info.reglages).valeurs },
    graine: info.graine, graineEcrite: info.graineEcrite, graineChangee: false,
    recette: info.recette ? clone(info.recette) : null, recetteModifiee: false, modifie: false, conflit: false,
    erreurs: info.erreur ? [{ chemin: '', message: info.erreur }] : [],
  });
  boucler();
  memoriser();
  afficherListe();
  afficherEffet();
  if (!M.particules.disponible) dire(M.particules.raison || 'Effets non affichés : WebGPU indisponible.');
  else if (info.erreur) dire(`Effet en erreur : ${info.erreur}`);
  else dire('');
  return true;
}

async function ouvrir(scene, ordre, genre) {
  await M.pret;
  await M.particules.pret;
  if (!donnees) await chargerDonnees();
  construire();
  etat.ouvert = true;
  etat.scene = scene || sceneCourante();
  memoriser();
  afficherListe();
  if (!M.particules.disponible) dire(M.particules.raison || 'Effets non affichés : WebGPU indisponible.');
  if (ordre !== undefined && ordre !== null) (genre === 'fond' ? choisirFond : choisir)(ordre, etat.scene);
}

function fermer() {
  Object.assign(etat, { ouvert: false, scene: null, ordre: null, genre: 'effet', modifie: false, conflit: false });
  if (M.boucler) M.boucler(null);
  if (panneau) { panneau.remove(); panneau = null; }
  formulaire = null;
  reglagesUI = null;
  memoriser();
  if (M.reprendreRechargement) M.reprendreRechargement();
}

function niveau(n) {
  etat.niveau = n === 'avance' ? 'avance' : 'simple';
  memoriser();
  afficherEffet();
}

function sansEffet() { return Promise.reject(new Error('Aucun effet réglable choisi.')); }

function regler(nom, valeur) {
  if (!etat.recette) return sansEffet();
  etat.valeurs[nom] = String(valeur);
  marquerModifie();
  afficherEffet();
  derniere = appliquer();
  return derniere;
}

function retablir(nom) {
  if (!etat.recette) return sansEffet();
  delete etat.valeurs[nom];
  marquerModifie();
  afficherEffet();
  derniere = appliquer();
  return derniere;
}

function graine(n) {
  if (!etat.recette) return sansEffet();
  poserGraine(n);
  afficherEffet();
  derniere = appliquer();
  return derniere;
}

function modifierRecette(fn) {
  if (!etat.recette) return sansEffet();
  fn(etat.recette);
  etat.recetteModifiee = true;
  marquerModifie();
  afficherEffet();
  derniere = appliquer();
  return derniere;
}

async function envoyer(url, corps) {
  etat.enCours = true;
  etat.conflit = false;
  dire('Enregistrement…');
  let r;
  let rep = {};
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    rep = await r.json().catch(() => ({}));
  } catch (e) {
    etat.enCours = false;
    dire('L\'aperçu ne répond pas : relancez-le (pulse-motion apercu), puis réessayez.');
    throw e;
  }
  etat.enCours = false;
  if (!r.ok) {
    etat.conflit = rep.conflit === true;
    if (Array.isArray(rep.erreurs)) { etat.erreurs = rep.erreurs; marquer(); }
    dire(rep.message || `Enregistrement refusé (${r.status}).`);
    const e = new Error(rep.message || String(r.status));
    e.statut = r.status;
    throw e;
  }
  etat.modifie = false;
  memoriser();
  dire(rep.complete ? 'Enregistré (recette écrite en entier : un émetteur ou un champ retiré ne s\'exprime pas par héritage). La page se recharge.'
    : 'Enregistré : la page se recharge sur le même effet.');
  if (M.reprendreRechargement) M.reprendreRechargement();
  return rep;
}

function enregistrer() {
  const info = effetDe(etat.scene, etat.ordre);
  const sc = sceneDe(etat.scene);
  if (!info || !sc) return sansEffet();
  if (etat.recetteModifiee) {
    dire('La recette a changé : enregistrez-la comme nouvel effet (« Enregistrer comme nouvel effet »).');
    return Promise.reject(new Error('recette modifiée'));
  }
  if (etat.erreurs.length) {
    dire('Des réglages sont refusés (voir les champs marqués) : corrigez-les avant d\'enregistrer.');
    return Promise.reject(new Error('réglages refusés'));
  }
  return envoyer('/_pm/atelier/reglages', {
    fichier: sc.fichier, empreinte: sc.empreinte, scene: etat.scene, ordre: etat.ordre,
    reglages: reglagesEnTexte(etat.valeurs),
    graine: etat.graineEcrite || etat.graineChangee ? etat.graine : null,
  });
}

function enregistrerComme(nom, { remplacer = false } = {}) {
  const info = effetDe(etat.scene, etat.ordre);
  const sc = sceneDe(etat.scene);
  if (!info || !sc || !etat.recette) return sansEffet();
  if (!nom) {
    dire('Donnez un nom au nouvel effet (minuscules, chiffres et tirets, exemple : etincelles-bleues).');
    return Promise.reject(new Error('nom absent'));
  }
  return envoyer('/_pm/atelier/recette', {
    nom, etend: info.nom, recette: etat.recette, dur: info.dur, remplacer,
    cible: { scene: etat.scene, ordre: etat.ordre, empreinte: sc.empreinte, reglages: reglagesEnTexte(etat.valeurs), graine: etat.graine },
  });
}

/** Effet dont la zone (ancre, sinon balise) contient le point, la plus petite gagnant ; rang, ou null. */
function effetSous(x, y) {
  const id = etat.scene || sceneCourante();
  const section = document.querySelector(`#pm-scene > section[data-scene="${CSS.escape(id)}"]`);
  if (!section) return null;
  let meilleur = null;
  let aire = Infinity;
  section.querySelectorAll('[data-effet]').forEach((b, ordre) => {
    let cible = b;
    const ancre = (b.getAttribute('data-ancre') || '').trim();
    if (/^#[A-Za-z0-9_-]+$/.test(ancre)) cible = section.querySelector(ancre) || b;
    const r = cible.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width * r.height < aire) {
      aire = r.width * r.height;
      meilleur = ordre;
    }
  });
  return meilleur;
}

M.atelier = {
  ouvrir, fermer, choisir, regler, retablir, graine, niveau, modifierRecette, enregistrer, enregistrerComme, occupe,
  choisirFond, reglerFond, enregistrerFond,
  etat: () => clone(etat),
  get pret() { return derniere; },
};

// Panneau ouvert : un clic dans l'image choisit l'effet (au lieu de lancer ou d'arrêter la lecture).
document.addEventListener('click', (e) => {
  if (!etat.ouvert || !e.target || !e.target.closest || !e.target.closest('#pm-scene')) return;
  const ordre = effetSous(e.clientX, e.clientY);
  if (ordre === null) return;
  e.stopPropagation();
  e.preventDefault();
  choisir(ordre, etat.scene || sceneCourante());
}, true);

// Aucun effet choisi : la liste suit la scène courante.
M.surRendu(() => {
  if (!etat.ouvert || etat.ordre !== null || !M.minutage) return;
  const id = sceneCourante();
  if (id !== etat.scene) { etat.scene = id; afficherListe(); }
});

function ajouterBouton() {
  const barre = document.getElementById('pm-lecteur');
  if (!barre || document.getElementById('pm-bouton-effets')) return;
  const b = el('button', { id: 'pm-bouton-effets', type: 'button', texte: 'Effets', title: 'Régler les effets de particules', 'aria-label': 'Régler les effets de particules' }, barre);
  b.style.cssText = 'width:auto;padding:0 12px;border-radius:16px;font-weight:600';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (etat.ouvert) fermer(); else ouvrir();
  });
}

M.pret.then(async () => {
  if (!document.querySelector('#pm-scene [data-effet], #pm-scene [data-shader]')) return;
  ajouterBouton();
  await chargerDonnees();
  let memo = null;
  try { memo = JSON.parse(sessionStorage.getItem(CLE) || 'null'); } catch (e) { /* stockage indisponible */ }
  if (memo && memo.ouvert) {
    etat.niveau = memo.niveau === 'avance' ? 'avance' : 'simple';
    await ouvrir(memo.scene, memo.ordre, memo.genre);
  }
});
