"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { dossierTemporaire } = require("../../plugins/pulse-motion/tests/aide/temporaire.js");
const { blocs, appliquer, PAGES } = require("./galerie.js");
const G = require("./galerie-medias.js");

const DOCS = path.join(__dirname, "..", "..", "docs");

function copieDuWiki() {
  const racine = dossierTemporaire("pm-galerie-");
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

test("chaque page qui montre des aperçus charge js/galerie.js (sinon ses vidéos ne jouent jamais)", () => {
  const pages = fs.readdirSync(DOCS).filter((f) => f.endsWith(".html"));
  const avecApercus = pages.filter((p) => /<video class="apercu"/.test(fs.readFileSync(path.join(DOCS, p), "utf8")));
  assert.ok(avecApercus.includes("catalogue.html") && avecApercus.includes("mouvements.html"));
  for (const p of avecApercus) assert.match(fs.readFileSync(path.join(DOCS, p), "utf8"), /<script src="js\/galerie\.js" defer><\/script>/, p);
});

test("idées : les sept modèles, chacun avec au moins deux phrases, sa vidéo et sa séance", () => {
  const b = blocs().idees;
  const modeles = G.modelesVideo();
  assert.equal(modeles.length, 7);
  for (const m of modeles) {
    const debut = b.indexOf(`<section class="idee-modele" id="modele-${m.id}">`);
    assert.ok(debut >= 0, m.id);
    const section = b.slice(debut, b.indexOf("</section>", debut));
    assert.ok((section.match(/<pre class="commande">/g) || []).length >= 2, `${m.id} : au moins deux phrases`);
    const [mp4, jpg] = G.fichiersExemple(m);
    assert.match(section, new RegExp(`src="${mp4}"`), m.id);
    assert.match(section, new RegExp(`poster="${jpg}"`), m.id);
    assert.match(section, /Comment cette vidéo a été faite/, m.id);
  }
  assert.match(b, /idee-video-verticale/, "les modèles verticaux ont un cadre vertical");
});

test("galerie : chaque entrée #069 à #080 a son aperçu rendu par sa recette", () => {
  const { demosDeMouvements } = require("../../plugins/pulse-motion/scripts/lib/choisir-mouvements.js");
  const vie = G.dictionnaire().mouvements.filter((m) => m.categorie === "vie");
  assert.deepEqual(vie.map((m) => m.no), ["069", "070", "071", "072", "073", "074", "075", "076", "077", "078", "079", "080"]);
  const demos = demosDeMouvements(vie);
  const lot = G.LOTS.find((l) => l.id === "galerie-mouvements");
  const sorties = lot.sorties();
  const b = blocs().mouvements;
  assert.match(b, /<section class="categorie-mouvements" id="categorie-vie" data-categorie="vie">\n<h2>Vie du décor<\/h2>/);
  for (const m of vie) {
    // La démo de la galerie est la recette elle-même, dans sa scène de 3 s.
    const d = demos.find((x) => x.id === `m${m.no}`);
    assert.equal(d.html, m.recette.exemple, m.no);
    assert.equal(d.duree, 3, m.no);
    const [mp4, jpg] = G.fichiersMouvement(m.no);
    assert.ok(sorties.includes(mp4) && sorties.includes(jpg), m.no);
    assert.match(b, new RegExp(`id="m${m.no}"[\\s\\S]*?<source src="${mp4}"`), m.no);
  }
  assert.ok(lot.sources.some((s) => /references[\\/]mouvements$/.test(s)), "le dictionnaire changé refait les aperçus");
});
