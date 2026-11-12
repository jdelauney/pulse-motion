"use strict";
/* Chantier I : un index de recherche par langue. Les pages françaises dans index-recherche.js, les anglaises (docs/en/) dans
 * index-recherche-en.js ; recherche.js charge celui de la page. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const I = require("./indexer.js");

const DOCS = path.join(__dirname, "..", "..", "docs");
const lire = (langue) => {
  const fenetre = {};
  new Function("window", I.produire(langue))(fenetre);
  return fenetre[langue === "en" ? "PULSE_RECHERCHE_EN" : "PULSE_RECHERCHE"];
};

test("indexer : l'index français n'a aucune page anglaise, l'anglais couvre chaque page de docs/en/", () => {
  const fr = lire("fr");
  const en = lire("en");
  assert.ok(fr.length && en.length);
  assert.deepEqual(fr.filter((x) => x.u.startsWith("en/")), []);
  assert.deepEqual(en.filter((x) => !x.u.startsWith("en/")), []);
  const pagesEn = I.pages(path.join(DOCS, "en")).map((f) => "en/" + path.relative(path.join(DOCS, "en"), f).split(path.sep).join("/"));
  const indexees = new Set(en.map((x) => x.u));
  for (const p of pagesEn) assert.ok(indexees.has(p), `${p} indexée`);
  // Le titre d'une page anglaise perd son « – Pulse Motion Wiki ».
  assert.ok(en.every((x) => !/Pulse Motion Wiki$/.test(x.t)));
});

test("indexer : les deux index du dépôt sont à jour", () => {
  for (const index of I.INDEX) {
    assert.equal(fs.readFileSync(index.sortie, "utf8"), I.produire(index.langue), `${path.basename(index.sortie)} : node outils/wiki/indexer.js`);
  }
});
