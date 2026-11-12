'use strict';
/* Pulse Motion – journal des erreurs de la personne (spec Retouches et ergonomie, 5.20).
 *
 * ~/.pulse-motion/erreurs.jsonl : une ligne JSON par sortie en erreur d'une commande, les 20 dernières seulement :
 *   { date, commande, code, message, empreinte }
 *   - commande : le nom de la sous-commande seul, jamais ses arguments (ni dossier, ni texte, ni fichier) ;
 *   - message : la fin de ce que la commande a dit, chemins anonymisés, 400 caractères au plus ;
 *   - empreinte : 8 caractères, tirés du message sans chiffres ni chemins (deux erreurs pareilles ont la même).
 * Rien n'est écrit pendant les tests sans PULSE_MOTION_DOSSIER (lib/personnel.js), ni si le dossier est impossible à écrire.
 *
 * anonymiser(texte, { projet }) : dossier du projet -> <dossier>, dossier personnel -> ~, autres chemins absolus -> <chemin>.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dossierPersonnelEcrivable, dossierPersonnel } = require('./personnel.js');

const MAX_LIGNES = 20;
const MAX_MESSAGE = 400;

const echapperRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Un chemin et ses variantes d'écriture (barres obliques dans un sens ou dans l'autre, /e/… de Git sous Windows). */
function formes(chemin) {
  if (!chemin) return [];
  const absolu = path.resolve(chemin);
  const f = new Set([absolu, absolu.replace(/\\/g, '/'), absolu.replace(/\//g, '\\')]);
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(absolu);
  if (m) f.add(`/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`);
  return [...f].filter((x) => x.length > 3).sort((a, b) => b.length - a.length);
}

function anonymiser(texte, { projet = null, maison = os.homedir() } = {}) {
  let t = String(texte == null ? '' : texte);
  for (const f of formes(projet)) t = t.replace(new RegExp(echapperRegex(f), 'gi'), '<dossier>');
  for (const f of formes(maison)) t = t.replace(new RegExp(echapperRegex(f), 'gi'), '~');
  // Restes : lecteurs Windows, chemins Unix absolus d'au moins deux niveaux.
  t = t.replace(/\b[A-Za-z]:[\\/][^\s"'«»,;)]*/g, '<chemin>');
  t = t.replace(/(^|[\s"'(«])\/(?:[^\s/"'«»,;)]+\/)+[^\s"'«»,;)]*/g, '$1<chemin>');
  return t;
}

/** Empreinte d'un message : sans chiffres ni chemins, 8 caractères. */
function empreinteMessage(message) {
  const neutre = anonymiser(message).replace(/<dossier>|<chemin>|~/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(neutre).digest('hex').slice(0, 8);
}

/** Message utile d'une commande en erreur : dernières lignes de stderr, sinon le message du JSON de stdout. */
function messageDe({ sortie = '', erreur = '' } = {}) {
  const lignes = String(erreur).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lignes.length) return lignes.slice(-3).join(' ');
  const s = String(sortie).trim();
  try {
    const j = JSON.parse(s.slice(s.indexOf('{')));
    const e = Array.isArray(j.erreurs) && j.erreurs[0];
    return String(j.message || (e && (e.message || e)) || '');
  } catch { return s.split(/\r?\n/).slice(-3).join(' '); }
}

function fichierJournal(dossier) { return dossier ? path.join(dossier, 'erreurs.jsonl') : null; }

/** Ajoute une erreur au journal (les 20 dernières gardées). -> l'entrée, ou null si rien n'a été écrit. */
function noterErreur({ commande, code, message, projet = process.cwd(), dossier = dossierPersonnelEcrivable(), date = new Date() }) {
  const fichier = fichierJournal(dossier);
  if (!fichier || !/^[a-z][a-z0-9-]*$/.test(String(commande || ''))) return null;
  const texte = anonymiser(message, { projet }).replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
  const entree = { date: date.toISOString(), commande, code, message: texte, empreinte: empreinteMessage(message) };
  try {
    const avant = lireErreurs({ dossier });
    const lignes = avant.concat(entree).slice(-MAX_LIGNES).map((e) => JSON.stringify(e));
    fs.mkdirSync(dossier, { recursive: true });
    const tmp = `${fichier}.${process.pid}.part`;
    fs.writeFileSync(tmp, `${lignes.join('\n')}\n`, 'utf8');
    fs.renameSync(tmp, fichier);
    return entree;
  } catch { return null; }
}

/** Erreurs du journal, la plus ancienne d'abord (lignes illisibles ignorées). */
function lireErreurs({ dossier = dossierPersonnel() } = {}) {
  let texte = '';
  try { texte = fs.readFileSync(fichierJournal(dossier), 'utf8'); } catch { return []; }
  return texte.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

module.exports = { noterErreur, lireErreurs, anonymiser, empreinteMessage, messageDe, MAX_LIGNES, MAX_MESSAGE };
