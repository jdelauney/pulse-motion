#!/usr/bin/env node
'use strict';
/* Pulse Motion – mémoire des goûts de la personne (spec Retouches et ergonomie, 5.13).
 *
 *   node scripts/preferences.js [liste [--genre <g>] [--style <s>]]
 *   node scripts/preferences.js noter "<citation>" "<règle>" [--domaine <d>] [--genre <g>] [--style <s>] [--video "<titre>"]
 *   node scripts/preferences.js retirer <id>
 *
 * ~/.pulse-motion/preferences.json : { version: 1, preferences: [{ id, citation, regle, domaine, portee: { genre, style },
 * date, video }] }. La citation est gardée telle quelle et datée ; 30 préférences au plus. liste : celles qui valent pour ce
 * genre et ce style (portée vide : toutes les vidéos). Ordre de priorité, appliqué par les compétences : la demande du
 * moment, puis les préférences, puis le style, puis les valeurs par défaut. Les règles de mouvement propres à la personne
 * (spec S3) s'écrivent ici, domaine « mouvement ». Préférence de portée style (spec S11, 5.3) : domaine « style », portée qui
 * nomme le style voulu (« toujours le tableau blanc pour mes formations ») : ce style est proposé en premier, avant tout le
 * reste (styles --genre). Le chantier H (bibliothèque) emporte ce fichier.
 * Résumé JSON ; code 1 avec { ok: false, message } en cas de refus.
 */
const fs = require('node:fs');
const path = require('node:path');
const { dossierPersonnel } = require('./lib/personnel.js');
const { ecrireAtomique } = require('./lib/fichiers.js');

const DOMAINES = ['mouvement', 'texte', 'couleur', 'son', 'rythme', 'structure', 'style', 'autre'];
const MAX = 30;
const MAX_TEXTE = 300;
const SLUG = /^[a-z0-9-]+$/;

const fichier = (dossier = dossierPersonnel()) => path.join(dossier, 'preferences.json');

function lirePreferences(dossier) {
  try {
    const j = JSON.parse(fs.readFileSync(fichier(dossier), 'utf8'));
    return Array.isArray(j.preferences) ? j.preferences : [];
  } catch { return []; }
}

function ecrire(liste, dossier = dossierPersonnel()) {
  fs.mkdirSync(dossier, { recursive: true });
  ecrireAtomique(fichier(dossier), `${JSON.stringify({ version: 1, preferences: liste }, null, 2)}\n`);
}

/** Préférences valables pour ce genre et ce style (portée vide : toutes). */
function listerPreferences({ genre = null, style = null, dossier } = {}) {
  const vaut = (p) => {
    const g = p.portee && p.portee.genre;
    const s = p.portee && p.portee.style;
    return (!g || !genre || g === genre) && (!s || !style || s === style);
  };
  return { ok: true, preferences: lirePreferences(dossier).filter(vaut), max: MAX };
}

function noterPreference({ citation, regle, domaine = 'autre', genre = null, style = null, video = null, dossier, date = new Date() }) {
  const texte = (x) => typeof x === 'string' && x.trim() !== '' && x.length <= MAX_TEXTE;
  if (!texte(citation)) return { ok: false, message: `La phrase de la personne est obligatoire (${MAX_TEXTE} caractères au plus).` };
  if (!texte(regle)) return { ok: false, message: `La règle est obligatoire (${MAX_TEXTE} caractères au plus).` };
  if (!DOMAINES.includes(domaine)) return { ok: false, message: `Domaine inconnu : « ${domaine} » ; domaines : ${DOMAINES.join(', ')}.` };
  for (const [nom, v] of [['genre', genre], ['style', style]]) {
    if (v !== null && !SLUG.test(v)) return { ok: false, message: `« ${nom} » : seulement des lettres minuscules, des chiffres et des tirets.` };
  }
  const liste = lirePreferences(dossier);
  if (liste.length >= MAX) {
    return { ok: false, message: `Vous avez déjà ${MAX} préférences retenues, le maximum : retirez-en une avant d'en noter une autre (dites « quelles sont mes préférences ? »).` };
  }
  const n = liste.reduce((m, p) => Math.max(m, Number(String(p.id || '').replace(/^p-/, '')) || 0), 0) + 1;
  const preference = { id: `p-${String(n).padStart(3, '0')}`, citation, regle: regle.trim(), domaine, portee: { genre, style },
    date: date.toISOString().slice(0, 10), video: typeof video === 'string' && video.trim() ? video.trim().slice(0, 120) : null };
  ecrire(liste.concat(preference), dossier);
  return { ok: true, preference, total: liste.length + 1, max: MAX };
}

function retirerPreference({ id, dossier }) {
  const liste = lirePreferences(dossier);
  if (!liste.some((p) => p.id === id)) return { ok: false, message: `Préférence « ${id} » introuvable.` };
  ecrire(liste.filter((p) => p.id !== id), dossier);
  return { ok: true, retiree: id, total: liste.length - 1 };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const OPTIONS = ['--genre', '--style', '--domaine', '--video'];
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : null; };
  const libres = args.filter((x, i) => !x.startsWith('--') && !OPTIONS.includes(args[i - 1]));
  const [action = 'liste', a, b] = libres;
  let r;
  if (action === 'liste') r = listerPreferences({ genre: valeur('--genre'), style: valeur('--style') });
  else if (action === 'noter') r = noterPreference({ citation: a, regle: b, domaine: valeur('--domaine') || 'autre', genre: valeur('--genre'), style: valeur('--style'), video: valeur('--video') });
  else if (action === 'retirer') r = retirerPreference({ id: a });
  else {
    console.error('Usage : pulse-motion preferences [liste [--genre g] [--style s] | noter "<citation>" "<règle>" [--domaine d] [--genre g] [--style s] [--video "<titre>"] | retirer <id>]');
    process.exit(2);
  }
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

module.exports = { listerPreferences, noterPreference, retirerPreference, lirePreferences, DOMAINES, MAX };
