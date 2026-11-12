'use strict';
/* Pulse Motion – QR codes (spec S9, 5.4), fabriqués sur l'ordinateur, sans dépendance ni service en ligne.
 * Écrit d'après la norme ISO/IEC 18004 (mode octets, versions 1 à 40, correction L, M, Q ou H, masque choisi par les
 * pénalités de la norme) ; aucun code repris. Côté Node seulement : la page ne reçoit que le tracé SVG des modules.
 *
 * encoderQR(texte, { correction = 'M' }) -> { version, taille, correction, masque, modules: [[bool]] } (modules[y][x], vrai :
 *   foncé). Le texte est écrit en UTF-8 ; erreur en français s'il ne tient pas dans un QR code.
 * svgQR(qr, { encre = '#000', fond = '#fff', marge = 4 }) -> { viewBox, corps } : un <rect> de fond et un seul <path> des
 *   modules (shape-rendering crispEdges), marge de 4 modules.
 * Outils exposés pour les tests : reedSolomon(donnees, n), bitsFormat(correction, masque), bitsVersion(version),
 *   positionsAlignement(version), capaciteOctets(version, correction), BLOCS.
 */

const CORRECTIONS = ['L', 'M', 'Q', 'H'];
// Bits de la correction dans l'information de format (norme, tableau 12).
const BITS_CORRECTION = { L: 1, M: 0, Q: 3, H: 2 };

// Norme, tableau 9 : par version (1 à 40), mots de correction par bloc et nombre de blocs, pour L, M, Q et H.
const PAR_BLOC = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCS = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

// --- Corps de Galois GF(256), polynôme x^8 + x^4 + x^3 + x^2 + 1 (0x11D) ----------------------------------------------------
const EXP = new Array(512);
const LOG = new Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const fois = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Polynôme générateur de degré n : produit des (x − α^i), i de 0 à n − 1 ; coefficients du plus haut degré au plus bas. */
function generateur(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const suivant = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      suivant[j] ^= g[j];
      suivant[j + 1] ^= fois(g[j], EXP[i]);
    }
    g = suivant;
  }
  return g;
}

/** Mots de correction de Reed-Solomon : reste de la division de donnees · x^n par le générateur. */
function reedSolomon(donnees, n) {
  const g = generateur(n);
  const reste = new Array(n).fill(0);
  for (const octet of donnees) {
    const facteur = octet ^ reste[0];
    reste.shift();
    reste.push(0);
    for (let j = 0; j < n; j++) reste[j] ^= fois(g[j + 1], facteur);
  }
  return reste;
}

// --- Gabarit d'une version --------------------------------------------------------------------------------------------------

const tailleDe = (version) => version * 4 + 17;

/** Centres des motifs d'alignement (lignes et colonnes) ; aucun en version 1. */
function positionsAlignement(version) {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const taille = tailleDe(version);
  const pas = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
  const r = [6];
  for (let p = taille - 7; r.length < n; p -= pas) r.splice(1, 0, p);
  return r;
}

/** Reste BCH : bits de données décalés de `degre`, divisés par le polynôme `poly`. */
function bch(donnees, degre, poly) {
  let r = donnees << degre;
  for (let i = 31; i >= degre; i--) if ((r >>> i) & 1) r ^= poly << (i - degre);
  return r;
}

/** Information de format (15 bits, masque 101010000010010 de la norme appliqué). */
function bitsFormat(correction, masque) {
  const d = (BITS_CORRECTION[correction] << 3) | masque;
  return ((d << 10) | bch(d, 10, 0x537)) ^ 0x5412;
}

/** Information de version (18 bits), à partir de la version 7. */
function bitsVersion(version) {
  return (version << 12) | bch(version, 12, 0x1f25);
}

/** Matrice vide, motifs fixes posés : { modules, fixe } (fixe[y][x] : réservé, jamais écrit par les données). */
function gabarit(version) {
  const taille = tailleDe(version);
  const modules = Array.from({ length: taille }, () => new Array(taille).fill(false));
  const fixe = Array.from({ length: taille }, () => new Array(taille).fill(false));
  const poser = (x, y, fonce) => { if (x >= 0 && y >= 0 && x < taille && y < taille) { modules[y][x] = fonce; fixe[y][x] = true; } };
  // Motifs de position (7 × 7) et leurs séparateurs clairs.
  for (const [cx, cy] of [[3, 3], [taille - 4, 3], [3, taille - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        poser(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  }
  // Lignes de synchronisation.
  for (let i = 8; i < taille - 8; i++) { poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }
  // Motifs d'alignement (5 × 5), sauf sur les motifs de position.
  const pos = positionsAlignement(version);
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // Zones du format (réservées ici, écrites après le masque) et module toujours foncé.
  // (8, 6) et (6, 8) restent aux lignes de synchronisation.
  for (let i = 0; i < 9; i++) { if (i !== 6) { poser(8, i, false); poser(i, 8, false); } }
  for (let i = 0; i < 8; i++) { poser(taille - 1 - i, 8, false); poser(8, taille - 1 - i, false); }
  poser(8, taille - 8, true);
  // Information de version (deux blocs de 6 × 3).
  if (version >= 7) {
    const bits = bitsVersion(version);
    for (let i = 0; i < 18; i++) {
      const fonce = ((bits >>> i) & 1) === 1;
      const a = taille - 11 + (i % 3), b = Math.floor(i / 3);
      poser(a, b, fonce);
      poser(b, a, fonce);
    }
  }
  return { modules, fixe, taille };
}

/** Modules libres pour les données d'une version (comptés sur le gabarit). */
const libres = new Map();
function modulesLibres(version) {
  if (!libres.has(version)) {
    const { fixe } = gabarit(version);
    libres.set(version, fixe.reduce((n, ligne) => n + ligne.filter((f) => !f).length, 0));
  }
  return libres.get(version);
}

const motsTotal = (version) => Math.floor(modulesLibres(version) / 8);
const motsDonnees = (version, correction) => motsTotal(version) - PAR_BLOC[correction][version - 1] * BLOCS[correction][version - 1];
const bitsCompte = (version) => (version <= 9 ? 8 : 16);

/** Nombre d'octets que tient une version en mode octets. */
function capaciteOctets(version, correction) {
  return Math.floor((motsDonnees(version, correction) * 8 - 4 - bitsCompte(version)) / 8);
}

// --- Encodage ---------------------------------------------------------------------------------------------------------------

/** Mots de données : mode octets (0100), nombre d'octets, octets, terminateur, remplissage 0xEC 0x11. */
function motsDuTexte(octets, version, correction) {
  const bits = [];
  const ecrire = (valeur, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valeur >>> i) & 1); };
  ecrire(0b0100, 4);
  ecrire(octets.length, bitsCompte(version));
  for (const o of octets) ecrire(o, 8);
  const capacite = motsDonnees(version, correction) * 8;
  ecrire(0, Math.min(4, capacite - bits.length));
  while (bits.length % 8) bits.push(0);
  const mots = [];
  for (let i = 0; i < bits.length; i += 8) mots.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
  for (let k = 0; mots.length < capacite / 8; k++) mots.push(k % 2 ? 0x11 : 0xec);
  return mots;
}

/** Découpe en blocs, correction de chaque bloc, puis entrelacement (norme, 7.6). */
function entrelacer(mots, version, correction) {
  const nBlocs = BLOCS[correction][version - 1];
  const nCorr = PAR_BLOC[correction][version - 1];
  const total = motsTotal(version);
  const courts = nBlocs - (total % nBlocs);
  const longueurCourte = Math.floor(total / nBlocs) - nCorr;
  const blocs = [];
  let k = 0;
  for (let i = 0; i < nBlocs; i++) {
    const n = longueurCourte + (i < courts ? 0 : 1);
    const donnees = mots.slice(k, k + n);
    k += n;
    blocs.push({ donnees, correction: reedSolomon(donnees, nCorr) });
  }
  const sortie = [];
  for (let i = 0; i <= longueurCourte; i++) for (const b of blocs) if (i < b.donnees.length) sortie.push(b.donnees[i]);
  for (let i = 0; i < nCorr; i++) for (const b of blocs) sortie.push(b.correction[i]);
  return sortie;
}

/** Pose les bits des mots en zigzag, deux colonnes à la fois, de droite à gauche, en sautant la colonne 6. */
function placer(modules, fixe, mots) {
  const taille = modules.length;
  let i = 0;
  const n = mots.length * 8;
  for (let droite = taille - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    const monte = ((droite + 1) & 2) === 0;
    for (let v = 0; v < taille; v++) {
      const y = monte ? taille - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const x = droite - j;
        if (fixe[y][x]) continue;
        modules[y][x] = i < n ? ((mots[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
      }
    }
  }
}

const MASQUES = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function appliquerMasque(modules, fixe, masque) {
  const f = MASQUES[masque];
  for (let y = 0; y < modules.length; y++) for (let x = 0; x < modules.length; x++) if (!fixe[y][x] && f(x, y)) modules[y][x] = !modules[y][x];
}

/** Écrit l'information de format dans ses deux copies. */
function poserFormat(modules, correction, masque) {
  const taille = modules.length;
  const bits = bitsFormat(correction, masque);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) modules[8][taille - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[taille - 15 + i][8] = bit(i);
  modules[taille - 8][8] = true;
}

/** Pénalité d'une matrice (norme, 7.8.3) : suites, carrés, faux motifs de position, équilibre. */
function penalite(modules) {
  const taille = modules.length;
  let p = 0;
  const ligne = (k, vertical) => Array.from({ length: taille }, (_, i) => (vertical ? modules[i][k] : modules[k][i]));
  const MOTIF = [true, false, true, true, true, false, true];
  for (const vertical of [false, true]) {
    for (let k = 0; k < taille; k++) {
      const l = ligne(k, vertical);
      let suite = 1;
      for (let i = 1; i <= taille; i++) {
        if (i < taille && l[i] === l[i - 1]) { suite++; continue; }
        if (suite >= 5) p += 3 + (suite - 5);
        suite = 1;
      }
      const a = (i) => (i >= 0 && i < taille ? l[i] : false);
      for (let i = -4; i < taille; i++) {
        if (!MOTIF.every((m, j) => a(i + j) === m)) continue;
        const avant = [1, 2, 3, 4].every((d) => !a(i - d));
        const apres = [7, 8, 9, 10].every((d) => !a(i + d));
        if (avant || apres) p += 40;
      }
    }
  }
  for (let y = 0; y < taille - 1; y++) {
    for (let x = 0; x < taille - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) p += 3;
    }
  }
  const fonces = modules.reduce((n, l) => n + l.filter(Boolean).length, 0);
  const total = taille * taille;
  p += (Math.ceil(Math.abs(fonces * 20 - total * 10) / total) - 1) * 10;
  return p;
}

function encoderQR(texte, { correction = 'M' } = {}) {
  if (!CORRECTIONS.includes(correction)) throw new Error(`niveau de correction « ${correction} » inconnu (L, M, Q ou H).`);
  const octets = [...Buffer.from(String(texte), 'utf8')];
  let version = 1;
  while (version <= 40 && capaciteOctets(version, correction) < octets.length) version++;
  if (version > 40) throw new Error(`texte trop long pour un QR code (${octets.length} octets ; au plus ${capaciteOctets(40, correction)} au niveau ${correction}).`);
  const mots = entrelacer(motsDuTexte(octets, version, correction), version, correction);
  let meilleur = null;
  for (let masque = 0; masque < 8; masque++) {
    const { modules, fixe, taille } = gabarit(version);
    placer(modules, fixe, mots);
    appliquerMasque(modules, fixe, masque);
    poserFormat(modules, correction, masque);
    const p = penalite(modules);
    if (!meilleur || p < meilleur.p) meilleur = { p, masque, modules, taille };
  }
  return { version, taille: meilleur.taille, correction, masque: meilleur.masque, modules: meilleur.modules };
}

/** Tracé SVG : fond, puis les modules foncés en suites horizontales, dans un seul <path>. */
function svgQR(qr, { encre = '#000', fond = '#fff', marge = 4 } = {}) {
  const cote = qr.taille + marge * 2;
  const d = [];
  qr.modules.forEach((l, y) => {
    for (let x = 0; x < l.length; x++) {
      if (!l[x]) continue;
      let n = 1;
      while (x + n < l.length && l[x + n]) n++;
      d.push(`M${x + marge} ${y + marge}h${n}v1h-${n}z`);
      x += n - 1;
    }
  });
  return {
    viewBox: `0 0 ${cote} ${cote}`,
    corps: `<rect width="${cote}" height="${cote}" fill="${fond}"/><path fill="${encre}" d="${d.join('')}"/>`,
  };
}

module.exports = { encoderQR, svgQR, reedSolomon, bitsFormat, bitsVersion, positionsAlignement, capaciteOctets, motsTotal, BLOCS, PAR_BLOC, CORRECTIONS };
