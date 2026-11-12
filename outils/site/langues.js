#!/usr/bin/env node
// Wiki Pulse Motion – liens entre les deux langues du wiki (chantier I) : chaque page anglaise docs/en/<chemin> a sa page française
// docs/<chemin> ; dans l'en-tête des deux, entre <!-- langues --> et <!-- /langues -->, les liens <link rel="alternate" hreflang>
// (fr, en, x-default = le français) en adresses complètes du site, comme le veulent les moteurs de recherche. Le sélecteur de langue
// de l'en-tête (docs/js/gabarit.js) les lit pour mener à l'autre version de la page. Une page sans traduction n'a pas de bloc.
// Lancer : node outils/site/langues.js [--verifier]
//   --verifier  n'écrit rien ; code 1 si une page doit être mise à jour, ou si une page anglaise n'a pas de page française
"use strict";

const fs = require("fs");
const path = require("path");

const RACINE_DEPOT = path.join(__dirname, "..", "..");
/** Adresse publique du wiki (GitHub Pages, branche gh-pages) ; la même que « site » dans docs/js/donnees.js. */
const SITE = "https://jdelauney.github.io/pulse-motion/";

/** Pages anglaises de <docs>/en, chemins relatifs à en/ (en /), triés. */
function pagesAnglaises(docs) {
  const en = path.join(docs, "en");
  const lister = (dossier, prefixe) => (fs.existsSync(dossier) ? fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
    ? lister(path.join(dossier, e.name), `${prefixe}${e.name}/`)
    : e.name.endsWith(".html") ? [`${prefixe}${e.name}`] : [])) : []);
  return lister(en, "").sort();
}

/** Le bloc des liens alternatifs d'une paire (chemin relatif à docs/, sans en/). */
function bloc(chemin) {
  return ["<!-- langues -->",
    `<link rel="alternate" hreflang="fr" href="${SITE}${chemin}">`,
    `<link rel="alternate" hreflang="en" href="${SITE}en/${chemin}">`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}${chemin}">`,
    "<!-- /langues -->"].join("\n");
}

/** Le HTML d'une page avec son bloc : remplacé s'il existe, sinon posé juste après la description (ou le titre). */
function avecBloc(html, chemin, page = chemin) {
  const nouveau = bloc(chemin);
  const existant = /<!-- langues -->[\s\S]*?<!-- \/langues -->/;
  if (existant.test(html)) return html.replace(existant, () => nouveau);
  const ancre = /<meta name="description"[^>]*>\n/.exec(html) || /<\/title>\n/.exec(html);
  if (!ancre) throw new Error(`${page} : ni description ni titre dans l'en-tête.`);
  const i = ancre.index + ancre[0].length;
  return html.slice(0, i) + nouveau + "\n" + html.slice(i);
}

/** Met à jour les blocs des pages de <racine>/docs ; -> { paires, enRetard, orphelines } (chemins relatifs à docs/). */
function appliquer(racine = RACINE_DEPOT, { verifier = false } = {}) {
  const docs = path.join(racine, "docs");
  const paires = pagesAnglaises(docs);
  const enRetard = [];
  const orphelines = [];
  for (const chemin of paires) {
    if (!fs.existsSync(path.join(docs, chemin))) { orphelines.push(`en/${chemin}`); continue; }
    for (const page of [chemin, `en/${chemin}`]) {
      const fichier = path.join(docs, page);
      const avant = fs.readFileSync(fichier, "utf8");
      const apres = avecBloc(avant, chemin, page);
      if (apres !== avant) {
        enRetard.push(page);
        if (!verifier) fs.writeFileSync(fichier, apres, "utf8");
      }
    }
  }
  return { paires, enRetard, orphelines };
}

if (require.main === module) {
  const verifier = process.argv.includes("--verifier");
  try {
    const { paires, enRetard, orphelines } = appliquer(RACINE_DEPOT, { verifier });
    if (orphelines.length) {
      console.error(`Page(s) anglaise(s) sans page française : ${orphelines.join(", ")}.`);
      process.exit(1);
    }
    if (verifier && enRetard.length) {
      console.error(`Liens entre langues à mettre à jour : ${enRetard.join(", ")}. Relancez : node outils/site/langues.js`);
      process.exit(1);
    }
    console.log(enRetard.length && !verifier ? `Pages écrites : ${enRetard.join(", ")}.` : `Liens entre langues à jour (${paires.length} pages en deux langues).`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { SITE, pagesAnglaises, bloc, avecBloc, appliquer };
