#!/usr/bin/env node
// Pulse Motion – nouveautés de chaque version (spec Retouches et ergonomie, 5.19), outil de mainteneur.
//   node outils/nouveautes.js              écrit CHANGELOG.md (racine) et docs/nouveautes.html
//   node outils/nouveautes.js --verifier   n'écrit rien ; code 1 si l'un des deux ne suit plus, ou si la version de plugin.json
//                                          n'a pas son entrée dans plugins/pulse-motion/nouveautes.json
//   node outils/nouveautes.js --preparer   affiche le brouillon de l'entrée de la version de plugin.json (à relire et réécrire
//                                          à la main dans nouveautes.json, en phrases simples, au moment d'augmenter la version)
//
// CHANGELOG.md : une section par version, la plus récente d'abord : date, résumé, « Nouveautés » (commits feat) et
// « Corrections » (commits fix). Les versions viennent de la première lignée de main (git log --first-parent) : chaque commit de
// cette lignée appartient à la version que plugin.json prend au premier changement qui suit ; une fusion emporte les commits
// de sa branche. La version du disque, si elle est plus récente que celle du dernier commit, reçoit les commits qui restent.
// Résumé et date : ceux de nouveautes.json quand la version y est (stables avant et après le commit de version) ; sinon la
// parenthèse du commit « chore: version X (…) » de la version, ou le résumé des fusions. Aucun chemin de l'ordinateur : tout
// ce qui ressemble à un chemin local est remplacé par « … ».
// docs/nouveautes.html : la page « Nouveautés » du wiki, tirée de nouveautes.json (phrases écrites pour la personne).
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEPOT = path.join(__dirname, "..");
const PLUGIN = path.join(DEPOT, "plugins", "pulse-motion");
const FICHIER_PLUGIN = "plugins/pulse-motion/.claude-plugin/plugin.json";
const CHANGELOG = path.join(DEPOT, "CHANGELOG.md");
const PAGE = path.join(DEPOT, "docs", "nouveautes.html");
const NOUVEAUTES = path.join(PLUGIN, "nouveautes.json");
const SEP = "\x1f";
const ENREG = "\x1e";

function git(args) {
  const r = spawnSync("git", args, { cwd: DEPOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args[0]} : ${(r.stderr || "").trim() || "échec"}`);
  return r.stdout;
}

/** Ordre des versions « a.b.c ». */
function comparerVersions(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

/** Retire tout ce qui ressemble à un chemin de l'ordinateur (lecteur Windows, lecteur vu par Git sous Windows, dossier personnel). */
function sansChemin(texte) {
  return String(texte)
    .replace(/\b[A-Za-z]:[\\/][^\s,;)»"']*/g, "…")
    .replace(/(^|[\s(«"'])\/(?:[a-z]\/|Users\/|home\/|tmp\/)[^\s,;)»"']*/g, "$1…")
    .replace(/~[\\/][^\s,;)»"']*/g, "…");
}

function lireNouveautes() {
  try { return JSON.parse(fs.readFileSync(NOUVEAUTES, "utf8")); } catch { return []; }
}

/** Versions et commits de chacune, depuis git. -> [{ version, date, commits: [{ date, sujet }] }] (la plus ancienne d'abord) */
function versionsDuJournal() {
  // Changements de version sur la première lignée.
  const diffs = git(["log", "--first-parent", "--reverse", `--format=${ENREG}%H`, "-p", "--diff-merges=first-parent", "--unified=0", "HEAD", "--", FICHIER_PLUGIN]);
  const changements = new Map();
  for (const bloc of diffs.split(ENREG).slice(1)) {
    const hash = bloc.slice(0, 40);
    const m = /^\+\s*"version":\s*"(\d+\.\d+\.\d+)"/m.exec(bloc);
    if (m) changements.set(hash, m[1]);
  }
  // Tous les commits (parents compris), pour attribuer à chaque fusion les commits de sa branche.
  const tous = new Map();
  for (const l of git(["log", `--format=%H${SEP}%P${SEP}%ad${SEP}%s`, "--date=short", "HEAD"]).split("\n")) {
    if (!l) continue;
    const [h, p, date, sujet] = l.split(SEP);
    tous.set(h, { parents: p ? p.split(" ") : [], date, sujet });
  }
  const lignee = git(["log", "--first-parent", "--reverse", "--format=%H", "HEAD"]).split("\n").filter(Boolean);
  const vus = new Set();
  const groupes = [];
  let courant = [];
  for (const h of lignee) {
    const c = tous.get(h);
    // Branche d'une fusion : les ancêtres du second parent pas encore attribués.
    const pile = c.parents.slice(1);
    const branche = [];
    while (pile.length) {
      const x = pile.pop();
      if (vus.has(x) || !tous.has(x)) continue;
      vus.add(x);
      branche.push(x);
      pile.push(...tous.get(x).parents);
    }
    vus.add(h);
    // Branche dans l'ordre où ses commits ont été faits (la pile la parcourt du plus récent au plus ancien).
    courant.push(...branche.reverse().map((x) => tous.get(x)), c);
    if (changements.has(h)) {
      groupes.push({ version: changements.get(h), date: c.date, commits: courant });
      courant = [];
    }
  }
  // Version du disque plus récente que celle du dernier commit : elle reçoit les commits qui restent.
  const disque = JSON.parse(fs.readFileSync(path.join(DEPOT, FICHIER_PLUGIN), "utf8")).version;
  const dernier = groupes.length ? groupes[groupes.length - 1].version : null;
  if (disque && disque !== dernier) groupes.push({ version: disque, date: new Date().toISOString().slice(0, 10), commits: courant });
  // Même version : les commits faits après le commit de version (sur sa branche) lui reviennent, comme une fois la branche
  // fusionnée (la fusion est alors le commit qui change la version) : le journal est le même avant et après la fusion.
  else if (groupes.length) groupes[groupes.length - 1].commits.push(...courant);
  // Une même version prise deux fois sur la lignée : réunie, la date de la seconde.
  const parVersion = new Map();
  for (const g of groupes) {
    if (parVersion.has(g.version)) { const a = parVersion.get(g.version); a.commits.push(...g.commits); a.date = g.date; } else parVersion.set(g.version, g);
  }
  return [...parVersion.values()];
}

const FUSION = /^Merge branch '[^']+'(?: into [^ ]+)?\s*:\s*(.+)$/;
const sansVersionFinale = (t) => t.replace(/\s*\((?:\d+\.\d+\.\d+(?:\s*;[^)]*)?|spec [^)]*)\)\s*$/, "").trim();
const majuscule = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Résumé, nouveautés et corrections d'une version. */
function decrire(g, entree) {
  const sujets = g.commits.map((c) => c.sujet);
  let resume = entree ? entree.resume : null;
  let date = entree && entree.date ? entree.date : g.date;
  if (!resume) {
    const chores = g.commits.filter((c) => new RegExp(`^chore: version ${g.version.replace(/\./g, "\\.")}(?:\\s|$)`).test(c.sujet));
    const chore = chores[chores.length - 1];
    const m = chore && /\((.+)\)\s*$/.exec(chore.sujet);
    if (m) resume = m[1];
    if (chore && !entree) date = chore.date;
  }
  if (!resume) {
    const fusions = [...new Set(sujets.map((s) => FUSION.exec(s)).filter(Boolean).map((m) => sansVersionFinale(m[1])))];
    if (fusions.length) resume = fusions.join(" ; ");
  }
  const liste = (type) => [...new Set(sujets.map((s) => new RegExp(`^${type}(?:\\([^)]*\\))?!?:\\s*(.+)$`).exec(s)).filter(Boolean).map((m) => majuscule(m[1].trim())))];
  const nouveautes = liste("feat");
  const corrections = liste("fix");
  if (!resume) resume = nouveautes[0] || corrections[0] || "Maintenance du dépôt.";
  return { version: g.version, date, resume: majuscule(resume), nouveautes, corrections };
}

function produireChangelog(versions, entrees) {
  const parVersion = new Map(entrees.map((e) => [e.version, e]));
  const lignes = [
    "# Journal des versions de Pulse Motion",
    "",
    "Produit par `outils/nouveautes.js` depuis l'historique du dépôt : ne pas le modifier à la main. Les nouveautés racontées simplement sont sur la page « Nouveautés » du wiki.",
    "",
  ];
  for (const g of versions.slice().sort((a, b) => comparerVersions(b.version, a.version))) {
    const d = decrire(g, parVersion.get(g.version));
    lignes.push(`## ${d.version} – ${d.date}`, "", sansChemin(d.resume), "");
    if (d.nouveautes.length) lignes.push("### Nouveautés", "", ...d.nouveautes.map((x) => `- ${sansChemin(x)}`), "");
    if (d.corrections.length) lignes.push("### Corrections", "", ...d.corrections.map((x) => `- ${sansChemin(x)}`), "");
  }
  return `${lignes.join("\n").replace(/\n+$/, "")}\n`;
}

const echapper = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ancre = (v) => `v${v.replace(/\./g, "-")}`;
const dateFr = (d) => {
  const [a, m, j] = d.split("-").map(Number);
  const mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][m - 1];
  return `${j === 1 ? "1er" : j} ${mois} ${a}`;
};

function produirePage(entrees) {
  const sections = entrees.map((e) => `<section id="${ancre(e.version)}">
<h2>Version ${echapper(e.version)} <span class="duree">${echapper(dateFr(e.date))}</span></h2>
<p>${echapper(e.resume)}</p>
${e.points && e.points.length ? `<ul>\n${e.points.map((p) => `<li>${echapper(p)}</li>`).join("\n")}\n</ul>\n` : ""}</section>`).join("\n\n");
  return `<!doctype html>
<html lang="fr" data-racine="">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nouveautés – Wiki Pulse Motion</title>
<meta name="description" content="Ce qui change à chaque version de Pulse Motion, dit simplement : les nouvelles demandes possibles et les corrections.">
<link rel="stylesheet" href="css/base.css">
<script src="js/donnees.js" defer></script>
<script src="js/gabarit.js" defer></script>
</head>
<body>
<main id="contenu" class="conteneur-lecture">
<article class="typographie">

<header class="entete-page">
<p class="pastille">À jour</p>
<h1>Nouveautés</h1>
<p class="chapo">Ce qui change à chaque version de Pulse Motion, la plus récente d'abord. Quand Pulse Motion vient d'être mis à jour, Claude vous le dit en une phrase, une seule fois. Pour mettre à jour le plugin : dans Claude Code, tapez <code>/plugin</code>, puis suivez le menu. Le journal complet, pour les développeurs, est dans le <a href="https://github.com/jdelauney/pulse-motion/blob/main/CHANGELOG.md">CHANGELOG du dépôt</a>.</p>
</header>

${sections}

</article>
</main>
</body>
</html>
`;
}

function verifierEntrees(entrees) {
  const erreurs = [];
  const version = JSON.parse(fs.readFileSync(path.join(DEPOT, FICHIER_PLUGIN), "utf8")).version;
  if (!entrees.some((e) => e.version === version)) erreurs.push(`nouveautes.json : la version ${version} de plugin.json n'a pas d'entrée (node outils/nouveautes.js --preparer).`);
  return erreurs;
}

function principal(args) {
  const entrees = lireNouveautes();
  if (args.includes("--preparer")) {
    const versions = versionsDuJournal();
    const g = versions[versions.length - 1];
    const d = decrire(g, null);
    const brouillon = { version: d.version, date: new Date().toISOString().slice(0, 10), resume: sansChemin(d.resume), points: d.nouveautes.concat(d.corrections).slice(0, 5).map(sansChemin) };
    process.stdout.write(`${JSON.stringify(brouillon, null, 2)}\n`);
    return 0;
  }
  const changelog = produireChangelog(versionsDuJournal(), entrees);
  const page = produirePage(entrees);
  if (args.includes("--verifier")) {
    const erreurs = verifierEntrees(entrees);
    const lire = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
    if (lire(CHANGELOG) !== changelog) erreurs.push("CHANGELOG.md ne suit plus l'historique : relancer node outils/nouveautes.js.");
    if (lire(PAGE) !== page) erreurs.push("docs/nouveautes.html ne suit plus nouveautes.json : relancer node outils/nouveautes.js.");
    for (const e of erreurs) console.error(e);
    return erreurs.length ? 1 : 0;
  }
  fs.writeFileSync(CHANGELOG, changelog, "utf8");
  fs.writeFileSync(PAGE, page, "utf8");
  for (const e of verifierEntrees(entrees)) console.error(e);
  console.log(`CHANGELOG.md et docs/nouveautes.html écrits (${changelog.split("\n## ").length - 1} versions, ${entrees.length} entrées de nouveautés).`);
  return 0;
}

if (require.main === module) process.exit(principal(process.argv.slice(2)));

module.exports = { comparerVersions, sansChemin, produirePage, produireChangelog, decrire };
