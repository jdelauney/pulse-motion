'use strict';
/* Noms des règles de contrôle, extraits du code (spec S2, 5.15) : partagé par documentation.test.js et
 * realisation.test.js. Aucun registre tenu à la main. */
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..', '..');

/** Fichiers d'un dossier, récursivement, dont le nom finit par l'une des extensions. */
function fichiers(dossier, extensions) {
  const r = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) r.push(...fichiers(p, extensions));
    else if (extensions.some((x) => e.name.endsWith(x))) r.push(p);
  }
  return r;
}

const CODE = [...fichiers(path.join(RACINE, 'scripts'), ['.js', '.mjs']), ...fichiers(path.join(RACINE, 'moteur'), ['.js', '.mjs'])];
const rel = (f) => path.relative(RACINE, f).split(path.sep).join('/');

/** `regle: 'option'` d'export-fidele.js dit d'où vient le nombre de navigateurs : ce n'est pas une règle de contrôle. */
const PAS_DES_REGLES = new Set(['option']);

/** Noms de règles du code : littéraux `regle: '…'`, `constater('…'`, aides `erreur('…'`, `signaler('…'`, `e('…'` (noms à
 *  tiret), et clés des messages des constats de la vidéo rendue (lib/rendu-controle.js). -> Map(nom -> fichier). */
function reglesDuCode() {
  const r = new Map();
  for (const f of CODE) {
    const t = fs.readFileSync(f, 'utf8');
    const motifs = [/regle: '([a-z][a-z0-9-]*)'/g, /constater\('([a-z][a-z0-9-]*)'/g, /\b(?:erreur|signaler|e|nonVerifie|ErreurRecette)\('([a-z][a-z0-9]*(?:-[a-z0-9]+)+)'/g];
    for (const m of motifs.flatMap((x) => [...t.matchAll(x)])) if (!PAS_DES_REGLES.has(m[1])) r.set(m[1], rel(f));
    // Règle choisie par une expression (`var regle = … ? 'a' : 'b'`).
    for (const s of t.matchAll(/\bregle = ([^;]+);/g)) for (const m of s[1].matchAll(/'([a-z][a-z0-9]*(?:-[a-z0-9]+)+)'/g)) r.set(m[1], rel(f));
  }
  const rendu = fs.readFileSync(path.join(RACINE, 'scripts', 'lib', 'rendu-controle.js'), 'utf8');
  const bloc = /const MESSAGES = \{([\s\S]*?)\n\};/.exec(rendu)[1];
  for (const m of bloc.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?: \(c\)/gm)) r.set(m[1], 'scripts/lib/rendu-controle.js');
  return r;
}

module.exports = { reglesDuCode, fichiers, CODE, rel, RACINE };
