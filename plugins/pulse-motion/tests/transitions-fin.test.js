'use strict';
/* Fin des transitions : la scène qui sort ne disparaît pas d'un coup (correctif du moteur, 0.36.0).
 * Avant, le contenu relevé d'un style (`.decor ~ *`, z-index 1) de la scène qui sort se dessinait au-dessus de la scène
 * qui entre, puis disparaissait à la fin de la transition : +3 à +5 niveaux de luminance moyenne sur chaine-du-froid. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { assembler } = require('../scripts/assembler.js');
const { decoderPNG } = require('../scripts/logo.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const EXEMPLE = path.join(__dirname, '..', 'exemples', 'chaine-du-froid');

/** chaine-du-froid sans son effet de particules (sans rapport avec les transitions ; la capture se fait alors sans GPU). */
function page() {
  const dir = dossierTemporaire('pm-transitions-fin-');
  fs.cpSync(EXEMPLE, dir, { recursive: true });
  const seuil = path.join(dir, 'scenes', '02-seuil.html');
  fs.writeFileSync(seuil, fs.readFileSync(seuil, 'utf8').replace(/<div data-effet=[^\n]*<\/div>\n/, ''), 'utf8');
  const { html } = assembler({ dossier: dir, ecrire: false });
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, html, 'utf8');
  return fichier;
}

function luminance(png) {
  const { largeur, hauteur, pixel } = decoderPNG(png);
  let s = 0;
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) { const [r, v, b] = pixel(x, y); s += 0.299 * r + 0.587 * v + 0.114 * b; }
  return s / (largeur * hauteur);
}

test('fin de transition : la luminance moyenne ne saute pas quand la scène qui sort est retirée (chaine-du-froid)', sans, async () => {
  const c = await ouvrirCapture({ fichierHtml: page(), largeur: 320, hauteur: 180, navigateur });
  try {
    const ips = 30;
    const fins = c.minutage.scenes.filter((s) => s.entree > 0).map((s) => ({ id: s.id, image: Math.round((s.debut + s.entree) * ips) }));
    assert.equal(fins.length, 5, 'cinq transitions dans chaine-du-froid');
    const sauts = [];
    for (const f of fins) {
      const avant = luminance(await c.capturer((f.image - 1) / ips));
      const apres = luminance(await c.capturer(f.image / ips));
      sauts.push(`${f.id} ${(apres - avant).toFixed(2)}`);
      assert.ok(Math.abs(apres - avant) < 1, `scène « ${f.id} » : saut de ${(apres - avant).toFixed(2)} niveaux à la fin de la transition`);
    }
    assert.ok(sauts.length);
  } finally {
    await c.fermer();
  }
});
