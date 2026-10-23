#!/usr/bin/env node
// Wiki Pulse Motion – publie le site sur la branche gh-pages : les fichiers de docs/ suivis par git (sans docs/superpowers/), plus les
// médias fabriqués dans docs/medias/ (ignoré par git, voir outils/site/medias.js). La branche n'a qu'un seul commit, poussé en force :
// elle ne grossit pas d'une publication à l'autre. Seule gh-pages est poussée, jamais main.
// Lancer : node outils/site/publier.js [--sec]
//   --sec  prépare le site sans rien pousser, et affiche le nombre de fichiers et leur poids
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const git = (cwd, args, options = {}) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();

function fichiersDe(dossier, prefixe) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const rel = prefixe + e.name;
    return e.isDirectory() ? fichiersDe(path.join(dossier, e.name), rel + "/") : [rel];
  });
}

/** Chemins relatifs à docs/ : fichiers suivis par git (hors superpowers/) et médias fabriqués. */
function fichiersAPublier(racineDepot) {
  const suivis = git(racineDepot, ["ls-files", "-z", "--", "docs"]).split("\0").filter(Boolean)
    .map((f) => f.replace(/^docs\//, ""))
    .filter((f) => !f.startsWith("superpowers/") && fs.existsSync(path.join(racineDepot, "docs", f)));
  const medias = fichiersDe(path.join(racineDepot, "docs", "medias"), "medias/");
  return [...new Set([...suivis, ...medias])].sort();
}

function pagesHTML(dossier, prefixe = "") {
  return fichiersDe(dossier, prefixe).filter((f) => f.endsWith(".html") && !f.startsWith("superpowers/"));
}

/** Médias (medias/…, relatifs à docs/) cités par un src, href ou poster d'une page du wiki. */
function mediasReferences(racineDepot) {
  const docs = path.join(racineDepot, "docs");
  const trouves = new Set();
  for (const page of pagesHTML(docs)) {
    const html = fs.readFileSync(path.join(docs, page), "utf8");
    for (const m of html.matchAll(/\b(?:src|href|poster)\s*=\s*"([^"#?]+)/g)) {
      if (/^[a-z]+:/i.test(m[1]) || m[1].startsWith("/")) continue;
      const cible = path.posix.normalize(path.posix.join(path.posix.dirname(page), m[1]));
      if (cible.startsWith("medias/")) trouves.add(cible);
    }
  }
  return [...trouves].sort();
}

/** Médias cités mais pas encore fabriqués dans docs/medias/. */
function mediasManquants(racineDepot) {
  return mediasReferences(racineDepot).filter((m) => !fs.existsSync(path.join(racineDepot, "docs", m)));
}

function publier({ racineDepot, distant = "origin", sec = false }) {
  const manquants = mediasManquants(racineDepot);
  if (manquants.length) {
    const e = new Error("Médias à fabriquer avant de publier (node outils/site/medias.js) :\n  " + manquants.join("\n  "));
    e.manquants = manquants;
    throw e;
  }
  const fichiers = fichiersAPublier(racineDepot);
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "pm-site-"));
  try {
    let octets = 0;
    for (const f of fichiers) {
      const cible = path.join(site, f);
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.copyFileSync(path.join(racineDepot, "docs", f), cible);
      octets += fs.statSync(cible).size;
    }
    fs.writeFileSync(path.join(site, ".nojekyll"), "");
    if (sec) return { fichiers: fichiers.length, octets };
    const url = git(racineDepot, ["remote", "get-url", distant]);
    const nom = git(racineDepot, ["config", "user.name"]);
    const courriel = git(racineDepot, ["config", "user.email"]);
    git(site, ["init", "-q"]);
    git(site, ["checkout", "-q", "-b", "gh-pages"]);
    git(site, ["add", "-A"]);
    git(site, ["-c", `user.name=${nom}`, "-c", `user.email=${courriel}`, "-c", "core.autocrlf=false",
      "commit", "-q", "-m", `site: publication du ${new Date().toISOString().slice(0, 10)}`]);
    const commit = git(site, ["rev-parse", "--short", "HEAD"]);
    git(site, ["push", "--force", url, "gh-pages"], { stdio: ["ignore", "pipe", "inherit"] });
    return { fichiers: fichiers.length, octets, commit };
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const racineDepot = path.join(__dirname, "..", "..");
  try {
    const r = publier({ racineDepot, sec: process.argv.includes("--sec") });
    const mo = (r.octets / 1048576).toFixed(1).replace(".", ",");
    console.log(r.commit ? `Site publié sur gh-pages (${r.fichiers} fichiers, ${mo} Mo, commit ${r.commit}).` : `Site prêt, rien de poussé (${r.fichiers} fichiers, ${mo} Mo).`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { fichiersAPublier, mediasReferences, mediasManquants, publier };
