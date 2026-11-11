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

test("idées : les huit modèles, chacun avec au moins deux phrases, sa vidéo et sa séance", () => {
  const b = blocs().idees;
  const modeles = G.modelesVideo();
  assert.equal(modeles.length, 8);
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
  // Tutoriel logiciel (spec S6, 5.17) : sa variante verticale, la question « Que montre-t-on ? » et les étapes filmées.
  const tuto = b.slice(b.indexOf('id="modele-tutoriel-logiciel"'), b.indexOf("</section>", b.indexOf('id="modele-tutoriel-logiciel"')));
  assert.match(tuto, /Variante :</strong> « Astuce en 30 s », vertical (9:16)/);
  assert.match(tuto, /<dt>Que montre-t-on ?</dt>/);
  assert.match(tuto, /Les étapes filmées, sur l'appli d'essai/);
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

// ---------- S8 J3 « Galerie à témoin » (spec Styles et réalisation, 5.6) ----------

const { manquesStyles, grouperParCategorie } = require("./galerie.js");
const { CATEGORIES } = require("../../plugins/pulse-motion/scripts/lib/contrat.js");

test("témoin : projet-essai et galerie lisent les mêmes textes dans temoin.json", () => {
  const PLUGIN = path.join(__dirname, "..", "..", "plugins", "pulse-motion");
  const temoin = JSON.parse(fs.readFileSync(path.join(PLUGIN, "references", "styles", "temoin.json"), "utf8"));
  const { TEMOIN } = require(path.join(PLUGIN, "scripts", "lib", "projet-essai.js"));
  assert.deepEqual(TEMOIN, temoin);
  // projet-essai ne garde plus ses propres phrases : il les lit dans le témoin.
  const essai = fs.readFileSync(path.join(PLUGIN, "scripts", "lib", "projet-essai.js"), "utf8");
  assert.doesNotMatch(essai, /Garder la chaîne du froid/);
  assert.match(essai, /references', 'styles', 'temoin\.json'/);
  // La galerie fabrique la boucle et les images A et B par le même témoin (lib/temoin.js), et se refait s'il change.
  const medias = fs.readFileSync(path.join(__dirname, "galerie-medias.js"), "utf8");
  assert.match(medias, /const \{ projetBoucle, imagesTemoin \} = require\(path\.join\(PLUGIN, "scripts", "lib", "temoin\.js"\)\)/);
  assert.doesNotMatch(medias, /projetEssai\(/);
  const lot = G.LOTS.find((l) => l.id === "galerie-styles");
  assert.ok(lot.sources.some((s) => /temoin\.json$/.test(s)) && lot.sources.some((s) => /temoin\.js$/.test(s)));
  for (const style of G.STYLES_LIVRES()) {
    const [a, b] = G.fichiersTemoin(style);
    assert.deepEqual([a, b], [`medias/galerie/styles/${style}-temoin-a.jpg`, `medias/galerie/styles/${style}-temoin-b.jpg`]);
    assert.ok(lot.sorties().includes(a) && lot.sorties().includes(b), style);
  }
});

test("galerie : un style livré sans image A ou B fait échouer --verifier", () => {
  const racine = dossierTemporaire("pm-galerie-medias-");
  const poser = (f) => { fs.mkdirSync(path.dirname(path.join(racine, "docs", f)), { recursive: true }); fs.writeFileSync(path.join(racine, "docs", f), "x"); };
  for (const style of G.STYLES_LIVRES()) G.fichiersStyle(style).forEach(poser);
  assert.deepEqual(manquesStyles(racine), []);
  const [style] = G.STYLES_LIVRES();
  const [a, b] = G.fichiersTemoin(style);
  fs.rmSync(path.join(racine, "docs", a));
  assert.deepEqual(manquesStyles(racine), [`${style} : image A absente (docs/${a}).`]);
  fs.rmSync(path.join(racine, "docs", b));
  fs.rmSync(path.join(racine, "docs", G.fichiersStyle(style)[0]));
  assert.equal(manquesStyles(racine).length, 3);
  // La ligne de commande s'en sert avec --verifier.
  assert.match(fs.readFileSync(path.join(__dirname, "galerie.js"), "utf8"), /const manques = verifier \? manquesStyles\(RACINE_DEPOT\) : \[\];/);
  // Chaque style livré a les champs que la galerie montre.
  for (const s of G.STYLES_LIVRES()) {
    const id = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "plugins", "pulse-motion", "styles", s, "identite.json"), "utf8"));
    assert.ok(id.categorie && id.usages.length === 3 && id.nonPas, s);
  }
});

test("galerie : cartes regroupées par catégorie, dans l'ordre de CATEGORIES", () => {
  const faux = (style, categorie) => ({ style, identite: { categorie } });
  const groupes = grouperParCategorie([faux("riso", "papier-imprime"), faux("minimal", "essentiels"), faux("carnet", "dessine"), faux("inconnu", "vapeur"), faux("chaleureux", "essentiels")]);
  assert.deepEqual(groupes.map((g) => g.categorie.id), ["essentiels", "dessine", "papier-imprime", "autres"]);
  assert.deepEqual(groupes[0].styles.map((x) => x.style), ["minimal", "chaleureux"]);
  const ordre = CATEGORIES.map((c) => c.id);
  assert.deepEqual(groupes.slice(0, 3).map((g) => ordre.indexOf(g.categorie.id)), [0, 1, 3]);
  // Le bloc du catalogue : une section par catégorie, chaque carte avec A, B, la boucle et ses champs.
  const b = blocs().styles;
  const sections = [...b.matchAll(/<section class="categorie-styles" id="styles-([a-z-]+)" data-categorie="\1">\n<h4>([^<]+)<\/h4>/g)];
  assert.deepEqual(sections.map((m) => m[1]), ["essentiels"]);
  assert.equal(sections[0][2], "Les essentiels");
  for (const style of G.STYLES_LIVRES()) {
    const carte = new RegExp(`<details class="style-en-mouvement" id="style-${style}"[\\s\\S]*?</details>`).exec(b)[0];
    const [mp4] = G.fichiersStyle(style);
    const [a, imgB] = G.fichiersTemoin(style);
    for (const f of [mp4, a, imgB]) assert.ok(carte.includes(`"${f}"`), `${style} : ${f}`);
    for (const champ of [/<strong>Pour :<\/strong>/, /<strong>Ce qu'il n'est pas :<\/strong>/, /<strong>Signature :<\/strong>/, /<strong>Provenance :<\/strong>/]) assert.match(carte, champ, style);
  }
  assert.match(b, /id="style-minimal"[\s\S]*?<strong>Provenance :<\/strong> lemo-opuscar, style « swiss-motion » \(MIT\)/);
});
