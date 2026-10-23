"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { blocs, appliquer, PAGES } = require("./galerie.js");
const G = require("./galerie-medias.js");

const DOCS = path.join(__dirname, "..", "..", "docs");

function copieDuWiki() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "pm-galerie-"));
  fs.mkdirSync(path.join(racine, "docs"));
  for (const page of new Set(Object.values(PAGES))) fs.copyFileSync(path.join(DOCS, page), path.join(racine, "docs", page));
  return racine;
}

test("blocs : une carte par mouvement (avec sa phrase à copier) et par effet", () => {
  const b = blocs();
  for (const m of G.dictionnaire().mouvements) {
    assert.match(b.mouvements, new RegExp(`id="m${m.no}"`), m.no);
  }
  assert.equal((b.mouvements.match(/<pre class="commande">/g) || []).length, G.dictionnaire().mouvements.length);
  for (const nom of G.effets()) assert.match(b.effets, new RegExp(`id="effet-${nom}"`), nom);
  for (const style of G.STYLES_LIVRES()) assert.match(b.styles, new RegExp(`id="style-${style}"`), style);
  assert.match(b["mots-du-mouvement"], /href="mouvements\.html#m001"/);
});

test("--verifier détecte une page en retard, et les pages du dépôt sont à jour", () => {
  assert.deepEqual(appliquer(path.join(DOCS, ".."), { verifier: true }).enRetard, []);
  const racine = copieDuWiki();
  const fichier = path.join(racine, "docs", "mouvements.html");
  fs.writeFileSync(fichier, fs.readFileSync(fichier, "utf8").replace(/(<!-- galerie:mouvements -->)[\s\S]*?(<!-- \/galerie:mouvements -->)/, "$1\nancien\n$2"));
  assert.deepEqual(appliquer(racine, { verifier: true }).enRetard, ["mouvements.html"]);
});

test("un bloc sans marqueur dans sa page : erreur claire", () => {
  const racine = copieDuWiki();
  const fichier = path.join(racine, "docs", "lexique.html");
  fs.writeFileSync(fichier, fs.readFileSync(fichier, "utf8").replace("<!-- galerie:mots-du-mouvement -->", ""));
  assert.throws(() => appliquer(racine), /lexique\.html : marqueurs <!-- galerie:mots-du-mouvement -->/);
});

test("galerie : sans médias, cartes en texte", () => {
  const html = fs.readFileSync(path.join(DOCS, "mouvements.html"), "utf8");
  for (const m of G.dictionnaire().mouvements.slice(0, 10)) {
    const carte = new RegExp(`<article class="carte-mouvement" id="m${m.no}"[\\s\\S]*?</article>`).exec(html)[0];
    const horsVideo = carte.replace(/<video[\s\S]*?<\/video>/g, "");
    assert.ok(horsVideo.includes(m.sens.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")) || horsVideo.includes(m.sens), `#${m.no} : sens hors de la vidéo`);
    assert.match(horsVideo, /carte-mouvement-nom/);
  }
  // Le contenu est dans le HTML : aucun script n'est nécessaire pour afficher les cartes.
  assert.ok(!/document\.write|innerHTML/.test(fs.readFileSync(path.join(DOCS, "js", "galerie.js"), "utf8")));
});
