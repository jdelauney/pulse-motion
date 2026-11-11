"use strict";
// Textures des styles livrés (spec Styles et réalisation, 5.10 point 4) : chaque tuile est celle de sa graine, 40 Ko au plus.
// Lancer : node --test outils/styles/textures.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const X = require("./textures.js");

const STYLES = path.join(__dirname, "..", "..", "plugins", "pulse-motion", "styles");

test("textures : régénérées à l'identique depuis leur graine, 40 Ko au plus", () => {
  assert.deepEqual(X.verifierTextures(), []);
  for (const [nom, r] of Object.entries(X.TEXTURES)) {
    const a = X.genererTexture(nom), b = X.genererTexture(nom);
    assert.ok(Buffer.from(a.donnees).equals(Buffer.from(b.donnees)), nom);
    assert.ok(fs.statSync(path.join(STYLES, r.style, r.fichier)).size <= X.TAILLE_MAX, nom);
    assert.match(fs.readFileSync(path.join(STYLES, r.style, "style.css"), "utf8"), new RegExp(`url\\("${r.fichier.replace(".", "\\.")}"\\)`), nom);
  }
  // Une autre graine donne une autre tuile : le grain vient bien de la graine.
  X.TEXTURES.essai = { ...X.TEXTURES["riso-grain"], graine: 1 };
  try {
    assert.ok(!Buffer.from(X.genererTexture("essai").donnees).equals(Buffer.from(X.genererTexture("riso-grain").donnees)));
  } finally { delete X.TEXTURES.essai; }
  // Un pixel changé dans le fichier est vu par --verifier.
  const r = X.TEXTURES["crayon-papier"];
  const fichier = path.join(STYLES, r.style, r.fichier);
  const octets = fs.readFileSync(fichier);
  const img = X.genererTexture("crayon-papier");
  img.donnees[3] = (img.donnees[3] + 1) % 256;
  try {
    fs.writeFileSync(fichier, require("../../plugins/pulse-motion/scripts/lib/png.js").encoder(img, { niveau: 9 }));
    assert.match(X.verifierTextures().join("\n"), /crayon-papier : les pixels ne sont plus ceux de la graine/);
  } finally { fs.writeFileSync(fichier, octets); }
});
