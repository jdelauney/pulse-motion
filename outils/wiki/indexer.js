#!/usr/bin/env node
// Wiki Pulse Motion – construit les index de recherche du wiki : le texte de chaque section (<section id="…"> et son titre h2) de
// chaque page de docs/, écrit dans docs/js/index-recherche.js pour les pages françaises et dans docs/js/index-recherche-en.js pour
// les pages anglaises (docs/en/). Chargés à la demande par docs/js/recherche.js, selon la langue de la page (sans fetch : fonctionne
// en file://).
// Lancer : node outils/wiki/indexer.js [--verifier]
//   --verifier  n'écrit rien ; code de sortie 1 si un index ne suit plus les pages
"use strict";

const fs = require("fs");
const path = require("path");

const WIKI = path.join(__dirname, "..", "..", "docs");
const SORTIE = path.join(WIKI, "js", "index-recherche.js");
/** Les deux index : langue, fichier, variable globale lue par recherche.js, pages couvertes (chemin relatif à docs/, en /). */
const INDEX = [
  { langue: "fr", sortie: SORTIE, variable: "PULSE_RECHERCHE", couvre: (url) => !url.startsWith("en/") },
  { langue: "en", sortie: path.join(WIKI, "js", "index-recherche-en.js"), variable: "PULSE_RECHERCHE_EN", couvre: (url) => url.startsWith("en/") },
];

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", larr: "←", hellip: "…" };

function pages(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === "superpowers" ? [] : pages(chemin);
    return e.name.endsWith(".html") ? [chemin] : [];
  }).sort();
}

// Texte lisible d'un fragment HTML : sans dessins, scripts ni styles ; les blocs deviennent des espaces.
function texte(html) {
  return html
    .replace(/<(script|style|svg|figcaption)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === "#" ? String.fromCharCode(Number(e.slice(1))) : ENTITES[e.toLowerCase()] || " "))
    .replace(/\s+/g, " ")
    .trim();
}

function indexerPage(fichier) {
  const html = fs.readFileSync(fichier, "utf8");
  const url = path.relative(WIKI, fichier).split(path.sep).join("/");
  const titre = texte((html.match(/<title>([\s\S]*?)<\/title>/) || [, url])[1]).replace(/ – (?:Wiki Pulse Motion|Pulse Motion Wiki)$/, "");
  const main = (html.match(/<main\b[\s\S]*?<\/main>/) || [html])[0];
  const entrees = [];
  // L'en-tête de la page (avant la première section) : son titre et son chapeau.
  const debut = main.search(/<section\b[^>]*\bid="/);
  const tete = texte(debut > 0 ? main.slice(0, debut) : main);
  if (tete) entrees.push({ u: url, a: "", t: titre, s: "", x: tete });
  for (const m of main.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)(?=<section\b[^>]*\bid="|<\/main>)/g)) {
    const [, id, corps] = m;
    // Titre de section sans son numéro d'étape ni sa durée (tutoriels, prérequis).
    const h2 = (corps.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/) || [, ""])[1].replace(/<span class="(?:etape-numero|duree)"[^>]*>[\s\S]*?<\/span>/g, " ");
    const titreSection = texte(h2);
    const contenu = texte(corps.replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/, " "));
    if (contenu) entrees.push({ u: url, a: id, t: titre, s: titreSection, x: contenu });
  }
  return entrees;
}

/** Contenu d'un index : « fr », les pages françaises ; « en », les pages anglaises (docs/en/). */
function produire(langue = "fr") {
  const index = INDEX.find((x) => x.langue === langue);
  const entrees = pages(WIKI).flatMap(indexerPage).filter((x) => index.couvre(x.u));
  return "// Produit par outils/wiki/indexer.js depuis les pages de docs/ : relancer l'outil après avoir modifié une page.\n"
    + `window.${index.variable} = ` + JSON.stringify(entrees) + ";\n";
}

if (require.main === module) {
  let enRetard = false;
  for (const index of INDEX) {
    const contenu = produire(index.langue);
    const actuel = fs.existsSync(index.sortie) ? fs.readFileSync(index.sortie, "utf8") : null;
    const nom = path.basename(index.sortie);
    if (actuel === contenu) console.log(`Index de recherche à jour (${nom}).`);
    else if (process.argv.includes("--verifier")) {
      console.error(`Index de recherche à mettre à jour (${nom}). Relancez : node outils/wiki/indexer.js`);
      enRetard = true;
    } else {
      fs.writeFileSync(index.sortie, contenu, "utf8");
      console.log(`Index de recherche écrit (${nom}, ${Math.round(contenu.length / 1024)} Ko).`);
    }
  }
  if (enRetard) process.exit(1);
}

module.exports = { produire, indexerPage, texte, pages, INDEX };
