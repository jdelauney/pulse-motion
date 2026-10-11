'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pol-'));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pol-'));
  for (const f of ['Playfair Display-700.woff2', 'Playfair Display-400.woff2', 'Playfair.woff2', 'notes.txt']) fs.writeFileSync(path.join(a, f), 'x');
  fs.writeFileSync(path.join(b, 'Inter.woff2'), 'x');
  assert.deepEqual(P.trouverFichiersPolice('Playfair Display', [a, b]).map((f) => [path.basename(f.fichier), f.graisse]), [['Playfair Display-400.woff2', 400], ['Playfair Display-700.woff2', 700]]);
  assert.deepEqual(P.trouverFichiersPolice('Inter', [path.join(a, 'absent'), a, b]).map((f) => [path.basename(f.fichier), f.graisse]), [['Inter.woff2', null]]);
  assert.deepEqual(P.trouverFichiersPolice('Rien', [a, b]), []);
});
