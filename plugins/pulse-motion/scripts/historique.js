#!/usr/bin/env node
'use strict';
/* Pulse Motion – historique des retouches : une sauvegarde avant chaque retouche, « annule » la restaure.
 *
 *   node scripts/historique.js sauvegarder <dossier-du-projet>
 *   node scripts/historique.js annuler <dossier-du-projet>
 *
 * Sauvegarde deroule.json, scenes/, assets/, charte/, effets/ et personnages/ ; garde les 20 dernières sauvegardes.
 * Stockage par contenu (spec Rapidité 5.12, idée des caches par empreinte d'argo) :
 * - .historique/objets/<sha256> : chaque fichier, écrit une seule fois, par copie (jamais un lien dur : une prise
 *   réenregistrée sous le même nom modifierait l'historique) ;
 * - .historique/NNN.json : le manifeste d'une sauvegarde { version, numero, date, fichiers: { chemin: { empreinte, taille,
 *   date } }, dossiers } ; un fichier dont la taille et la date n'ont pas bougé depuis le dernier manifeste garde son
 *   empreinte sans être relu.
 * Les objets que plus aucun manifeste ne cite sont supprimés. Les anciennes copies .historique/NNN/ (avant 0.30.0)
 * restent restaurables telles quelles. Un manifeste annulé pourra être mis de côté (rétablir, versions nommées : S4)
 * sans changer ce format.
 * Affiche un résumé JSON ; code de sortie 1 avec un message en français en cas d'échec.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ecrireAtomique } = require('./lib/fichiers.js');

const CONSERVEES = 20;
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

/** -> { numero: '007', fichier } (manifeste .historique/NNN.json) */
function sauvegarder(dossier) {
  const projet = path.resolve(dossier);
  if (!fs.existsSync(path.join(projet, 'deroule.json'))) throw new Error('Aucun déroulé à sauvegarder dans ce dossier.');
  const racine = path.join(projet, '.historique');
  fs.mkdirSync(path.join(racine, OBJETS), { recursive: true });
  const existantes = sauvegardes(racine);
  const derniere = existantes[existantes.length - 1];
  const numero = String(derniere ? Number(derniere.numero) + 1 : 1).padStart(3, '0');
  // Dernier manifeste : un fichier de même taille et de même date garde son empreinte, sans être relu.
  let connus = {};
  const dernierManifeste = [...existantes].reverse().find((x) => x.type === 'manifeste');
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
  for (const ancienne of sauvegardes(racine).slice(0, -CONSERVEES)) retirer(racine, ancienne);
  nettoyerObjets(racine);
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

/** Restaure la dernière sauvegarde puis la retire. -> { numero } */
function annuler(dossier) {
  const projet = path.resolve(dossier);
  const racine = path.join(projet, '.historique');
  const existantes = sauvegardes(racine);
  if (!existantes.length) throw new Error('Aucune retouche à annuler.');
  const derniere = existantes[existantes.length - 1];
  if (derniere.type === 'copie') restaurerCopie(projet, racine, derniere.numero);
  else restaurerManifeste(projet, racine, lireManifeste(racine, derniere.numero));
  retirer(racine, derniere);
  nettoyerObjets(racine);
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

/** Numéros des sauvegardes présentes, de la plus ancienne à la plus récente. */
function listerSauvegardes(dossier) {
  return sauvegardes(path.join(path.resolve(dossier), '.historique')).map((s) => s.numero);
}

if (require.main === module) {
  const [action, dossier] = process.argv.slice(2);
  const actions = { sauvegarder, annuler };
  if (!actions[action] || !dossier) {
    console.error('Usage : node scripts/historique.js sauvegarder|annuler <dossier-du-projet>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(actions[action](dossier), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { sauvegarder, annuler, retirerSauvegarde, lireSauvegarde, listerSauvegardes, CONSERVEES };
