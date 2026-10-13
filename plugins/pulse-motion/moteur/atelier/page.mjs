/* Pulse Motion – page d'atelier des effets (/_pm/atelier?recette=<nom>, servie par l'aperçu, jamais dans la page livrée).
 *
 * Joue une recette seule dans une scène technique 16:9 de 60 s, la lecture bouclant sur la vie de l'effet ; fond clair
 * (fond de la charte) ou sombre ; zone d'ancre déplaçable et redimensionnable à la souris. Départ : une recette de la
 * bibliothèque, du projet, ou une recette vide (un émetteur). Réglages exposés et recette complète (editeur.mjs) :
 * chaque changement recompile (au plus toutes les 100 ms) et remplace la simulation de l'effet. « Enregistrer » écrit
 * effets/<nom>.json dans le projet (par etend quand le départ est une recette existante ; les réglages courants y
 * deviennent les valeurs par défaut) ; hors d'un projet, la page dit de lancer l'atelier depuis le dossier d'une vidéo.
 * Obstacles d'essai (collisions) : ?sol=1 (sol de la vidéo à 90 cqh) et ?boite=1 (boîte data-obstacle en bas au centre) ;
 * cocher une case recharge la page avec l'adresse mise à jour.
 * Pour les tests : M.atelierPage = { pret, etat(), essai(), modifier(fn), regler(nom, v), duree(s), graine(n), fond(f),
 *   ancre({ x, y, l, h }), lecture(bool), enregistrer(nom, { remplacer }) }.
 */
import { construireFormulaire, construireReglages, reglagesEnTexte, limiter, compilerPourPage, nouvelleRecette, el } from './editeur.mjs';

const M = globalThis.M;
const DUREE = 60;
const DELAI = 100;
const SOMBRE = '#101014';
const CHARTE = ['primaire', 'accent', 'texte', 'fond'];
const ESSAI = (() => {
  const q = new URLSearchParams(location.search);
  return { sol: q.get('sol') === '1', boite: q.get('boite') === '1' };
})();
const SANS_PROJET = 'Aucune vidéo ouverte : lancez l\'atelier depuis le dossier d\'une vidéo (pulse-motion atelier) pour enregistrer vos effets.';

const etat = {
  projet: false, charte: {}, recettes: { bibliotheque: [], projet: [] }, depart: null, source: null,
  recette: null, valeurs: {}, dur: 2, graine: 1, fond: 'sombre', ancre: { x: 35, y: 35, l: 30, h: 30 },
  erreurs: [], message: '', effet: null,
};
const textures = new Map();
let formulaire = null;
let reglagesUI = null;
let derniere = Promise.resolve();
let signalerPret;
const pret = new Promise((r) => { signalerPret = r; });
const clone = (o) => JSON.parse(JSON.stringify(o));
const borne = (x, a, b) => Math.min(b, Math.max(a, x));
const estReglage = (e) => /^reglages(\.|$)/.test(e.chemin || '');

const options = () => ({ reglages: reglagesEnTexte(etat.valeurs), charte: etat.charte, dur: etat.dur, graine: etat.graine });
const compiler = () => compilerPourPage(M.recette, etat.recette, options(), textures);

function dire(message) {
  etat.message = message;
  const p = document.querySelector('#pm-atelier .pm-at-message');
  if (p) p.textContent = message;
}

async function lireJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  return { ok: r.ok, statut: r.status, corps: await r.json().catch(() => ({})) };
}

/** Données de la page (une scène technique, un effet), lues par M.demarrer. */
function poserDonnees(effet) {
  const d = {
    titre: 'Atelier', format: { ratio: '16:9', ips: 30 }, musique: null, voix: null, tempo: null, bruitages: null, sousTitres: null,
    scenes: [{ id: 'atelier', duree: DUREE, rythme: 1, transition: 'aucune' }],
    effets: [{ calque: 'avant', ancre: 'pm-atelier-ancre', effet }],
    obstacles: ESSAI.boite ? [{ scene: 'atelier', genre: 'element', video: false }] : [],
    obstaclesVideo: ESSAI.sol ? [{ type: 'sol', a: 90 }] : [],
  };
  const s = document.createElement('script');
  s.type = 'application/json';
  s.id = 'pm-donnees';
  s.textContent = JSON.stringify(d);
  document.body.appendChild(s);
}

/** Obstacles d'essai : l'adresse change, la page se recharge (les données du moteur sont fixées au démarrage). */
function basculerEssai(cle, actif) {
  const q = new URLSearchParams(location.search);
  if (actif) q.set(cle, '1'); else q.delete(cle);
  location.search = q.toString();
}

function poserAncre() {
  const a = document.getElementById('pm-atelier-ancre');
  a.style.left = `${etat.ancre.x}%`;
  a.style.top = `${etat.ancre.y}%`;
  a.style.width = `${etat.ancre.l}%`;
  a.style.height = `${etat.ancre.h}%`;
}

function poserFond() {
  document.getElementById('pm-scene').style.background = etat.fond === 'clair' ? (etat.charte.fond || '#ffffff') : SOMBRE;
}

function boucler() {
  M.boucler({ debut: 0, fin: borne(etat.effet ? etat.effet.fin : 1, 0.5, DUREE) });
}

function marquer() {
  if (reglagesUI) reglagesUI.marquer(etat.erreurs.filter(estReglage));
  if (formulaire) formulaire.marquer(etat.erreurs.filter((e) => !estReglage(e)));
}

let generation = 0; // une compilation dépassée (réponses dans le désordre, texture à charger) est ignorée

async function appliquer() {
  const numero = ++generation;
  const r = await compiler();
  if (numero !== generation) return;
  etat.erreurs = r.ok ? [] : r.erreurs;
  marquer();
  if (!r.ok) { dire('Recette refusée (voir le champ marqué) : l\'image garde le dernier état valide.'); return; }
  etat.effet = r.effet;
  if (!M.particules.disponible) return;
  try {
    await M.particules.remplacerEffet('atelier', 0, r.effet);
    boucler();
    dire('');
  } catch (e) { dire(String(e && e.message || e)); }
}
const recompiler = limiter(() => { derniere = appliquer(); }, DELAI);

/** L'ancre a bougé : la simulation est recréée, les zones d'émission remesurées. */
function remesurer() {
  if (!etat.effet || !M.particules.disponible) return Promise.resolve();
  return M.particules.remplacerEffet('atelier', 0, etat.effet).catch((e) => dire(String(e && e.message || e)));
}
const remesurerLimite = limiter(() => { derniere = remesurer(); }, DELAI);

/** Glisser l'ancre la déplace ; tirer son coin la redimensionne ; ni l'un ni l'autre ne lance la lecture. */
function brancherAncre() {
  const a = document.getElementById('pm-atelier-ancre');
  const poignee = a.querySelector('.pm-atelier-poignee');
  const section = a.parentElement;
  let geste = null;
  a.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    a.setPointerCapture(e.pointerId);
    const r = section.getBoundingClientRect();
    geste = { taille: e.target === poignee, x0: e.clientX, y0: e.clientY, depart: { ...etat.ancre }, l: r.width, h: r.height };
  });
  a.addEventListener('pointermove', (e) => {
    if (!geste) return;
    const dx = (e.clientX - geste.x0) / geste.l * 100;
    const dy = (e.clientY - geste.y0) / geste.h * 100;
    const d = geste.depart;
    etat.ancre = geste.taille
      ? { ...d, l: borne(d.l + dx, 2, 100 - d.x), h: borne(d.h + dy, 2, 100 - d.y) }
      : { ...d, x: borne(d.x + dx, 0, 100 - d.l), y: borne(d.y + dy, 0, 100 - d.h) };
    poserAncre();
    remesurerLimite();
  });
  const finir = () => {
    if (!geste) return;
    geste = null;
    remesurerLimite();
  };
  a.addEventListener('pointerup', finir);
  a.addEventListener('pointercancel', finir);
  a.addEventListener('click', (e) => e.stopPropagation());
}

function refaireReglages() {
  const zone = document.querySelector('#pm-atelier .pm-at-reglages');
  if (!zone) return;
  zone.textContent = '';
  reglagesUI = construireReglages(zone, {
    parametres: etat.recette.parametres, valeurs: etat.valeurs, charte: CHARTE,
    surChangement: (v) => { etat.valeurs = v; recompiler(); },
  });
  reglagesUI.marquer(etat.erreurs.filter(estReglage));
}

function ligne(parent, libelle) {
  const l = el('div', { class: 'pm-at-ligne' }, parent);
  el('span', { texte: libelle }, l);
  return l;
}

function fond(f) {
  etat.fond = f === 'clair' ? 'clair' : 'sombre';
  poserFond();
  document.querySelectorAll('#pm-atelier [data-fond]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fond === etat.fond)));
}

function lecture(jouer) {
  const b = document.querySelector('#pm-lecteur button');
  if (b && (b.getAttribute('aria-label') === 'Pause') !== jouer) b.click();
}

function construirePanneau() {
  const p = document.getElementById('pm-atelier');
  p.textContent = '';
  el('h1', { texte: 'Atelier des effets' }, p);
  el('p', { class: 'pm-at-message', 'aria-live': 'polite', texte: etat.message }, p);

  const depart = el('select', { 'aria-label': 'Recette de départ' }, ligne(p, 'Départ'));
  el('option', { value: '', texte: 'Recette vide' }, depart);
  [['bibliotheque', 'Bibliothèque'], ['projet', 'Projet']].forEach(([cle, libelle]) => {
    if (!etat.recettes[cle].length) return;
    const g = el('optgroup', { label: libelle }, depart);
    etat.recettes[cle].forEach((n) => el('option', { value: `${cle}:${n}`, texte: n }, g));
  });
  depart.value = etat.depart ? `${etat.source}:${etat.depart}` : '';
  depart.addEventListener('change', () => {
    const nom = depart.value.split(':')[1];
    location.search = nom ? `?recette=${encodeURIComponent(nom)}` : '';
  });

  const fonds = el('span', {}, ligne(p, 'Fond'));
  [['clair', 'Clair (charte)'], ['sombre', 'Sombre']].forEach(([f, t]) => {
    const b = el('button', { type: 'button', 'data-fond': f, texte: t, 'aria-pressed': String(etat.fond === f) }, fonds);
    b.style.marginRight = '6px';
    b.addEventListener('click', () => fond(f));
  });

  const essais = el('span', {}, ligne(p, "Obstacles d'essai"));
  [['sol', 'Sol'], ['boite', 'Boîte']].forEach(([cle, texte]) => {
    const etiquette = el('label', {}, essais);
    const caseACocher = el('input', { type: 'checkbox', 'data-essai': cle, 'aria-label': `${texte} d'essai` }, etiquette);
    caseACocher.checked = ESSAI[cle];
    etiquette.append(` ${texte} `);
    caseACocher.addEventListener('change', () => basculerEssai(cle, caseACocher.checked));
  });

  const dur = el('input', { type: 'number', min: '0.1', step: '0.1', value: String(etat.dur), 'aria-label': 'Durée d\'émission' }, ligne(p, 'Durée d\'émission (s)'));
  dur.addEventListener('input', () => {
    const x = Number(dur.value);
    if (x > 0) { etat.dur = x; recompiler(); }
  });
  const tirage = el('span', {}, ligne(p, 'Tirage (graine)'));
  const graine = el('input', { type: 'number', min: '0', step: '1', value: String(etat.graine), 'aria-label': 'Graine' }, tirage);
  graine.addEventListener('input', () => {
    const n = Number(graine.value);
    if (Number.isInteger(n) && n >= 0) { etat.graine = n >>> 0; recompiler(); }
  });
  el('button', { type: 'button', texte: 'Autre tirage' }, tirage).addEventListener('click', () => {
    etat.graine = (etat.graine + 1) >>> 0;
    graine.value = String(etat.graine);
    recompiler();
  });

  el('h2', { texte: 'Réglages' }, p);
  el('div', { class: 'pm-at-reglages' }, p);
  el('h2', { texte: 'Recette complète' }, p);
  formulaire = construireFormulaire(el('div', {}, p), {
    schema: M.recette.SCHEMA, recette: etat.recette,
    surChangement: (r) => {
      const avant = JSON.stringify(etat.recette.parametres || {});
      etat.recette = r;
      if (JSON.stringify(r.parametres || {}) !== avant) refaireReglages();
      recompiler();
    },
  });
  refaireReglages();

  el('h2', { texte: 'Enregistrer dans le projet' }, p);
  const nom = el('input', { type: 'text', class: 'pm-at-nom', placeholder: etat.depart ? `${etat.depart}-2` : 'mon-effet', 'aria-label': 'Nom de l\'effet' }, ligne(p, 'Nom'));
  const choix = el('label', {}, p);
  const remplacer = el('input', { type: 'checkbox' }, choix);
  choix.append(' remplacer l\'effet du projet de ce nom');
  const bouton = el('button', { type: 'button', 'data-action': 'enregistrer', texte: 'Enregistrer' }, p);
  bouton.style.display = 'block';
  bouton.addEventListener('click', () => enregistrer(nom.value.trim(), { remplacer: remplacer.checked }).catch(() => {}));
  if (!etat.projet) {
    bouton.disabled = true;
    nom.disabled = true;
    el('p', { class: 'pm-at-sans-projet', texte: SANS_PROJET }, p);
  }
}

/** Recette à écrire : les réglages courants deviennent les valeurs par défaut de ses paramètres. */
function recetteAEcrire() {
  const r = clone(etat.recette);
  for (const [nom, v] of Object.entries(etat.valeurs)) {
    const p = r.parametres && r.parametres[nom];
    if (p) p.defaut = p.type === 'couleur' ? String(v) : Number(v);
  }
  return r;
}

async function enregistrer(nom, { remplacer = false } = {}) {
  if (!etat.projet) { dire(SANS_PROJET); throw new Error(SANS_PROJET); }
  if (!nom) {
    dire('Donnez un nom à l\'effet (minuscules, chiffres et tirets, exemple : etincelles-bleues).');
    throw new Error('nom absent');
  }
  const r = await fetch('/_pm/atelier/recette', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom, etend: etat.depart, recette: recetteAEcrire(), dur: etat.dur, remplacer }),
  });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (Array.isArray(corps.erreurs)) { etat.erreurs = corps.erreurs; marquer(); }
    dire(corps.message || `Enregistrement refusé (${r.status}).`);
    const e = new Error(corps.message || String(r.status));
    e.statut = r.status;
    throw e;
  }
  if (!etat.recettes.projet.includes(nom)) etat.recettes.projet.push(nom);
  dire(`Effet « ${nom} » enregistré dans ${corps.fichier} : à poser dans une scène avec data-effet="${nom}".`
    + (corps.complete ? ' Il est écrit en entier (un émetteur ou un champ retiré ne s\'exprime pas par héritage).' : ''));
  return corps;
}

async function demarrer() {
  const ctx = await lireJSON('/_pm/atelier/contexte');
  etat.projet = ctx.corps.projet === true;
  etat.charte = ctx.corps.charte || {};
  etat.recettes = ctx.corps.recettes || { bibliotheque: [], projet: [] };
  const nom = new URLSearchParams(location.search).get('recette');
  if (nom) {
    const r = await lireJSON(`/_pm/atelier/recette?nom=${encodeURIComponent(nom)}`);
    if (r.ok) {
      etat.depart = r.corps.nom;
      etat.source = r.corps.source;
      etat.recette = r.corps.recette;
    } else etat.message = `${r.corps.message || `Recette « ${nom} » illisible.`} Départ d'une recette vide.`;
  }
  if (!etat.recette) etat.recette = nouvelleRecette();
  let r = await compiler();
  if (!r.ok) {
    etat.erreurs = r.erreurs;
    etat.message = 'La recette de départ a une erreur (champ marqué) : la recette vide est jouée en attendant la correction.';
    r = await compilerPourPage(M.recette, nouvelleRecette(), options(), textures);
  }
  etat.effet = r.effet;
  document.getElementById('pm-atelier-boite').hidden = !ESSAI.boite;
  document.getElementById('pm-atelier-sol').hidden = !ESSAI.sol;
  poserDonnees(r.effet);
  poserAncre();
  poserFond();
  M.demarrer();
  M.demarrerLecteur();
  M.demarrerParticules();
  construirePanneau();
  marquer();
  brancherAncre();
  await M.particules.pret;
  // Le message de départ (recette introuvable…) reste affiché avec celui du moteur.
  if (!M.particules.disponible) dire([etat.message, M.particules.raison || 'Effets non affichés : WebGPU indisponible.'].filter(Boolean).join(' '));
  boucler();
  lecture(true);
  signalerPret();
}

M.atelierPage = {
  pret,
  etat: () => clone({ ...etat, effet: null }),
  essai: () => ({ ...ESSAI }),
  modifier(fn) {
    fn(etat.recette);
    if (formulaire) formulaire.remplacer(etat.recette);
    refaireReglages();
    derniere = appliquer();
    return derniere;
  },
  regler(nom, valeur) {
    etat.valeurs[nom] = String(valeur);
    refaireReglages();
    derniere = appliquer();
    return derniere;
  },
  duree(s) { etat.dur = s; derniere = appliquer(); return derniere; },
  graine(n) { etat.graine = n >>> 0; derniere = appliquer(); return derniere; },
  fond,
  ancre(a) {
    etat.ancre = { ...etat.ancre, ...a };
    poserAncre();
    derniere = remesurer();
    return derniere;
  },
  lecture,
  enregistrer,
};

demarrer().catch((e) => {
  dire(`L'atelier n'a pas pu démarrer : ${e && e.message || e}`);
  console.error('[Pulse Motion] Atelier :', e);
});
