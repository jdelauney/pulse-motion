/* Pulse Motion – remarques épinglées sur l'image, dans l'aperçu (spec Retouches et ergonomie, 5.8).
 *
 * Bouton « Remarque » de la barre, ou touche N : mode remarque. Dans ce mode, un clic sur l'image met en pause et pose une
 * épingle (hors de ce mode, le clic garde son rôle : lecture/pause). Le panneau latéral propose un champ et trois boutons :
 * « Garder la remarque », « Sur cette image, sans épingle », « Sur toute la vidéo » ; il liste les remarques (un clic place
 * la lecture à son instant et montre l'épingle ; une remarque faite montre l'image d'avant et celle d'après côte à côte) ;
 * « Envoyer à Claude » termine. Des repères de couleur sur la piste montrent les remarques ouvertes et faites.
 * Élément sous le clic : elementsFromPoint dans #pm-scene (clé data-texte, sinon id). Image : M.capturer (même voie que la
 * planche), 960 px de large, JPEG de qualité 0,85, épingle dessinée. Tout est hors de #pm-scene : jamais dans les images.
 * Aperçu seulement (injecté par scripts/apercu.js) ; principes de la salle de relecture de take-one (MIT), réécrits.
 */
const M = globalThis.M;
const LARGEUR_IMAGE = 960;
const COULEURS = { ouverte: '#e8590c', 'scene-disparue': '#e8590c', 'a-discuter': '#1971c2', faite: '#2b8a3e' };
const ETATS = { ouverte: 'À traiter', 'scene-disparue': 'Scène retirée : à discuter', 'a-discuter': 'Question de Claude', faite: 'Faite' };
const CLE_OUVERT = 'pm-remarques-ouvert';

let mode = false;
let remarques = [];
let attente = null; // remarque en cours d'écriture : { t, scene, tScene, x, y, element, image, imageSansEpingle }
let panneau = null;
let epingle = null;
let bouton = null;

function el(tag, attrs = {}, parent = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'texte') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

async function requete(chemin, corps) {
  const r = await fetch(chemin, corps === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erreur || `Échec (${r.status}).`);
  return d;
}

const scene = () => document.getElementById('pm-scene');
const horodatage = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function sceneA(t) {
  const liste = (M.minutage && M.minutage.scenes) || [];
  let s = liste[0] || null;
  for (const x of liste) if (t >= x.debut - 1e-6) s = x;
  return s;
}

/** Élément sous le clic, dans #pm-scene : clé data-texte, sinon id (jamais celui de la scène ou d'une section). */
function elementSous(x, y) {
  const racine = scene();
  for (const e of document.elementsFromPoint(x, y)) {
    if (!racine.contains(e) || e === racine) continue;
    const texte = e.closest('[data-texte]');
    if (texte && racine.contains(texte)) return texte.getAttribute('data-texte');
    const avecId = e.closest('[id]');
    if (avecId && racine.contains(avecId) && avecId !== racine && avecId.tagName !== 'SECTION' && /^[A-Za-z0-9_-]{1,80}$/.test(avecId.id)) return avecId.id;
  }
  return null;
}

/** Capture de l'instant courant (M.capturer), avec et sans l'épingle. -> { avec, sans } (data URL JPEG) ou null */
async function capturer(x, y) {
  if (typeof M.capturer !== 'function') return null;
  try {
    const r = scene().getBoundingClientRect();
    const largeur = LARGEUR_IMAGE;
    const hauteur = Math.round(largeur * r.height / r.width);
    const canvas = el('canvas', { width: String(largeur), height: String(hauteur) });
    const ctx = canvas.getContext('2d');
    await M.capturer(ctx, largeur, hauteur);
    const sans = canvas.toDataURL('image/jpeg', 0.85);
    if (x === null) return { avec: sans, sans };
    const cx = x * largeur;
    const cy = y * hauteur;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#e8590c';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    return { avec: canvas.toDataURL('image/jpeg', 0.85), sans };
  } catch {
    return null;
  }
}

function montrerEpingle(x, y) {
  retirerEpingle();
  if (x === null || x === undefined) return;
  const r = scene().getBoundingClientRect();
  epingle = el('div', { id: 'pm-epingle', 'aria-hidden': 'true',
    style: `position:fixed;z-index:21;width:24px;height:24px;margin:-12px 0 0 -12px;border:3px solid #fff;border-radius:50%;background:#e8590c;box-shadow:0 1px 6px rgb(0 0 0/.5);pointer-events:none;left:${r.left + x * r.width}px;top:${r.top + y * r.height}px` }, document.body);
}
function retirerEpingle() { if (epingle) { epingle.remove(); epingle = null; } }

// --- Mode remarque ----------------------------------------------------------------------------------------------------

function basculerMode(force) {
  mode = typeof force === 'boolean' ? force : !mode;
  if (bouton) { bouton.setAttribute('aria-pressed', String(mode)); bouton.style.background = mode ? '#e8590c' : '#eee'; bouton.style.color = mode ? '#fff' : '#111'; }
  scene().style.cursor = mode ? 'crosshair' : '';
  if (mode) ouvrirPanneau();
}

/** Clic sur l'image en mode remarque : pause, épingle, capture, champ de texte. */
async function poser(e) {
  if (M.lecteur) M.lecteur.pause();
  const r = scene().getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  const t = M.temps();
  const s = sceneA(t);
  const element = elementSous(e.clientX, e.clientY);
  attente = { t, scene: s ? s.id : null, tScene: s ? Math.max(0, t - s.debut) : null, x, y, element, image: null, imageSansEpingle: null, pret: null };
  montrerEpingle(x, y);
  ouvrirPanneau();
  const encours = attente;
  encours.pret = capturer(x, y).then((c) => { if (c) { encours.image = c.avec; encours.imageSansEpingle = c.sans; } });
  dessinerPanneau();
  const champ = panneau.querySelector('textarea');
  if (champ) champ.focus();
}

M.surClicImage = (e) => {
  if (!mode) return false;
  e.preventDefault();
  poser(e);
  return true;
};

async function garder(portee) {
  const champ = panneau.querySelector('textarea');
  const texte = champ ? champ.value.trim() : '';
  if (!texte) { message('Écrivez la remarque avant de la garder.'); return; }
  const a = attente || { t: M.temps(), ...(() => { const s = sceneA(M.temps()); return { scene: s ? s.id : null, tScene: s ? M.temps() - s.debut : null }; })(), x: null, y: null, element: null };
  if (a.pret) await a.pret;
  const corps = { portee, texte };
  if (portee !== 'video') Object.assign(corps, { t: a.t, scene: a.scene, tScene: a.tScene });
  if (portee === 'epingle') {
    if (a.x === null) { message('Cliquez d\'abord sur l\'image pour poser l\'épingle.'); return; }
    Object.assign(corps, { x: a.x, y: a.y, element: a.element, image: a.image || undefined });
  } else if (portee === 'image') {
    const c = a.imageSansEpingle || (await capturer(null, null) || {}).sans;
    if (c) corps.image = c;
  }
  try {
    await requete('/_pm/remarques', corps);
    attente = null;
    retirerEpingle();
    await charger();
    message('Remarque gardée.');
  } catch (err) {
    message(err.message);
  }
}

// --- Panneau ------------------------------------------------------------------------------------------------------------

function message(texte) {
  const m = panneau && panneau.querySelector('.pm-remarques-message');
  if (m) m.textContent = texte;
}

function ouvrirPanneau() {
  if (panneau) { panneau.hidden = false; return; }
  panneau = el('aside', { id: 'pm-remarques', 'data-pm-clavier': '', 'aria-label': 'Remarques',
    style: 'position:fixed;top:12px;right:12px;bottom:64px;z-index:22;width:320px;display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:10px;background:#1b1b1b;color:#eee;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgb(0 0 0/.45);overflow:hidden' }, document.body);
  try { sessionStorage.setItem(CLE_OUVERT, '1'); } catch { /* stockage indisponible */ }
  dessinerPanneau();
}

function fermerPanneau() {
  if (panneau) panneau.hidden = true;
  basculerMode(false);
  retirerEpingle();
  attente = null;
  try { sessionStorage.removeItem(CLE_OUVERT); } catch { /* ignoré */ }
}

function boutonTexte(parent, texte, action, principal = false) {
  const b = el('button', { type: 'button', texte, style: `padding:5px 10px;border:0;border-radius:6px;cursor:pointer;font:inherit;${principal ? 'background:#e8590c;color:#fff;font-weight:600' : 'background:#333;color:#eee'}` }, parent);
  b.addEventListener('click', (e) => { e.stopPropagation(); action(); });
  return b;
}

function dessinerPanneau() {
  if (!panneau) return;
  panneau.textContent = '';
  const tete = el('div', { style: 'display:flex;align-items:center;justify-content:space-between' }, panneau);
  el('strong', { texte: 'Remarques', style: 'font-size:15px' }, tete);
  boutonTexte(tete, 'Fermer', fermerPanneau);
  el('p', { texte: mode ? 'Cliquez sur l\'image à l\'endroit voulu (touche N : quitter).' : 'Cliquez sur « Remarque » (ou touche N), puis sur l\'image.', style: 'margin:0;color:#aaa' }, panneau);

  const saisie = el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, panneau);
  const champ = el('textarea', { rows: '3', maxlength: '2000', placeholder: attente ? `À ${horodatage(attente.t)} : votre remarque` : 'Votre remarque', style: 'width:100%;resize:vertical;padding:6px;border-radius:6px;border:1px solid #444;background:#111;color:#eee;font:inherit' }, saisie);
  champ.addEventListener('click', (e) => e.stopPropagation());
  const actions = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, saisie);
  boutonTexte(actions, 'Garder la remarque', () => garder('epingle'), true);
  boutonTexte(actions, 'Sur cette image, sans épingle', () => garder('image'));
  boutonTexte(actions, 'Sur toute la vidéo', () => garder('video'));

  const liste = el('ol', { class: 'pm-remarques-liste', style: 'flex:1;margin:0;padding:0;list-style:none;overflow:auto;display:flex;flex-direction:column;gap:6px' }, panneau);
  for (const r of remarques) {
    const li = el('li', { 'data-remarque': r.id, style: `padding:6px 8px;border-left:4px solid ${COULEURS[r.etat] || '#888'};border-radius:4px;background:#262626;cursor:pointer` }, liste);
    el('div', { texte: `${r.t === null || r.t === undefined ? 'Toute la vidéo' : horodatage(r.t)} · ${ETATS[r.etat] || r.etat}`, style: 'color:#aaa;font-size:12px' }, li);
    el('div', { texte: r.texte }, li);
    if (r.reponse) el('div', { texte: `Claude : ${r.reponse}`, style: 'color:#b2f2bb;margin-top:4px' }, li);
    if (r.question) el('div', { texte: `Claude demande : ${r.question}`, style: 'color:#a5d8ff;margin-top:4px' }, li);
    if (r.etat === 'faite' && r.image && r.imageApres) {
      // Avant / après côte à côte (spec 5.8, point 7 ; lien avec 5.10).
      const duo = el('div', { class: 'pm-avant-apres', style: 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px' }, li);
      for (const [src, legende] of [[`/_pm/remarques/${r.image}`, 'Avant'], [`/_pm/remarques/${r.imageApres}`, 'Après']]) {
        const f = el('figure', { style: 'margin:0' }, duo);
        el('img', { src, alt: legende, style: 'width:100%;display:block;border-radius:3px' }, f);
        el('figcaption', { texte: legende, style: 'font-size:11px;color:#aaa' }, f);
      }
    }
    if (r.etat !== 'faite') {
      const outils = el('div', { style: 'display:flex;gap:6px;margin-top:4px' }, li);
      boutonTexte(outils, 'Modifier', () => modifier(r));
      boutonTexte(outils, 'Retirer', () => retirer(r));
    }
    li.addEventListener('click', () => allerA(r));
  }
  if (!remarques.length) el('li', { texte: 'Aucune remarque pour l\'instant.', style: 'color:#888' }, liste);

  const pied = el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, panneau);
  const ouvertes = remarques.filter((r) => r.etat === 'ouverte' || r.etat === 'scene-disparue').length;
  boutonTexte(pied, ouvertes ? `Envoyer à Claude (${ouvertes})` : 'Envoyer à Claude', envoyer, true);
  el('p', { class: 'pm-remarques-message', role: 'status', style: 'margin:0;min-height:1.4em;color:#ffd8a8' }, pied);
}

function allerA(r) {
  if (r.t !== null && r.t !== undefined && M.lecteur) { M.lecteur.pause(); M.lecteur.aller(r.t); }
  montrerEpingle(r.x, r.y);
}

async function modifier(r) {
  const texte = prompt('Modifier la remarque', r.texte);
  if (texte === null) return;
  try { await requete(`/_pm/remarques/${r.id}`, { texte }); await charger(); } catch (e) { message(e.message); }
}

async function retirer(r) {
  try { await requete(`/_pm/remarques/${r.id}`, { retirer: true }); retirerEpingle(); await charger(); } catch (e) { message(e.message); }
}

async function envoyer() {
  try {
    const r = await requete('/_pm/remarques/envoyer', {});
    await charger();
    message(r.ouvertes ? `Envoyé : Claude va traiter ${r.ouvertes === 1 ? 'votre remarque' : `vos ${r.ouvertes} remarques`}.` : 'Envoyé : aucune remarque en attente.');
  } catch (e) { message(e.message); }
}

// --- Repères sur la piste ---------------------------------------------------------------------------------------------

function dessinerReperes() {
  const piste = M.lecteur && M.lecteur.piste;
  if (!piste) return;
  let couche = piste.querySelector('.pm-reperes-remarques');
  if (!couche) couche = el('div', { class: 'pm-reperes-remarques', 'aria-hidden': 'true', style: 'position:absolute;left:0;right:0;bottom:-7px;height:6px;pointer-events:none' }, piste);
  couche.textContent = '';
  for (const r of remarques) {
    if (r.t === null || r.t === undefined || !(M.duree > 0)) continue;
    el('span', { 'data-remarque': r.id, 'data-etat': r.etat, title: r.texte,
      style: `position:absolute;left:${(100 * r.t / M.duree).toFixed(3)}%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:${COULEURS[r.etat] || '#888'}` }, couche);
  }
}

async function charger() {
  try { remarques = (await requete('/_pm/remarques')).remarques || []; } catch { remarques = []; }
  dessinerReperes();
  dessinerPanneau();
}

function ajouterBouton() {
  const barre = document.getElementById('pm-lecteur');
  if (!barre || document.getElementById('pm-bouton-remarque')) return;
  bouton = el('button', { id: 'pm-bouton-remarque', type: 'button', texte: 'Remarque', title: 'Laisser une remarque sur l\'image (touche N)', 'aria-pressed': 'false',
    style: 'width:auto;padding:0 12px;border-radius:16px;font-weight:600' }, barre);
  bouton.addEventListener('click', (e) => { e.stopPropagation(); basculerMode(); });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'n' && e.key !== 'N') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const cible = e.target;
  if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || (cible.closest && cible.closest('#pm-studio, #pm-atelier, [data-pm-clavier]')))) return;
  basculerMode();
});

/** Pour les essais : état du mode et de la remarque en cours. */
M.remarquesApercu = { mode: () => mode, basculer: basculerMode, attente: () => (attente ? { ...attente, pret: undefined } : null), liste: () => remarques, recharger: charger };

if (!globalThis.__PM_VERSION__ && window.top === window) {
  M.pret.then(async () => {
    ajouterBouton();
    await charger();
    let ouvert = false;
    try { ouvert = sessionStorage.getItem(CLE_OUVERT) === '1'; } catch { /* ignoré */ }
    if (ouvert) ouvrirPanneau();
  });
}
