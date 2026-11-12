'use strict';
/* Spec « Lacunes créatives » (S9), plan S9-4, exigence 5.4 : QR codes fabriqués sur l'ordinateur (scripts/lib/qr.js). Le code est
 * vérifié par des vecteurs connus de la norme ISO/IEC 18004 et relu par un décodeur écrit ici, indépendant de l'encodeur : zones
 * réservées, masques, lecture en zigzag et blocs posés d'après la norme, Reed-Solomon vérifié par ses syndromes (et non par une
 * division, comme l'encodeur). */
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../scripts/lib/qr.js');

// --- Décodeur de test ----------------------------------------------------------------------------------------------------

// Corps GF(256) du décodeur (polynôme 0x11D), tables recalculées ici.
const EXP = [];
const LOG = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = (x * 2) ^ (x & 0x80 ? 0x11d : 0); }
const mul = (a, b) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);

// Norme, tableau 9 : blocs des versions essayées (mots de correction par bloc ; [nombre de blocs, mots de données]).
const BLOCS = {
  '1-M': { ecc: 10, groupes: [[1, 16]] },
  '2-M': { ecc: 16, groupes: [[1, 28]] },
  '5-Q': { ecc: 18, groupes: [[2, 15], [2, 16]] },
  '7-H': { ecc: 26, groupes: [[4, 13], [1, 14]] },
  '10-L': { ecc: 18, groupes: [[2, 68], [2, 69]] },
};
// Norme, annexe E : centres des motifs d'alignement.
const ALIGNEMENT = { 1: [], 2: [6, 18], 5: [6, 30], 7: [6, 22, 38], 10: [6, 28, 50] };
const NIVEAUX = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

/** Format attendu (15 bits) pour des bits de correction et un masque : BCH(15, 5), par division bit à bit, puis masque 0x5412. */
function formatAttendu(niveau, masque) {
  const donnees = (niveau << 3) | masque;
  let reste = donnees << 10;
  const g = 0b10100110111;
  for (let b = 14; b >= 10; b--) if (reste & (1 << b)) reste ^= g << (b - 10);
  return ((donnees << 10) | reste) ^ 0b101010000010010;
}

function decoderQR(m) {
  const n = m.length;
  const version = (n - 17) / 4;
  assert.ok(Number.isInteger(version) && version >= 1, `taille ${n}`);
  const lu = (r, c) => (m[r][c] ? 1 : 0);
  // Motifs de position : 7 × 7, anneau clair, cœur 3 × 3 ; séparateurs clairs.
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const bord = r === 0 || r === 6 || c === 0 || c === 6;
      const coeur = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      assert.equal(lu(r0 + r, c0 + c), bord || coeur ? 1 : 0, `motif de position (${r0 + r}, ${c0 + c})`);
    }
  }
  for (let i = 8; i < n - 8; i++) { assert.equal(lu(6, i), i % 2 ? 0 : 1, 'synchronisation horizontale'); assert.equal(lu(i, 6), i % 2 ? 0 : 1, 'synchronisation verticale'); }
  assert.equal(lu(n - 8, 8), 1, 'module toujours foncé');
  // Information de format, première copie (bit 14 en premier) et seconde copie.
  const premiere = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const seconde = [[n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8], [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1]];
  const lire = (pos) => pos.reduce((v, [r, c]) => (v << 1) | lu(r, c), 0);
  const f1 = lire(premiere);
  assert.equal(lire(seconde), f1, 'les deux copies du format sont égales');
  let trouve = null;
  for (let niveau = 0; niveau < 4; niveau++) for (let masque = 0; masque < 8; masque++) if (formatAttendu(niveau, masque) === f1) trouve = { niveau, masque };
  assert.ok(trouve, `format ${f1.toString(2)} inconnu`);
  const correction = NIVEAUX[trouve.niveau];
  // Zones réservées (norme, 6.3) : rien n'y est lu.
  const align = ALIGNEMENT[version];
  assert.ok(align, `version ${version} hors des tables du test`);
  const reserve = (r, c) => {
    if ((r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9) || r === 6 || c === 6) return true;
    if (version >= 7 && ((r < 6 && c >= n - 11 && c < n - 8) || (c < 6 && r >= n - 11 && r < n - 8))) return true;
    for (const ar of align) for (const ac of align) {
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === align[align.length - 1]) || (ar === align[align.length - 1] && ac === 6)) continue;
      if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
    }
    return false;
  };
  // Masques (norme, tableau 10 : i ligne, j colonne).
  const MASQUES = [(i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0];
  const masque = MASQUES[trouve.masque];
  // Lecture en zigzag : deux colonnes à la fois depuis la droite, en montant puis en descendant, colonne 6 sautée.
  const bits = [];
  let monte = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let k = 0; k < n; k++) {
      const r = monte ? n - 1 - k : k;
      for (const cc of [c, c - 1]) if (!reserve(r, cc)) bits.push(lu(r, cc) ^ (masque(r, cc) ? 1 : 0));
    }
    monte = !monte;
  }
  const mots = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) mots.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  // Blocs : désentrelacement, puis syndromes de Reed-Solomon (tous nuls pour un bloc juste).
  const t = BLOCS[`${version}-${correction}`];
  assert.ok(t, `blocs ${version}-${correction} hors des tables du test`);
  const blocs = [];
  for (const [nombre, longueur] of t.groupes) for (let i = 0; i < nombre; i++) blocs.push({ donnees: new Array(longueur), corr: new Array(t.ecc) });
  const plusLong = Math.max(...blocs.map((b) => b.donnees.length));
  let k = 0;
  for (let i = 0; i < plusLong; i++) for (const b of blocs) if (i < b.donnees.length) b.donnees[i] = mots[k++];
  for (let i = 0; i < t.ecc; i++) for (const b of blocs) b.corr[i] = mots[k++];
  for (const b of blocs) {
    const cw = b.donnees.concat(b.corr);
    for (let s = 0; s < t.ecc; s++) {
      let somme = 0;
      for (let j = 0; j < cw.length; j++) somme ^= mul(cw[j], EXP[(s * (cw.length - 1 - j)) % 255]);
      assert.equal(somme, 0, `syndrome ${s} non nul`);
    }
  }
  const donnees = blocs.flatMap((b) => b.donnees);
  const flux = donnees.flatMap((o) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (o >> i) & 1));
  let p = 0;
  const prendre = (nb) => { let v = 0; for (let i = 0; i < nb; i++) v = (v << 1) | flux[p++]; return v; };
  assert.equal(prendre(4), 0b0100, 'mode octets');
  const longueur = prendre(version <= 9 ? 8 : 16);
  const octets = [];
  for (let i = 0; i < longueur; i++) octets.push(prendre(8));
  return { version, correction, masque: trouve.masque, texte: Buffer.from(octets).toString('utf8') };
}

// --- Vecteurs de la norme ----------------------------------------------------------------------------------------------------

test('qr : Reed-Solomon donne les mots de correction connus (HELLO WORLD, 1-M)', () => {
  const donnees = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Q.reedSolomon(donnees, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('qr : information de format et de version, motifs d\'alignement et capacités de la norme', () => {
  const format = { 'L-0': '111011111000100', 'L-1': '111001011110011', 'L-2': '111110110101010', 'L-3': '111100010011101',
    'M-0': '101010000010010', 'M-1': '101000100100101', 'Q-0': '011010101011111', 'H-0': '001011010001001' };
  for (const [cle, attendu] of Object.entries(format)) {
    const [niveau, masque] = cle.split('-');
    assert.equal(Q.bitsFormat(niveau, Number(masque)).toString(2).padStart(15, '0'), attendu, cle);
  }
  assert.equal(Q.bitsVersion(7), 0x07c94);
  assert.equal(Q.bitsVersion(8), 0x085bc);
  assert.equal(Q.bitsVersion(40), 0x28c69);
  assert.deepEqual(Q.positionsAlignement(1), []);
  assert.deepEqual(Q.positionsAlignement(2), [6, 18]);
  assert.deepEqual(Q.positionsAlignement(7), [6, 22, 38]);
  assert.deepEqual(Q.positionsAlignement(15), [6, 26, 48, 70]);
  assert.deepEqual(Q.positionsAlignement(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(Q.positionsAlignement(40), [6, 30, 58, 86, 114, 142, 170]);
  assert.equal(Q.motsTotal(1), 26);
  assert.equal(Q.motsTotal(7), 196);
  assert.equal(Q.motsTotal(40), 3706);
  const capacites = { '1-L': 17, '1-M': 14, '1-Q': 11, '1-H': 7, '10-M': 213, '40-L': 2953, '40-H': 1273 };
  for (const [cle, n] of Object.entries(capacites)) {
    const [v, niveau] = cle.split('-');
    assert.equal(Q.capaciteOctets(Number(v), niveau), n, cle);
  }
});

// --- Relecture par le décodeur ------------------------------------------------------------------------------------------------

test('qr : le texte « https://exemple.fr » se décode (décodeur indépendant des tests) et suit la norme', () => {
  const qr = Q.encoderQR('https://exemple.fr');
  assert.equal(qr.version, 2);
  assert.equal(qr.correction, 'M');
  const lu = decoderQR(qr.modules);
  assert.deepEqual(lu, { version: 2, correction: 'M', masque: qr.masque, texte: 'https://exemple.fr' });
  // Même texte, même matrice : fabriqué à l'identique à chaque assemblage.
  assert.deepEqual(Q.encoderQR('https://exemple.fr').modules, qr.modules);
});

test('qr : plusieurs versions, blocs de tailles différentes, information de version et UTF-8 se décodent', () => {
  const cas = [
    ['https://ex.fr', 'M', 1],
    ['https://exemple.fr/inscription?session=2026-11&groupe=4', 'Q', 5],
    ['Café à l\'été : inscription sur https://exemple.fr/atelier', 'H', 7],
    [`https://exemple.fr/${'a'.repeat(231)}`, 'L', 10],
  ];
  for (const [texte, correction, version] of cas) {
    const qr = Q.encoderQR(texte, { correction });
    assert.equal(qr.version, version, `${texte.slice(0, 30)} : version`);
    const lu = decoderQR(qr.modules);
    assert.equal(lu.texte, texte);
    assert.equal(lu.correction, correction);
  }
});

test('qr : tracé SVG en un seul chemin avec une marge de 4 modules ; refus en français', () => {
  const qr = Q.encoderQR('https://exemple.fr');
  const svg = Q.svgQR(qr);
  assert.equal(svg.viewBox, `0 0 ${qr.taille + 8} ${qr.taille + 8}`);
  assert.equal((svg.corps.match(/<path/g) || []).length, 1);
  assert.match(svg.corps, /^<rect width="\d+" height="\d+" fill="#fff"\/><path fill="#000" d="M4 4h7v1h-7z/);
  assert.throws(() => Q.encoderQR('x', { correction: 'Z' }), /niveau de correction « Z » inconnu/);
  assert.throws(() => Q.encoderQR('x'.repeat(3000), { correction: 'H' }), /trop long pour un QR code/);
});
