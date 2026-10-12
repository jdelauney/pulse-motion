'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const P = require('../scripts/lib/police.js');
const { police } = require('./aide/polices.js');

test('TTF, WOFF et WOFF2 : licence et caractères lus de la même façon', () => {
  for (const format of ['ttf', 'woff', 'woff2']) {
    assert.deepEqual(P.analyserPolice(police({ format })), { fsType: 0, interdite: false, apercuSeulement: false, manquants: [] }, format);
    assert.equal(P.analyserPolice(police({ format, fsType: 2 })).interdite, true, format);
    assert.equal(P.analyserPolice(police({ format, fsType: 4 })).apercuSeulement, true, format);
    assert.deepEqual(P.analyserPolice(police({ format, texte: P.FRANCAIS.replace('œ', '').replace('€', '') })).manquants, ['œ', '€'], format);
  }
  assert.equal(P.analyserPolice(police({ fsType: 0x000c })).apercuSeulement, false, 'modifiable l\'emporte');
});

test('vraies polices du style (WOFF2, tables connues) : intégration permise, français couvert', () => {
  const dossier = path.join(__dirname, '..', 'styles', 'clair-pedagogique', 'polices');
  for (const f of ['Figtree.woff2', 'Inter.woff2']) {
    const tables = P.lireTables(fs.readFileSync(path.join(dossier, f)));
    assert.ok(tables.has('cmap') && tables.has('OS/2'), f);
    const a = P.analyserPolice(fs.readFileSync(path.join(dossier, f)));
    assert.equal(a.interdite, false, f);
    assert.ok(!a.manquants.includes('é') && !a.manquants.includes('œ'), `${f} : ${a.manquants.join(' ')}`);
  }
});

test('fichier qui n\'est pas une police : message clair', () => {
  assert.throws(() => P.analyserPolice(Buffer.from('bonjour tout le monde')), /n'est pas une police TTF, OTF, WOFF ou WOFF2/);
});

test('trouverFichiersPolice : nom exact ou nom-graisse, premier dossier qui en a', () => {
  const a = dossierTemporaire('pm-pol-');
  const b = dossierTemporaire('pm-pol-');
  for (const f of ['Playfair Display-700.woff2', 'Playfair Display-400.woff2', 'Playfair.woff2', 'notes.txt']) fs.writeFileSync(path.join(a, f), 'x');
  fs.writeFileSync(path.join(b, 'Inter.woff2'), 'x');
  assert.deepEqual(P.trouverFichiersPolice('Playfair Display', [a, b]).map((f) => [path.basename(f.fichier), f.graisse]), [['Playfair Display-400.woff2', 400], ['Playfair Display-700.woff2', 700]]);
  assert.deepEqual(P.trouverFichiersPolice('Inter', [path.join(a, 'absent'), a, b]).map((f) => [path.basename(f.fichier), f.graisse]), [['Inter.woff2', null]]);
  assert.deepEqual(P.trouverFichiersPolice('Rien', [a, b]), []);
});

test('police dont la table des caractères pointe hors du fichier : message en français', () => {
  const p = police({ format: 'ttf' });
  // Table cmap déclarée bien plus longue que le fichier : sous-table hors limites.
  const n = p.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const e = 12 + i * 16;
    if (p.toString('latin1', e, e + 4) === 'cmap') { const off = p.readUInt32BE(e + 8); p.writeUInt32BE(0x00ffffff, off + 8); }
  }
  assert.throws(() => P.analyserPolice(p), /police abîmée ou illisible/);
});

test('fichiers d\'une famille : graisse et italique reconnus', () => {
  const a = dossierTemporaire('pm-pol-');
  for (const f of ['Fraunces-400.woff2', 'Fraunces-400-italic.woff2', 'Fraunces-600.woff2']) fs.writeFileSync(path.join(a, f), 'x');
  assert.deepEqual(P.trouverFichiersPolice('Fraunces', [a]).map((f) => [path.basename(f.fichier), f.graisse, f.italique]), [
    ['Fraunces-400.woff2', 400, false], ['Fraunces-400-italic.woff2', 400, true], ['Fraunces-600.woff2', 600, false],
  ]);
});
