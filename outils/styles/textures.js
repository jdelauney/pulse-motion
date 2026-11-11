#!/usr/bin/env node
// Pulse Motion – textures des styles livrés (spec Styles et réalisation, 5.10 point 4), outil du mainteneur.
// Chaque texture est une tuile qui se répète sans couture, tirée d'une graine (jamais d'image tierce, jamais de grain
// renouvelé à chaque image) : grain du papier du crayon, grain d'encre du riso, fibres du papier découpé. Elles sont rangées
// dans plugins/pulse-motion/styles/<style>/ et embarquées par url() dans style.css.
// Format : PNG (RVBA, 40 Ko au plus), écrit par plugins/pulse-motion/scripts/lib/png.js : la spec disait WebP, mais aucun
// encodeur WebP n'existe sans dépendance ; le PNG s'écrit en Node, à l'identique depuis sa graine.
// Lancer : node outils/styles/textures.js [--verifier]
//   --verifier  n'écrit rien ; code 1 si une texture n'est plus celle de sa graine (pixels) ou dépasse 40 Ko
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PNG = require('../../plugins/pulse-motion/scripts/lib/png.js');

const STYLES = path.join(__dirname, '..', '..', 'plugins', 'pulse-motion', 'styles');
const TAILLE_MAX = 40 * 1024;

function alea(graine) {
  let a = graine | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bruit de valeur lissé, périodique sur la tuile (n × n), à `cases` cases par côté : 0 à 1. */
function bruitPeriodique(n, cases, hasard) {
  const g = Array.from({ length: cases * cases }, () => hasard());
  const v = (i, j) => g[((j % cases + cases) % cases) * cases + ((i % cases + cases) % cases)];
  const lisse = (x) => x * x * (3 - 2 * x);
  const sortie = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * cases, fy = (y / n) * cases;
      const i = Math.floor(fx), j = Math.floor(fy);
      const u = lisse(fx - i), w = lisse(fy - j);
      const a = v(i, j) + (v(i + 1, j) - v(i, j)) * u;
      const b = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * u;
      sortie[y * n + x] = a + (b - a) * w;
    }
  }
  return sortie;
}

/** Tuile RVBA d'une seule couleur dont seule l'opacité varie. */
function tuile(n, couleur, alpha) {
  const donnees = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    donnees[i * 4] = couleur[0]; donnees[i * 4 + 1] = couleur[1]; donnees[i * 4 + 2] = couleur[2];
    donnees[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(alpha(i))));
  }
  return { largeur: n, hauteur: n, canaux: 4, donnees };
}

// Recettes : nom -> { style, fichier, graine, fabriquer(hasard) }.
const TEXTURES = {
  // Papier à grain du crayon gras : bosses douces (deux échelles) et dents fines, brun chaud très léger.
  'crayon-papier': {
    style: 'crayon', fichier: 'papier.png', graine: 20261115,
    fabriquer(hasard) {
      const n = 128;
      const gros = bruitPeriodique(n, 16, hasard), moyen = bruitPeriodique(n, 42, hasard);
      return tuile(n, [107, 82, 54], (i) => {
        const dent = hasard();
        return 18 * Math.pow(0.45 * gros[i] + 0.55 * moyen[i], 1.6) + (dent < 0.09 ? 10 + 16 * hasard() : 0);
      });
    },
  },
  // Grain d'encre du riso : poussière fine, quelques points plus marqués, bleu-noir très léger.
  'riso-grain': {
    style: 'riso', fichier: 'grain.png', graine: 20261116,
    fabriquer(hasard) {
      const n = 128;
      const nappe = bruitPeriodique(n, 16, hasard);
      return tuile(n, [24, 30, 52], (i) => {
        const r = hasard();
        return 10 * nappe[i] + (r < 0.05 ? 26 + 30 * hasard() : r < 0.12 ? 10 : 0);
      });
    },
  },
  // Fibres du papier découpé : de courtes fibres claires et sombres posées au hasard, sur la tuile repliée.
  'papier-fibres': {
    style: 'papier-decoupe', fichier: 'fibres.png', graine: 20261117,
    fabriquer(hasard) {
      const n = 128;
      const alpha = new Float64Array(n * n);
      const nappe = bruitPeriodique(n, 12, hasard);
      for (let i = 0; i < n * n; i++) alpha[i] = 8 * nappe[i];
      for (let f = 0; f < 180; f++) {
        const x0 = hasard() * n, y0 = hasard() * n, angle = hasard() * Math.PI, long = 3 + hasard() * 9, force = 10 + hasard() * 22;
        for (let s = 0; s <= long; s += 0.5) {
          const x = Math.floor(x0 + Math.cos(angle) * s), y = Math.floor(y0 + Math.sin(angle) * s);
          const k = (((y % n) + n) % n) * n + (((x % n) + n) % n);
          alpha[k] = Math.max(alpha[k], force);
        }
      }
      return tuile(n, [92, 70, 44], (i) => alpha[i]);
    },
  },
};

/** Image d'une texture (pixels), recalculée depuis sa graine. */
function genererTexture(nom) {
  const r = TEXTURES[nom];
  if (!r) throw new Error(`texture « ${nom} » inconnue`);
  return r.fabriquer(alea(r.graine));
}

const fichierDe = (nom) => path.join(STYLES, TEXTURES[nom].style, TEXTURES[nom].fichier);
const encoder = (img) => PNG.encoder(img, { niveau: 9 });

/** -> liste de problèmes (vide si chaque texture est celle de sa graine et tient dans 40 Ko). */
function verifierTextures() {
  const problemes = [];
  for (const nom of Object.keys(TEXTURES)) {
    const f = fichierDe(nom);
    if (!fs.existsSync(f)) { problemes.push(`${nom} : fichier absent (${path.relative(STYLES, f)})`); continue; }
    const octets = fs.readFileSync(f);
    if (octets.length > TAILLE_MAX) problemes.push(`${nom} : ${octets.length} octets, 40 Ko au plus`);
    const lu = PNG.decoder(octets), attendu = genererTexture(nom);
    if (lu.largeur !== attendu.largeur || lu.hauteur !== attendu.hauteur || lu.canaux !== 4 || !Buffer.from(lu.donnees).equals(Buffer.from(attendu.donnees))) {
      problemes.push(`${nom} : les pixels ne sont plus ceux de la graine ${TEXTURES[nom].graine}`);
    }
  }
  return problemes;
}

if (require.main === module) {
  if (process.argv.includes('--verifier')) {
    const p = verifierTextures();
    for (const x of p) console.error(x);
    process.exit(p.length ? 1 : 0);
  }
  for (const nom of Object.keys(TEXTURES)) {
    const octets = encoder(genererTexture(nom));
    fs.writeFileSync(fichierDe(nom), octets);
    console.log(`${path.relative(STYLES, fichierDe(nom))} : ${octets.length} octets`);
  }
}

module.exports = { TEXTURES, genererTexture, verifierTextures, TAILLE_MAX };
