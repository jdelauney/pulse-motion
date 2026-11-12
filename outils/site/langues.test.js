"use strict";
/* Chantier I (documentation en anglais) : liens hreflang entre les deux langues du wiki, sélecteur de langue et navigation
 * anglaise de l'en-tête. Les listes viennent du dépôt (pages de docs/en/, donnees.js) : aucune n'est recopiée ici. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { dossierTemporaire } = require("../../plugins/pulse-motion/tests/aide/temporaire.js");
const L = require("./langues.js");

const RACINE = path.join(__dirname, "..", "..");
const DOCS = path.join(RACINE, "docs");

function donnees() {
  const fenetre = {};
  new Function("window", fs.readFileSync(path.join(DOCS, "js", "donnees.js"), "utf8"))(fenetre);
  return fenetre.PULSE_WIKI;
}

function wiki(pages) {
  const racine = dossierTemporaire("pm-langues-");
  for (const [f, html] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(racine, "docs", f)), { recursive: true });
    fs.writeFileSync(path.join(racine, "docs", f), html, "utf8");
  }
  return racine;
}
const tete = (titre) => `<!doctype html>\n<html><head>\n<title>${titre}</title>\n<meta name="description" content="x">\n<link rel="stylesheet" href="css/base.css">\n</head><body></body></html>\n`;

test("langues : chaque page en deux langues porte, dans les deux langues, les liens fr, en et x-default", () => {
  const racine = wiki({ "a.html": tete("A"), "en/a.html": tete("A"), "commandes/b.html": tete("B"), "en/commandes/b.html": tete("B"), "seule.html": tete("S") });
  const { paires, enRetard } = L.appliquer(racine);
  assert.deepEqual(paires, ["a.html", "commandes/b.html"]);
  assert.equal(enRetard.length, 4);
  for (const page of ["commandes/b.html", "en/commandes/b.html"]) {
    const html = fs.readFileSync(path.join(racine, "docs", page), "utf8");
    assert.ok(html.includes(`<link rel="alternate" hreflang="fr" href="${L.SITE}commandes/b.html">`), page);
    assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${L.SITE}en/commandes/b.html">`), page);
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${L.SITE}commandes/b.html">`), page);
    assert.ok(html.indexOf("<!-- langues -->") > html.indexOf('<meta name="description"'), `${page} : après la description`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(racine, "docs", "seule.html"), "utf8"), /hreflang/);
  // Une seconde passe ne change rien ; --verifier ne voit rien en retard.
  assert.deepEqual(L.appliquer(racine).enRetard, []);
  assert.deepEqual(L.appliquer(racine, { verifier: true }).enRetard, []);
});

test("langues : une page anglaise sans page française est signalée", () => {
  const racine = wiki({ "en/orpheline.html": tete("O") });
  assert.deepEqual(L.appliquer(racine, { verifier: true }).orphelines, ["en/orpheline.html"]);
});

test("langues : les pages du dépôt sont à jour, et chaque page anglaise a sa page française", () => {
  const { paires, enRetard, orphelines } = L.appliquer(RACINE, { verifier: true });
  assert.ok(paires.length > 0, "docs/en/ a des pages");
  assert.deepEqual(enRetard, [], "node outils/site/langues.js");
  assert.deepEqual(orphelines, []);
  for (const chemin of paires) {
    const html = fs.readFileSync(path.join(DOCS, "en", chemin), "utf8");
    assert.match(html, /<html lang="en"/, chemin);
    const profondeur = chemin.split("/").length;
    assert.ok(html.includes(`data-racine="${"../".repeat(profondeur)}"`), `${chemin} : racine vers docs/`);
  }
});

test("langues : l'adresse du site est la même pour l'outil et pour le gabarit (donnees.js)", () => {
  assert.equal(donnees().site, L.SITE);
});

test("navigation anglaise : une entrée par entrée française, vers la page anglaise si elle existe, sinon la française marquée fr", () => {
  const d = donnees();
  assert.equal(d.anglais.navigation.length, d.navigation.length);
  d.navigation.forEach((p, i) => {
    const a = d.anglais.navigation[i];
    const traduite = fs.existsSync(path.join(DOCS, "en", p.href));
    assert.equal(a.href, traduite ? `en/${p.href}` : p.href, p.href);
    assert.equal(Boolean(a.fr), !traduite, `${p.href} : marque fr`);
    assert.ok(fs.existsSync(path.join(DOCS, a.href)), a.href);
    assert.ok(a.titre, `${p.href} : titre anglais`);
  });
  for (const e of d.etapes) assert.ok(d.anglais.etapes[e.id], `étape ${e.id} : nom anglais`);
});

test("gabarit : sélecteur de langue tiré des liens hreflang, libellés anglais sur une page anglaise", () => {
  const g = fs.readFileSync(path.join(DOCS, "js", "gabarit.js"), "utf8");
  assert.match(g, /link\[rel="alternate"\]\[hreflang="' \+ \(en \? "fr" : "en"\)/);
  assert.match(g, /texte: en \? "FR" : "EN"/);
  assert.match(g, /"English: read this page in English"/);
  assert.match(g, /en \? anglais\.navigation : donnees\.navigation/);
  for (const js of ["recherche.js", "commandes.js", "galerie.js", "animations.js", "console.js"]) {
    assert.match(fs.readFileSync(path.join(DOCS, "js", js), "utf8"), /getAttribute\("lang"\)/, `${js} : langue de la page`);
  }
  // La recherche d'une page anglaise lit l'index anglais.
  assert.match(fs.readFileSync(path.join(DOCS, "js", "recherche.js"), "utf8"), /js\/index-recherche-en\.js/);
});

test("pages anglaises : elles disent que le plugin et Claude répondent en français", () => {
  for (const f of ["index.html", "demarrage-rapide.html"]) {
    assert.match(fs.readFileSync(path.join(DOCS, "en", f), "utf8"), /class="avis-langue"[^>]*>[^<]*in French/, f);
  }
  assert.match(fs.readFileSync(path.join(DOCS, "js", "gabarit.js"), "utf8"), /function avisLangue\(\)[\s\S]*answers in French/);
  assert.match(fs.readFileSync(path.join(RACINE, "README.en.md"), "utf8"), /made for French speakers/);
  assert.match(fs.readFileSync(path.join(RACINE, "README.md"), "utf8"), /\[README\.en\.md\]\(README\.en\.md\)/);
});
