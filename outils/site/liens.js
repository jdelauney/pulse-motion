#!/usr/bin/env node
// Wiki Pulse Motion – vérifie que chaque lien, image et vidéo relatifs des pages de docs/ pointe vers un fichier existant, et chaque
// ancre « page.html#id » vers un id de la page. Un média encore à fabriquer (sortie déclarée dans outils/site/medias.js) n'est pas
// compté comme cassé : il est absent en local tant qu'on ne l'a pas fabriqué.
// Lancer : node outils/site/liens.js   (code 1 s'il y a des liens cassés)
"use strict";

const fs = require("fs");
const path = require("path");

function pages(dossier, prefixe = "") {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === "superpowers" ? [] : pages(path.join(dossier, e.name), prefixe + e.name + "/");
    return e.name.endsWith(".html") ? [prefixe + e.name] : [];
  });
}

function sortiesDeclarees() {
  try { return new Set(require("./medias.js").MEDIAS.map((m) => m.sortie)); } catch { return new Set(); }
}

/** Liens cassés des pages de docs/ : { casses: [{ page, cible }] } (chemins relatifs à docs/). */
function liensDuWiki(racineDepot, declares = sortiesDeclarees()) {
  const docs = path.join(racineDepot, "docs");
  const ids = new Map();
  const idsDe = (page) => {
    if (!ids.has(page)) ids.set(page, new Set([...fs.readFileSync(path.join(docs, page), "utf8").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])));
    return ids.get(page);
  };
  const casses = [];
  for (const page of pages(docs)) {
    const html = fs.readFileSync(path.join(docs, page), "utf8");
    for (const m of html.matchAll(/\b(?:src|href|poster)\s*=\s*"([^"]*)"/g)) {
      const lien = m[1];
      if (!lien || lien.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(lien) || lien.startsWith("/")) continue;
      const [chemin, ancre] = lien.split("?")[0].split("#");
      const cible = path.posix.normalize(path.posix.join(path.posix.dirname(page), decodeURI(chemin)));
      const fichier = path.join(docs, cible);
      const existe = fs.existsSync(fichier) && (fs.statSync(fichier).isFile() || fs.existsSync(path.join(fichier, "index.html")));
      if (!existe) {
        // Une capture fabriquée peut avoir été allégée en JPEG.
        const variante = declares.has(cible) || declares.has(cible.replace(/\.jpg$/, ".png"));
        if (!variante || !cible.startsWith("medias/")) casses.push({ page, cible: lien });
        continue;
      }
      if (ancre && cible.endsWith(".html") && !idsDe(cible).has(ancre)) casses.push({ page, cible: lien });
    }
  }
  return { casses };
}

if (require.main === module) {
  const { casses } = liensDuWiki(path.join(__dirname, "..", ".."));
  if (casses.length) {
    console.error(`${casses.length} lien(s) cassé(s) :`);
    for (const c of casses) console.error(`  ${c.page} → ${c.cible}`);
    process.exit(1);
  }
  console.log("Aucun lien cassé.");
}

module.exports = { liensDuWiki };
