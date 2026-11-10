#!/usr/bin/env node
'use strict';
/* Pulse Motion – historique des retouches : une sauvegarde avant chaque retouche ; « annule » la restaure, « rétablis »
 * revient sur l'annulation ; une version se nomme et se retrouve (spec Retouches et ergonomie, 5.9).
 *
 *   node scripts/historique.js sauvegarder <dossier> [--phrase "<retouche>"]
 *   node scripts/historique.js annuler|retablir|liste <dossier>
 *   node scripts/historique.js nommer "<nom>" <dossier>
 *   node scripts/historique.js revenir <numéro|nom> <dossier>
 *   node scripts/historique.js oublier "<nom>" <dossier>
 *
 * Sauvegarde deroule.json, scenes/, assets/, charte/, effets/ et personnages/.
 * Stockage par contenu (spec Rapidité 5.12, idée des caches par empreinte d'argo) :
 * - .historique/objets/<sha256> : chaque fichier, écrit une seule fois, par copie (jamais un lien dur : une prise
 *   réenregistrée sous le même nom modifierait l'historique) ;
 * - .historique/NNN.json : le manifeste d'un état { version, numero, date, fichiers: { chemin: { empreinte, taille,
 *   date } }, dossiers } ; un fichier dont la taille et la date n'ont pas bougé depuis le dernier manifeste garde son
 *   empreinte sans être relu.
 * - .historique/journal.json : { version: 1, curseur, entrees: [{ numero, date, phrase, nom, garde }], retablir: [{ numero,
 *   date, phrase }] }. Les entrées non gardées sont la pile « annule » (les 20 dernières) ; une version nommée (garde) est
 *   un instantané hors de cette rotation, 20 au plus ; « retablir » est la pile « rétablis », vidée par toute nouvelle
 *   sauvegarde. Journal absent (projet d'avant 0.43.0) : reconstruit depuis les sauvegardes présentes.
 * Les objets que plus aucun manifeste ne cite sont supprimés. Les anciennes copies .historique/NNN/ (avant 0.30.0)
 * restent restaurables telles quelles.
 * materialiser(dossier, version, cible) reconstitue une version dans un dossier à part (avant / après, comparaison).
 * Affiche un résumé JSON ; code de sortie 1 avec un message en français en cas d'échec.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ecrireAtomique } = require('./lib/fichiers.js');

const CONSERVEES = 20;
const NOMMEES_MAX = 20;
const JOURNAL = 'journal.json';
const CONTENU = ['deroule.json', 'scenes', 'assets', 'charte', 'effets', 'personnages'];
// Voix provisoires : recalculables, hors des sauvegardes, et gardées telles quelles par « annule ».
const PROVISOIRES = path.join('assets', 'voix', 'provisoire');
const OBJETS = 'objets';
const EMPREINTE = /^[0-9a-f]{64}$/;

const versPosix = (rel) => rel.split(path.sep).join('/');
const depuisPosix = (rel) => rel.split('/').join(path.sep);
const estProvisoire = (rel) => rel === PROVISOIRES || rel.startsWith(PROVISOIRES + path.sep);

/** Sauvegardes, de la plus ancienne à la plus récente : [{ numero, type: 'manifeste' | 'copie' }]. */
function sauvegardes(racine) {
  if (!fs.existsSync(racine)) return [];
  const liste = [];
  for (const e of fs.readdirSync(racine, { withFileTypes: true })) {
    if (e.isDirectory() && /^\d{3,}$/.test(e.name)) liste.push({ numero: e.name, type: 'copie' });
    else if (e.isFile() && /^\d{3,}\.json$/.test(e.name)) liste.push({ numero: e.name.slice(0, -5), type: 'manifeste' });
  }
  return liste.sort((a, b) => Number(a.numero) - Number(b.numero));
}

const fichierManifeste = (racine, numero) => path.join(racine, `${numero}.json`);
const lireManifeste = (racine, numero) => JSON.parse(fs.readFileSync(fichierManifeste(racine, numero), 'utf8'));

/** Fichiers et dossiers du contenu sauvegardé (chemins relatifs du système), voix provisoires exclues. */
function parcourir(projet) {
  const fichiers = [];
  const dossiers = [];
  const visiter = (rel) => {
    if (estProvisoire(rel)) return;
    const abs = path.join(projet, rel);
    let st;
    try { st = fs.statSync(abs); } catch { return; }
    if (st.isDirectory()) {
      dossiers.push(rel);
      for (const nom of fs.readdirSync(abs).sort()) visiter(path.join(rel, nom));
    } else if (st.isFile()) fichiers.push(rel);
  };
  CONTENU.forEach(visiter);
  return { fichiers, dossiers };
}

const empreinteDe = (octets) => crypto.createHash('sha256').update(octets).digest('hex');

/** Objet écrit une seule fois (copie complète, écriture atomique). */
function ecrireObjet(racine, empreinte, octets) {
  const cible = path.join(racine, OBJETS, empreinte);
  if (!fs.existsSync(cible)) ecrireAtomique(cible, octets);
}

/** Supprime les objets que plus aucun manifeste ne cite (et les écritures interrompues). */
function nettoyerObjets(racine) {
  const dossier = path.join(racine, OBJETS);
  if (!fs.existsSync(dossier)) return;
  const cites = new Set();
  for (const s of sauvegardes(racine).filter((x) => x.type === 'manifeste')) {
    try { for (const f of Object.values(lireManifeste(racine, s.numero).fichiers || {})) cites.add(f.empreinte); } catch { /* manifeste illisible : ses objets ne sont pas protégés */ }
  }
  for (const nom of fs.readdirSync(dossier)) {
    if (EMPREINTE.test(nom) ? !cites.has(nom) : /\.part$/.test(nom)) fs.rmSync(path.join(dossier, nom), { force: true });
  }
}

/** Instantané de l'état courant dans le manifeste .historique/<numero>.json (objets écrits d'abord). */
function ecrireInstantane(projet, racine, numero) {
  fs.mkdirSync(path.join(racine, OBJETS), { recursive: true });
  // Dernier manifeste : un fichier de même taille et de même date garde son empreinte, sans être relu.
  let connus = {};
  const dernierManifeste = [...sauvegardes(racine)].reverse().find((x) => x.type === 'manifeste');
  if (dernierManifeste) { try { connus = lireManifeste(racine, dernierManifeste.numero).fichiers || {}; } catch { connus = {}; } }
  const { fichiers, dossiers } = parcourir(projet);
  const manifeste = { version: 1, numero, date: new Date().toISOString(), fichiers: {}, dossiers: dossiers.map(versPosix) };
  for (const rel of fichiers) {
    const abs = path.join(projet, rel);
    const st = fs.statSync(abs);
    const cle = versPosix(rel);
    const connu = connus[cle];
    let empreinte;
    if (connu && connu.taille === st.size && connu.date === st.mtimeMs && fs.existsSync(path.join(racine, OBJETS, connu.empreinte))) {
      empreinte = connu.empreinte;
    } else {
      const octets = fs.readFileSync(abs);
      empreinte = empreinteDe(octets);
      ecrireObjet(racine, empreinte, octets);
    }
    manifeste.fichiers[cle] = { empreinte, taille: st.size, date: st.mtimeMs };
  }
  // Le manifeste après ses objets : une sauvegarde interrompue ne cite jamais un objet absent.
  ecrireAtomique(fichierManifeste(racine, numero), JSON.stringify(manifeste, null, 1));
  return manifeste;
}

// --- Journal (spec Retouches et ergonomie, 5.9) ---------------------------------------------------------------------

const fichierJournal = (racine) => path.join(racine, JOURNAL);
const texteOuNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Journal relu et accordé aux fichiers présents : une entrée dont l'état a disparu est oubliée ; un état présent que le
 * journal ne cite pas (journal absent, ou écriture interrompue entre l'état et le journal) devient une entrée ordinaire.
 */
function lireJournal(racine) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(fichierJournal(racine), 'utf8')); } catch { j = null; }
  const presents = new Map(sauvegardes(racine).map((s) => [s.numero, s]));
  const entrees = (j && Array.isArray(j.entrees) ? j.entrees : []).filter((e) => e && presents.has(e.numero))
    .map((e) => ({ numero: e.numero, date: e.date || null, phrase: texteOuNull(e.phrase), nom: texteOuNull(e.nom), garde: e.garde === true }));
  const retablir = (j && Array.isArray(j.retablir) ? j.retablir : []).filter((e) => e && presents.has(e.numero) && !entrees.some((x) => x.numero === e.numero))
    .map((e) => ({ numero: e.numero, date: e.date || null, phrase: texteOuNull(e.phrase) }));
  const cites = new Set([...entrees, ...retablir].map((e) => e.numero));
  for (const s of presents.values()) {
    if (!cites.has(s.numero)) entrees.push({ numero: s.numero, date: null, phrase: null, nom: null, garde: false });
  }
  entrees.sort((a, b) => Number(a.numero) - Number(b.numero));
  return { version: 1, curseur: null, entrees, retablir };
}

function ecrireJournal(racine, j) {
  const pile = j.entrees.filter((e) => !e.garde);
  j.curseur = pile.length ? pile[pile.length - 1].numero : null;
  ecrireAtomique(fichierJournal(racine), JSON.stringify(j, null, 1));
}

function prochainNumero(racine) {
  const existantes = sauvegardes(racine);
  const derniere = existantes[existantes.length - 1];
  return String(derniere ? Number(derniere.numero) + 1 : 1).padStart(3, '0');
}

/** Retire les états que le journal ne cite plus (manifestes et anciennes copies), puis les objets orphelins. */
function ranger(racine, j) {
  const cites = new Set([...j.entrees, ...j.retablir].map((e) => e.numero));
  for (const s of sauvegardes(racine)) if (!cites.has(s.numero)) retirer(racine, s);
  nettoyerObjets(racine);
}

/** Rotation : les CONSERVEES dernières entrées non nommées. */
function tourner(j) {
  const pile = j.entrees.filter((e) => !e.garde);
  const enTrop = new Set(pile.slice(0, Math.max(0, pile.length - CONSERVEES)).map((e) => e.numero));
  j.entrees = j.entrees.filter((e) => !enTrop.has(e.numero));
}

function preparer(dossier, { exiger = true } = {}) {
  const projet = path.resolve(dossier);
  if (exiger && !fs.existsSync(path.join(projet, 'deroule.json'))) throw new Error('Aucun déroulé à sauvegarder dans ce dossier.');
  const racine = path.join(projet, '.historique');
  return { projet, racine };
}

/**
 * sauvegarder(dossier, { phrase? }) -> { numero, fichier } : l'état courant, avant une retouche dont la phrase est gardée
 * (« ralentis la scène 3 »). Une nouvelle sauvegarde vide la pile « à rétablir ».
 */
function sauvegarder(dossier, { phrase = null } = {}) {
  const { projet, racine } = preparer(dossier);
  fs.mkdirSync(path.join(racine, OBJETS), { recursive: true });
  const j = lireJournal(racine);
  const numero = prochainNumero(racine);
  const manifeste = ecrireInstantane(projet, racine, numero);
  j.entrees.push({ numero, date: manifeste.date, phrase: texteOuNull(phrase), nom: null, garde: false });
  j.retablir = [];
  tourner(j);
  ecrireJournal(racine, j);
  ranger(racine, j);
  return { numero, fichier: fichierManifeste(racine, numero) };
}

function retirer(racine, s) {
  if (s.type === 'copie') fs.rmSync(path.join(racine, s.numero), { recursive: true, force: true });
  else fs.rmSync(fichierManifeste(racine, s.numero), { force: true });
}

/** Retire une sauvegarde (écriture ratée juste après elle : « annule » ne la consommera pas à vide). */
function retirerSauvegarde(dossier, numero) {
  const racine = path.join(path.resolve(dossier), '.historique');
  const s = sauvegardes(racine).find((x) => x.numero === numero);
  if (!s) return;
  const j = lireJournal(racine);
  j.entrees = j.entrees.filter((e) => e.numero !== numero);
  ecrireJournal(racine, j);
  retirer(racine, s);
  nettoyerObjets(racine);
}

/** Ancienne copie complète .historique/NNN/ : restaurée comme avant 0.30.0. */
function restaurerCopie(projet, racine, numero) {
  const source = path.join(racine, numero);
  const provisoires = path.join(projet, PROVISOIRES);
  const deCote = fs.existsSync(provisoires) ? fs.mkdtempSync(path.join(racine, 'provisoires-')) : null;
  if (deCote) fs.cpSync(provisoires, deCote, { recursive: true });
  for (const nom of CONTENU) {
    fs.rmSync(path.join(projet, nom), { recursive: true, force: true });
    if (fs.existsSync(path.join(source, nom))) fs.cpSync(path.join(source, nom), path.join(projet, nom), { recursive: true });
  }
  if (deCote) {
    fs.cpSync(deCote, provisoires, { recursive: true });
    fs.rmSync(deCote, { recursive: true, force: true });
  }
}

/** Manifeste : chaque fichier remis octet pour octet (écriture atomique), ceux qui n'y sont pas retirés (contenu seulement). */
function restaurerManifeste(projet, racine, manifeste) {
  const voulus = new Map(Object.entries(manifeste.fichiers || {}).map(([cle, f]) => [depuisPosix(cle), f]));
  const actuels = parcourir(projet);
  for (const rel of actuels.fichiers) if (!voulus.has(rel)) fs.rmSync(path.join(projet, rel), { force: true });
  for (const rel of (manifeste.dossiers || []).map(depuisPosix)) {
    const abs = path.join(projet, rel);
    if (fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) fs.rmSync(abs, { force: true });
    fs.mkdirSync(abs, { recursive: true });
  }
  for (const [rel, f] of voulus) {
    const abs = path.join(projet, rel);
    // Déjà juste : laissé tel quel (une grosse prise inchangée n'est pas réécrite).
    let juste = false;
    try { juste = fs.statSync(abs).size === f.taille && empreinteDe(fs.readFileSync(abs)) === f.empreinte; } catch { juste = false; }
    if (juste) continue;
    const octets = fs.readFileSync(path.join(racine, OBJETS, f.empreinte));
    if (empreinteDe(octets) !== f.empreinte) throw new Error(`Historique abîmé : la sauvegarde de « ${versPosix(rel)} » est illisible ; rien d'autre n'a été changé.`);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) fs.rmSync(abs, { recursive: true, force: true });
    ecrireAtomique(abs, octets);
  }
  // Dossiers apparus depuis la sauvegarde : retirés s'ils sont vides (les voix provisoires restent).
  const gardes = new Set((manifeste.dossiers || []).map(depuisPosix));
  for (const rel of parcourir(projet).dossiers.sort((a, b) => b.length - a.length)) {
    if (gardes.has(rel)) continue;
    const abs = path.join(projet, rel);
    try { if (!fs.readdirSync(abs).length) fs.rmdirSync(abs); } catch { /* laissé */ }
  }
}

/** Remet l'état d'une entrée dans le projet (manifeste ou ancienne copie). */
function restaurer(projet, racine, numero) {
  const s = sauvegardes(racine).find((x) => x.numero === numero);
  if (!s) throw new Error(`Historique abîmé : la version ${numero} est introuvable ; rien n'a été changé.`);
  if (s.type === 'copie') restaurerCopie(projet, racine, numero);
  else restaurerManifeste(projet, racine, lireManifeste(racine, numero));
}

const dernierePile = (j) => [...j.entrees].reverse().find((e) => !e.garde) || null;

/**
 * « annule » : l'état courant est mis de côté (« à rétablir »), puis la dernière sauvegarde est restaurée et retirée de la
 * pile. -> { numero, phrase? } (la retouche défaite)
 */
function annuler(dossier) {
  const { projet, racine } = preparer(dossier, { exiger: false });
  const j = lireJournal(racine);
  const derniere = dernierePile(j);
  if (!derniere) throw new Error('Aucune retouche à annuler.');
  const numero = prochainNumero(racine);
  const manifeste = ecrireInstantane(projet, racine, numero);
  j.retablir.push({ numero, date: manifeste.date, phrase: derniere.phrase });
  restaurer(projet, racine, derniere.numero);
  j.entrees = j.entrees.filter((e) => e !== derniere);
  ecrireJournal(racine, j);
  ranger(racine, j);
  return { numero: derniere.numero, ...(derniere.phrase ? { phrase: derniere.phrase } : {}) };
}

/** « rétablis » : revient sur la dernière annulation (l'état courant redevient une sauvegarde). -> { numero, phrase? } */
function retablir(dossier) {
  const { projet, racine } = preparer(dossier, { exiger: false });
  const j = lireJournal(racine);
  const cible = j.retablir[j.retablir.length - 1];
  if (!cible) throw new Error('Rien à rétablir : aucune retouche n\'a été annulée depuis la dernière.');
  const numero = prochainNumero(racine);
  const manifeste = ecrireInstantane(projet, racine, numero);
  j.entrees.push({ numero, date: manifeste.date, phrase: cible.phrase, nom: null, garde: false });
  restaurer(projet, racine, cible.numero);
  j.retablir.pop();
  tourner(j);
  ecrireJournal(racine, j);
  ranger(racine, j);
  return { numero: cible.numero, ...(cible.phrase ? { phrase: cible.phrase } : {}) };
}

const memeNom = (a, b) => Boolean(a && b) && a.toLocaleLowerCase('fr').trim() === String(b).toLocaleLowerCase('fr').trim();

/** Version désignée par son numéro (« 14 », « 014 »), son nom, ou « precedente » (la dernière sauvegarde). -> entrée | null */
function trouver(j, version) {
  const v = String(version || '').trim();
  if (!v) return null;
  if (/^pr[eé]c[eé]dente$/i.test(v)) return dernierePile(j);
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return j.entrees.find((e) => Number(e.numero) === n) || null;
  }
  return j.entrees.find((e) => e.garde && memeNom(e.nom, v)) || null;
}

function inconnue(j, version) {
  const noms = j.entrees.filter((e) => e.garde).map((e) => `« ${e.nom} »`);
  return new Error(`Aucune version « ${version} »${noms.length ? ` ; versions nommées : ${noms.join(', ')}` : ''}.`);
}

/** Version nommée : un instantané de l'état courant, gardé hors de la rotation (20 au plus). -> { numero, nom } */
function nommer(dossier, nom) {
  const { projet, racine } = preparer(dossier);
  const propre = texteOuNull(nom);
  if (!propre) throw new Error('Il faut un nom pour garder cette version (par exemple « envoyée au client »).');
  if (propre.length > 80) throw new Error('Ce nom est trop long : 80 caractères au plus.');
  if (/^\d+$/.test(propre) || /^pr[eé]c[eé]dente$/i.test(propre)) throw new Error('Choisissez un nom avec des lettres (par exemple « envoyée au client ») : un numéro désigne déjà une sauvegarde.');
  fs.mkdirSync(path.join(racine, OBJETS), { recursive: true });
  const j = lireJournal(racine);
  const nommees = j.entrees.filter((e) => e.garde);
  if (nommees.some((e) => memeNom(e.nom, propre))) throw new Error(`Une version s'appelle déjà « ${propre} » : choisissez un autre nom.`);
  if (nommees.length >= NOMMEES_MAX) {
    throw new Error(`Vous gardez déjà ${NOMMEES_MAX} versions nommées (${nommees.map((e) => `« ${e.nom} »`).join(', ')}) : dites laquelle oublier avant d'en garder une autre.`);
  }
  const numero = prochainNumero(racine);
  const manifeste = ecrireInstantane(projet, racine, numero);
  j.entrees.push({ numero, date: manifeste.date, phrase: null, nom: propre, garde: true });
  ecrireJournal(racine, j);
  return { numero, nom: propre };
}

/** Oublie une version nommée (l'état courant ne change pas). -> { numero, nom } */
function oublier(dossier, nom) {
  const { racine } = preparer(dossier, { exiger: false });
  const j = lireJournal(racine);
  const e = j.entrees.find((x) => x.garde && memeNom(x.nom, nom));
  if (!e) throw inconnue(j, nom);
  j.entrees = j.entrees.filter((x) => x !== e);
  ecrireJournal(racine, j);
  ranger(racine, j);
  return { numero: e.numero, nom: e.nom };
}

/**
 * Revient à une version (numéro ou nom) : l'état courant est sauvegardé d'abord, avec la phrase « revenir à … », pour que
 * « annule » défasse ce retour. -> { numero, nom, sauvegarde }
 */
function revenir(dossier, version) {
  const { projet, racine } = preparer(dossier);
  const j = lireJournal(racine);
  const cible = trouver(j, version);
  if (!cible) throw inconnue(j, version);
  const libelle = cible.nom ? `« ${cible.nom} »` : `la version ${cible.numero}`;
  const { numero } = sauvegarder(projet, { phrase: `revenir à ${libelle}` });
  restaurer(projet, racine, cible.numero);
  return { numero: cible.numero, nom: cible.nom, sauvegarde: numero };
}

/** Versions, de la plus récente à la plus ancienne. -> { versions: [{ numero, date, phrase, nom, garde }], aRetablir, nommees } */
function liste(dossier) {
  const { racine } = preparer(dossier, { exiger: false });
  const j = lireJournal(racine);
  return { versions: [...j.entrees].reverse(), aRetablir: j.retablir.length, nommees: j.entrees.filter((e) => e.garde).length };
}

/** Journal tel qu'il est (aperçu : menu « Comparer avec… »). */
function journal(dossier) {
  return lireJournal(path.join(path.resolve(dossier), '.historique'));
}

/** Empreinte d'une version (copie ancienne ou manifeste) : clé de cache, sans rien reconstituer. */
function empreinteVersion(racine, s) {
  if (s.type === 'copie') return empreinteDe(Buffer.from(`copie:${s.numero}:${fs.statSync(path.join(racine, s.numero)).mtimeMs}`));
  const manifeste = lireManifeste(racine, s.numero);
  return empreinteDe(Buffer.from(JSON.stringify(Object.entries(manifeste.fichiers || {}).map(([c, f]) => [c, f.empreinte]))));
}

/** identifier(dossier, version) -> { numero, nom, empreinte } (sans rien reconstituer). */
function identifier(dossier, version) {
  const { racine } = preparer(dossier, { exiger: false });
  const j = lireJournal(racine);
  const e = trouver(j, version);
  if (!e) throw inconnue(j, version);
  return { numero: e.numero, nom: e.nom, empreinte: empreinteVersion(racine, sauvegardes(racine).find((x) => x.numero === e.numero)) };
}

/**
 * materialiser(dossier, version, cible) : reconstitue une version (numéro, nom ou « precedente ») dans le dossier cible,
 * vidé d'abord (jamais le projet lui-même). Les voix provisoires, hors des sauvegardes, sont celles du projet.
 * -> { numero, nom, dossier, empreinte } (empreinte : celle du manifeste, pour un cache)
 */
function materialiser(dossier, version, cible) {
  const { projet, racine } = preparer(dossier, { exiger: false });
  const j = lireJournal(racine);
  const e = trouver(j, version);
  if (!e) throw inconnue(j, version);
  const dest = path.resolve(cible);
  if (dest === projet || projet.startsWith(dest + path.sep) || dest.startsWith(projet + path.sep)) {
    throw new Error('Une version se reconstitue dans un dossier à part, jamais dans le projet.');
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const s = sauvegardes(racine).find((x) => x.numero === e.numero);
  let empreinte;
  if (s.type === 'copie') {
    for (const nom of CONTENU) {
      const src = path.join(racine, e.numero, nom);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(dest, nom), { recursive: true });
    }
  } else {
    const manifeste = lireManifeste(racine, e.numero);
    for (const rel of (manifeste.dossiers || []).map(depuisPosix)) fs.mkdirSync(path.join(dest, rel), { recursive: true });
    for (const [cle, f] of Object.entries(manifeste.fichiers || {})) {
      const abs = path.join(dest, depuisPosix(cle));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.copyFileSync(path.join(racine, OBJETS, f.empreinte), abs);
    }
  }
  empreinte = empreinteVersion(racine, s);
  const provisoires = path.join(projet, PROVISOIRES);
  if (fs.existsSync(provisoires)) fs.cpSync(provisoires, path.join(dest, PROVISOIRES), { recursive: true });
  return { numero: e.numero, nom: e.nom, dossier: dest, empreinte };
}

/**
 * Défait la dernière sauvegarde sans rien mettre de côté (usage interne : une écriture ratée juste après une sauvegarde,
 * police ou glossaire) : rien n'est proposé à « rétablir ». -> { numero }
 */
function defaire(dossier) {
  const { projet, racine } = preparer(dossier, { exiger: false });
  const j = lireJournal(racine);
  const derniere = dernierePile(j);
  if (!derniere) throw new Error('Aucune retouche à annuler.');
  restaurer(projet, racine, derniere.numero);
  j.entrees = j.entrees.filter((e) => e !== derniere);
  ecrireJournal(racine, j);
  ranger(racine, j);
  return { numero: derniere.numero };
}

/** Contenu d'un fichier dans une sauvegarde (chemin relatif au projet, avec des /), ou null. */
function lireSauvegarde(dossier, numero, relatif) {
  const racine = path.join(path.resolve(dossier), '.historique');
  const s = sauvegardes(racine).find((x) => x.numero === numero);
  if (!s) return null;
  if (s.type === 'copie') {
    const f = path.join(racine, numero, depuisPosix(relatif));
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  const f = (lireManifeste(racine, numero).fichiers || {})[relatif];
  return f ? fs.readFileSync(path.join(racine, OBJETS, f.empreinte)) : null;
}

/** Numéros des sauvegardes de la pile « annule », de la plus ancienne à la plus récente (versions nommées à part). */
function listerSauvegardes(dossier) {
  const racine = path.join(path.resolve(dossier), '.historique');
  if (!fs.existsSync(racine)) return [];
  return lireJournal(racine).entrees.filter((e) => !e.garde).map((e) => e.numero);
}

/** Arguments de la ligne de commande : action, valeur (nommer, revenir, oublier), dossier, --phrase. */
function lireArguments(args) {
  const [action, ...reste] = args;
  const iPhrase = reste.indexOf('--phrase');
  const phrase = iPhrase >= 0 ? reste[iPhrase + 1] : null;
  const libres = reste.filter((a, k) => !(a === '--phrase' || (iPhrase >= 0 && k === iPhrase + 1)));
  const avecValeur = ['nommer', 'revenir', 'oublier'].includes(action);
  return { action, valeur: avecValeur ? libres[0] : null, dossier: (avecValeur ? libres[1] : libres[0]) || '.', phrase };
}

if (require.main === module) {
  const { action, valeur, dossier, phrase } = lireArguments(process.argv.slice(2));
  const actions = {
    sauvegarder: () => sauvegarder(dossier, { phrase }),
    annuler: () => annuler(dossier),
    retablir: () => retablir(dossier),
    liste: () => liste(dossier),
    nommer: () => nommer(dossier, valeur),
    revenir: () => revenir(dossier, valeur),
    oublier: () => oublier(dossier, valeur),
  };
  if (!actions[action] || (['nommer', 'revenir', 'oublier'].includes(action) && !valeur)) {
    console.error('Usage : node scripts/historique.js sauvegarder <dossier> [--phrase "<retouche>"] | annuler|retablir|liste <dossier> | nommer|revenir|oublier "<nom ou numéro>" <dossier>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(actions[action](), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { sauvegarder, annuler, retablir, nommer, oublier, revenir, liste, journal, identifier, materialiser, defaire, retirerSauvegarde, lireSauvegarde, listerSauvegardes, lireArguments, CONSERVEES, NOMMEES_MAX };
