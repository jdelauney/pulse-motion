'use strict';
/* Pulse Motion – remarques épinglées sur l'image (spec Retouches et ergonomie, 5.8).
 *
 * La personne pose une remarque dans l'aperçu, à un instant (et souvent à un endroit) de la vidéo ; Claude la traite, puis
 * ne la marque faite qu'avec l'image d'après, prise à cet instant après la retouche et regardée.
 *
 * sortie/remarques/remarques.json (écriture atomique ; hors de l'historique : « annule » ne les efface pas, et hors du
 * réassemblage de l'aperçu) :
 *   { version: 1, remarques: [{ id: "r-0007", creee, historique, scene, tScene, t, x, y, element, texte, image,
 *     etat: "ouverte" | "faite" | "a-discuter" | "scene-disparue", reponse, question, faiteDans, imageApres, envoyee }],
 *     envois: [{ date, ouvertes }] }
 * Images : sortie/remarques/<id>.jpg (capture de l'instant, épingle dessinée, JPEG vérifié, 3 Mo au plus) et
 * <id>-apres.png (l'instant après la retouche, recopié de sortie/planche/instant-<ms>.png).
 * Ré-ancrage : quand les durées changent, t se recalcule par scene et tScene (bornés à la scène) ; une scène supprimée
 * marque la remarque « scene-disparue », à discuter.
 * Principes de la salle de relecture de take-one (scripts/review-room/server.mjs : notes, envoi, « done » ;
 * references/review-room.md : recopier les mots avant de changer, marquer fait seulement quand la nouvelle version répond ;
 * MIT, Tal Siach, voir THIRD-PARTY-NOTICES.md), réécrits pour l'horloge du moteur.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ecrireAtomique, ecrireJSON } = require('./fichiers.js');

const DOSSIER = path.join('sortie', 'remarques');
const FICHIER = 'remarques.json';
const TEXTE_MAX = 2000;
const IMAGE_MAX = 3 * 1024 * 1024;
const ID = /^r-\d{4,}$/;
const ELEMENT = /^[A-Za-z0-9_-]{1,80}$/;
const ETATS = ['ouverte', 'faite', 'a-discuter', 'scene-disparue'];
/** Remarques qui attendent Claude (traiter, ou poser sa question). */
const A_TRAITER = ['ouverte', 'scene-disparue'];
/** Attente de l'envoi : 2 h au plus (spec 5.8, point 4). */
const ATTENTE_MAX = 2 * 3600 * 1000;
const CONTENU = ['deroule.json', 'scenes', 'assets', 'charte', 'effets', 'personnages'];

const arrondi = (x) => Math.round(x * 1000) / 1000;
const dossierRemarques = (projet) => path.join(path.resolve(projet), DOSSIER);
const fichierRemarques = (projet) => path.join(dossierRemarques(projet), FICHIER);

class ErreurRemarque extends Error {
  constructor(message, statut = 400) { super(message); this.statut = statut; }
}

/** -> { version: 1, remarques, envois } (vide si absent ou illisible). */
function lire(projet) {
  try {
    const d = JSON.parse(fs.readFileSync(fichierRemarques(projet), 'utf8'));
    return { version: 1, remarques: Array.isArray(d.remarques) ? d.remarques : [], envois: Array.isArray(d.envois) ? d.envois : [] };
  } catch {
    return { version: 1, remarques: [], envois: [] };
  }
}

function ecrire(projet, donnees) {
  ecrireJSON(fichierRemarques(projet), { version: 1, remarques: donnees.remarques, envois: donnees.envois });
}

function prochainId(remarques) {
  const max = remarques.reduce((m, r) => Math.max(m, Number(String(r.id).slice(2)) || 0), 0);
  return `r-${String(max + 1).padStart(4, '0')}`;
}

/** Instant posé sur une image de la vidéo, et le nom de sa capture (planche --instants) : instant-<ms>.png. */
function instantImage(t, ips = 30) {
  return arrondi(Math.max(0, Math.round(t * ips) / ips));
}
const nomInstant = (t, ips = 30) => `instant-${Math.round(instantImage(t, ips) * 1000)}.png`;

/** Numéro de la dernière sauvegarde d'historique (pile « annule »), ou null. */
function curseurHistorique(projet) {
  try { return require('../historique.js').journal(projet).curseur || null; } catch { return null; }
}

/** Déroulé et minutage de Node (scènes allongées par leur voix). -> { deroule, scenes: [{ id, debut, fin }], ips } | null */
function minutage(projet) {
  const { lireDeroule } = require('./deroule.js');
  const { deroule, erreurs } = lireDeroule(path.resolve(projet));
  if (!deroule || erreurs.length) return null;
  try {
    const m = require('./voix.js').minutageVideo(path.resolve(projet), deroule);
    return { deroule, scenes: m.scenes.map((s) => ({ id: s.id, debut: s.debut, fin: s.fin })), ips: (deroule.format && deroule.format.ips) || 30, duree: m.duree };
  } catch {
    return null;
  }
}

/** Image JPEG venue de la page : data:image/jpeg;base64,…, 3 Mo au plus, en-tête FF D8 FF. -> Buffer */
function imageJpeg(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new ErreurRemarque('Image refusée : une image JPEG est attendue.');
  if (m[1].length > Math.ceil(IMAGE_MAX / 3) * 4 + 4) throw new ErreurRemarque('Image refusée : 3 Mo au plus.', 413);
  const octets = Buffer.from(m[1], 'base64');
  if (octets.length > IMAGE_MAX) throw new ErreurRemarque('Image refusée : 3 Mo au plus.', 413);
  if (octets.length < 4 || octets[0] !== 0xff || octets[1] !== 0xd8 || octets[2] !== 0xff) throw new ErreurRemarque('Image refusée : ce n\'est pas une image JPEG.');
  return octets;
}

function texteValide(texte) {
  const t = typeof texte === 'string' ? texte.trim() : '';
  if (!t) throw new ErreurRemarque('Écrivez la remarque avant de la garder.');
  if (t.length > TEXTE_MAX) throw new ErreurRemarque(`Remarque trop longue : ${TEXTE_MAX} caractères au plus.`);
  return t;
}

const nombre = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * creer(projet, { portee, scene, tScene, t, x, y, element, texte, image }) -> remarque
 * portee : « epingle » (instant et endroit), « image » (sur cette image, sans épingle), « video » (sur toute la vidéo).
 */
function creer(projet, entree = {}) {
  const portee = ['epingle', 'image', 'video'].includes(entree.portee) ? entree.portee : 'epingle';
  const texte = texteValide(entree.texte);
  const donnees = lire(projet);
  const id = prochainId(donnees.remarques);
  const r = { id, creee: new Date().toISOString(), historique: curseurHistorique(projet), scene: null, tScene: null, t: null, x: null, y: null,
    element: null, texte, image: null, etat: 'ouverte', reponse: null, faiteDans: null, imageApres: null };
  if (portee !== 'video') {
    if (!nombre(entree.t) || entree.t < 0) throw new ErreurRemarque('Instant de la remarque illisible.');
    const m = minutage(projet);
    const ips = m ? m.ips : 30;
    r.t = instantImage(entree.t, ips);
    const scene = m && (m.scenes.find((s) => s.id === entree.scene) || [...m.scenes].reverse().find((s) => r.t >= s.debut - 1e-6));
    if (scene) {
      r.scene = scene.id;
      r.tScene = arrondi(Math.max(0, r.t - scene.debut));
    } else if (typeof entree.scene === 'string' && /^[a-z0-9-]+$/.test(entree.scene)) {
      r.scene = entree.scene;
      r.tScene = nombre(entree.tScene) ? arrondi(Math.max(0, entree.tScene)) : null;
    }
    if (portee === 'epingle') {
      if (!nombre(entree.x) || !nombre(entree.y) || entree.x < 0 || entree.x > 1 || entree.y < 0 || entree.y > 1) throw new ErreurRemarque('Endroit de la remarque illisible.');
      r.x = arrondi(entree.x);
      r.y = arrondi(entree.y);
      if (typeof entree.element === 'string' && ELEMENT.test(entree.element)) r.element = entree.element;
    }
  }
  if (entree.image !== undefined && entree.image !== null && entree.image !== '') {
    const octets = imageJpeg(entree.image);
    ecrireAtomique(path.join(dossierRemarques(projet), `${id}.jpg`), octets);
    r.image = `${id}.jpg`;
  }
  donnees.remarques.push(r);
  ecrire(projet, donnees);
  return r;
}

function trouverRemarque(donnees, id) {
  if (!ID.test(String(id || ''))) throw new ErreurRemarque('Remarque inconnue.', 404);
  const r = donnees.remarques.find((x) => x.id === id);
  if (!r) throw new ErreurRemarque(`Remarque ${id} inconnue.`, 404);
  return r;
}

/** modifier(projet, id, { texte } | { retirer: true }) : texte modifié, ou remarque retirée par la personne (image comprise). */
function modifier(projet, id, { texte, retirer = false } = {}) {
  const donnees = lire(projet);
  const r = trouverRemarque(donnees, id);
  if (retirer) {
    donnees.remarques = donnees.remarques.filter((x) => x !== r);
    for (const f of [r.image, r.imageApres]) if (f) fs.rmSync(path.join(dossierRemarques(projet), f), { force: true });
    ecrire(projet, donnees);
    return { id, retiree: true };
  }
  r.texte = texteValide(texte);
  if (r.etat === 'a-discuter') r.etat = 'ouverte';
  ecrire(projet, donnees);
  return r;
}

/** « Envoyer à Claude » : les remarques ouvertes sont marquées envoyées, l'envoi est noté. -> { ouvertes, envoi } */
function envoyer(projet) {
  const donnees = lire(projet);
  const ouvertes = donnees.remarques.filter((r) => A_TRAITER.includes(r.etat));
  for (const r of ouvertes) r.envoyee = true;
  const envoi = { date: new Date().toISOString(), ouvertes: ouvertes.length };
  donnees.envois.push(envoi);
  ecrire(projet, donnees);
  return { ouvertes: ouvertes.length, envoi };
}

/**
 * Ré-ancrage (spec 5.8, point 5) : t recalculé par scene et tScene, borné à la scène ; scène supprimée -> « scene-disparue ».
 * Écrit seulement si quelque chose change. -> donnees
 */
function reancrer(projet, donnees = lire(projet)) {
  const m = minutage(projet);
  if (!m) return donnees;
  let change = false;
  for (const r of donnees.remarques) {
    if (!r.scene || r.tScene === null || r.tScene === undefined) continue;
    const s = m.scenes.find((x) => x.id === r.scene);
    if (!s) {
      if (r.etat === 'ouverte') { r.etat = 'scene-disparue'; change = true; }
      continue;
    }
    const tScene = Math.min(Math.max(0, r.tScene), Math.max(0, s.fin - s.debut - 1 / m.ips));
    const t = instantImage(s.debut + tScene, m.ips);
    if (t !== r.t) { r.t = t; change = true; }
    if (r.etat === 'scene-disparue') { r.etat = 'ouverte'; change = true; }
  }
  if (change) ecrire(projet, donnees);
  return donnees;
}

/** Chemins utiles à Claude (image à lire avec Read). */
function pourClaude(r) {
  return { ...r, ...(r.image ? { fichierImage: `sortie/remarques/${r.image}` } : {}), ...(r.imageApres ? { fichierImageApres: `sortie/remarques/${r.imageApres}` } : {}) };
}

/** -> { remarques, ouvertes, aDiscuter, faites } (ré-ancrées) */
function liste(projet) {
  const donnees = reancrer(projet);
  const de = (etats) => donnees.remarques.filter((r) => etats.includes(r.etat)).map(pourClaude);
  return { remarques: donnees.remarques.map(pourClaude), ouvertes: de(A_TRAITER), aDiscuter: de(['a-discuter']), faites: de(['faite']) };
}

/** Compte pour pulse-motion etat : { ouvertes, envoyees } (envoyees : ouvertes déjà envoyées à Claude). */
function compte(projet) {
  const { remarques } = lire(projet);
  const ouvertes = remarques.filter((r) => A_TRAITER.includes(r.etat));
  return { ouvertes: ouvertes.length, envoyees: ouvertes.filter((r) => r.envoyee).length };
}

/** Date du dernier changement du contenu de la vidéo (déroulé, scènes, médias, charte, effets, personnages), en ms. */
function dernierChangement(projet) {
  let max = 0;
  const visiter = (abs) => {
    let st;
    try { st = fs.statSync(abs); } catch { return; }
    if (st.isDirectory()) { for (const n of fs.readdirSync(abs)) if (!n.startsWith('.')) visiter(path.join(abs, n)); } else if (st.mtimeMs > max) max = st.mtimeMs;
  };
  for (const n of CONTENU) visiter(path.join(path.resolve(projet), n));
  return max;
}

/**
 * Capture d'après pour une remarque : sortie/planche/instant-<ms>.png de son instant (ré-ancré), à une image près, prise après
 * le dernier changement de la vidéo ; pour une remarque sur toute la vidéo, la capture d'instant la plus récente. -> chemin | null
 */
function captureApres(projet, r, ips) {
  const dossier = path.join(path.resolve(projet), 'sortie', 'planche');
  let fichiers;
  try { fichiers = fs.readdirSync(dossier).filter((f) => /^instant-\d+\.png$/.test(f)); } catch { return null; }
  const apres = dernierChangement(projet);
  const candidats = fichiers.map((f) => ({ f, ms: Number(f.slice(8, -4)), date: fs.statSync(path.join(dossier, f)).mtimeMs }))
    .filter((c) => c.date >= apres)
    .filter((c) => r.t === null || r.t === undefined || Math.abs(c.ms - r.t * 1000) <= 1000 / ips + 1)
    .sort((a, b) => b.date - a.date);
  return candidats.length ? path.join(dossier, candidats[0].f) : null;
}

/**
 * faite(projet, id, reponse) : la remarque est faite, avec sa réponse en une phrase et l'image d'après (obligatoire : une
 * capture de son instant prise après la retouche, par pulse-motion planche . --instants <t>). -> remarque
 */
function faite(projet, id, reponse) {
  const donnees = reancrer(projet);
  const r = trouverRemarque(donnees, id);
  const phrase = typeof reponse === 'string' ? reponse.trim() : '';
  if (!phrase) throw new ErreurRemarque('Il faut dire en une phrase ce qui a été fait pour cette remarque.');
  const m = minutage(projet);
  const ips = m ? m.ips : 30;
  const capture = captureApres(projet, r, ips);
  if (!capture) {
    const quand = r.t === null || r.t === undefined ? 'un instant de la vidéo' : `l'instant ${r.t} s`;
    throw new ErreurRemarque(`Remarque ${id} : pas d'image d'après. Capturer ${quand} après la retouche (pulse-motion planche . --instants ${r.t === null || r.t === undefined ? '<t>' : r.t}), la regarder, puis la marquer faite.`, 409);
  }
  const nom = `${id}-apres.png`;
  ecrireAtomique(path.join(dossierRemarques(projet), nom), fs.readFileSync(capture));
  Object.assign(r, { etat: 'faite', reponse: phrase, faiteDans: curseurHistorique(projet), imageApres: nom, faiteLe: new Date().toISOString() });
  ecrire(projet, donnees);
  return pourClaude(r);
}

/** discuter(projet, id, question) : remarque de goût, de direction ou incomprise : « a-discuter », avec la question. */
function discuter(projet, id, question) {
  const donnees = lire(projet);
  const r = trouverRemarque(donnees, id);
  const q = typeof question === 'string' ? question.trim() : '';
  if (!q) throw new ErreurRemarque('Il faut la question à poser à la personne.');
  Object.assign(r, { etat: 'a-discuter', question: q });
  ecrire(projet, donnees);
  return pourClaude(r);
}

/**
 * attendre(projet, { delai?, intervalle? }) : rend la main au prochain « Envoyer à Claude » (2 h au plus), avec les remarques
 * ouvertes. -> Promise<{ envoi: boolean, ouvertes, message? }>
 */
function attendre(projet, { delai = ATTENTE_MAX, intervalle = 1000 } = {}) {
  const depart = lire(projet).envois.length;
  const fin = Date.now() + Math.min(delai, ATTENTE_MAX);
  return new Promise((resolve) => {
    const verifier = () => {
      const envois = lire(projet).envois.length;
      if (envois > depart) { clearInterval(minuterie); resolve({ envoi: true, ouvertes: liste(projet).ouvertes }); return true; }
      if (Date.now() >= fin) {
        clearInterval(minuterie);
        resolve({ envoi: false, ouvertes: liste(projet).ouvertes, message: 'Aucune remarque envoyée pendant l\'attente.' });
        return true;
      }
      return false;
    };
    const minuterie = setInterval(verifier, intervalle);
    verifier();
  });
}

module.exports = { lire, creer, modifier, envoyer, reancrer, liste, compte, faite, discuter, attendre, imageJpeg, instantImage, nomInstant,
  dernierChangement, captureApres, dossierRemarques, fichierRemarques, ErreurRemarque, TEXTE_MAX, IMAGE_MAX, ETATS, ATTENTE_MAX, ID };
