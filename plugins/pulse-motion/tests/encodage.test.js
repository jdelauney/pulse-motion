'use strict';
/* Encodage (spec S2, 5.17) : chaque lecture ou écriture de texte de scripts/ et moteur/ précise 'utf8'.
 * Une écriture est « de texte » quand ses données ne sont pas des octets (Buffer, PNG, WAV, octets lus) ; une lecture
 * l'est quand son résultat est lu comme du texte (.toString(), JSON.parse, découpé ou cherché). Les autres sont binaires.
 * Contre-exemple de video-director (idée 22) : un fichier lu sans encodage sur un système dont l'encodage n'est pas UTF-8. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');

function fichiers(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'whisper' ? [] : fichiers(p);
    return /\.(c|m)?js$/.test(e.name) ? [p] : [];
  });
}

/** Arguments de premier niveau de l'appel qui commence à code[debut] (juste après « ( ») ; -> { args, fin } */
function argumentsDe(code, debut) {
  const args = [];
  let profondeur = 0;
  let courant = '';
  let chaine = null;
  for (let i = debut; i < code.length; i++) {
    const c = code[i];
    if (chaine) {
      courant += c;
      if (c === '\\') { courant += code[++i]; continue; }
      if (c === chaine) chaine = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { chaine = c; courant += c; continue; }
    if (c === '(' || c === '[' || c === '{') profondeur++;
    if (c === ')' || c === ']' || c === '}') {
      if (profondeur === 0) { args.push(courant.trim()); return { args, fin: i }; }
      profondeur--;
    }
    if (c === ',' && profondeur === 0) { args.push(courant.trim()); courant = ''; continue; }
    courant += c;
  }
  return { args, fin: code.length };
}

const ENCODAGE = /^['"]utf-?8['"]$|encoding\s*:/;
const BINAIRE = /Buffer|png|wav|octets|W\.ecrire|capturer|reduirePng|^brut$|^donnees$|son\.wav/i;

function fautes(fichier) {
  const code = fs.readFileSync(fichier, 'utf8');
  const r = [];
  for (const m of code.matchAll(/\b(readFileSync|writeFileSync|appendFileSync)\(/g)) {
    const { args, fin } = argumentsDe(code, m.index + m[0].length);
    const ligne = code.slice(0, m.index).split('\n').length;
    const encode = args.slice(2).some((a) => ENCODAGE.test(a));
    if (m[1] === 'readFileSync') {
      if (args.slice(1).some((a) => ENCODAGE.test(a))) continue;
      const apres = code.slice(fin + 1, fin + 30);
      const avant = code.slice(Math.max(0, m.index - 40), m.index);
      if (/^\s*\.(toString\((?!\s*['"](base64|hex))|split\(|match\(|replace\(|includes\(|trim\()/.test(apres) || /JSON\.parse\(\s*(fs\.)?$/.test(avant)) r.push(`${path.relative(RACINE, fichier)}:${ligne}`);
    } else if (!encode && args[1] !== undefined && !BINAIRE.test(args[1])) {
      r.push(`${path.relative(RACINE, fichier)}:${ligne}`);
    }
  }
  return r;
}

test('encodage.test.js › tous les fichiers texte sont lus et écrits en utf8', () => {
  const liste = [...fichiers(path.join(RACINE, 'scripts')), ...fichiers(path.join(RACINE, 'moteur'))].flatMap(fautes);
  assert.deepEqual(liste, [], `lecture ou écriture de texte sans 'utf8' :\n${liste.join('\n')}`);
});

test('encodage.test.js › le repérage voit une écriture de texte sans encodage, et laisse les octets', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pm-encodage-'));
  const f = path.join(dir, 'essai.js');
  fs.writeFileSync(f, [
    "fs.writeFileSync(a, JSON.stringify(x));",
    "fs.writeFileSync(a, html, 'utf8');",
    "fs.writeFileSync(a, png);",
    "const j = JSON.parse(fs.readFileSync(b));",
    "const o = fs.readFileSync(b);",
    "const t = fs.readFileSync(b).toString();",
  ].join('\n'), 'utf8');
  assert.deepEqual(fautes(f).map((x) => x.split(':').pop()), ['1', '4', '6']);
  fs.rmSync(dir, { recursive: true, force: true });
});
