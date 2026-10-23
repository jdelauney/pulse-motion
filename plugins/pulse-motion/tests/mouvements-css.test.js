'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { copierProjet, STYLES } = require('./aide/projet.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'mouvements.css'), 'utf8');
const CLASSES = ['pop', 'monte', 'glisse-gauche', 'glisse-droite', 'zoom-entree', 'net', 'masque', 'chute', 'anticipe', 'ecrase', 'saccade', 'sortie',
  'pulse', 'tremblote', 'va-vient', 'surligne', 'souligne', 'reflet', 'epaule'];
// La saccade reprend les images clés du fondu montant.
const IMAGES_CLES = { saccade: 'pm-m-monte' };

test('mouvements.css : chaque classe commune et ses images clés', () => {
  for (const c of CLASSES) {
    assert.match(CSS, new RegExp(`\\.pm-m-${c}\\b[^{]*\\{`), `classe pm-m-${c}`);
    const cles = IMAGES_CLES[c] || `pm-m-${c}`;
    assert.match(CSS, new RegExp(`@keyframes ${cles}\\b`), `@keyframes ${cles}`);
  }
});

test('mouvements.css : les classes l\'emportent sur les entrées des styles (#pm-scene), la caméra à l\'épaule couvre l\'image', () => {
  for (const c of CLASSES) assert.match(CSS, new RegExp(`#pm-scene \\.pm-m-${c}\\b`), c);
  assert.match(CSS, /#pm-scene \.pm-m-epaule \{ position: absolute; inset: 0;/);
});

test('mouvements.css : ni transition CSS, ni filtre SVG, ni fusion, ni pixels, ni boucle sans fin', () => {
  const sansCommentaires = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const interdit of [/transition\s*:/, /filter\s*:\s*url/, /mix-blend-mode/, /backdrop-filter/, /\d+px\b/, /\binfinite\b/]) {
    assert.doesNotMatch(sansCommentaires, interdit, String(interdit));
  }
});

test('mouvements.css : embarqué dans la page, et une scène qui utilise toutes les classes s\'assemble', () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  const elements = CLASSES.map((c, i) => `<p class="pm-m-${c}" data-start="${(i * 0.1).toFixed(1)}" data-dur="0.6" data-decor></p>`).join('\n');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('</section>', `${elements}\n</section>`));
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.ok, true);
  const html = fs.readFileSync(r.fichier, 'utf8');
  assert.match(html, /@keyframes pm-m-pop/);
  assert.match(html, /class="pm-m-epaule"/);
});
