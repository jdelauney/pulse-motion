#!/usr/bin/env node
// Wiki Pulse Motion – écrit dans les pages les cartes de la galerie, du catalogue et du lexique, à partir des sources du plugin
// (dictionnaire de mouvements, styles, recettes d'effets, mouvements de personnages). Chaque bloc va entre
// <!-- galerie:<nom> --> et <!-- /galerie:<nom> -->. Le contenu est dans le HTML : les pages se lisent sans JavaScript ; les
// aperçus (docs/medias/galerie/, outils/site/medias.js) s'y ajoutent quand ils existent.
// Lancer : node outils/site/galerie.js [--verifier]
//   --verifier  n'écrit rien ; code 1 si une page ne suit plus les sources
"use strict";

const fs = require("fs");
const path = require("path");
const G = require("./galerie-medias.js");

const RACINE_DEPOT = path.join(__dirname, "..", "..");
const PLUGIN = (racine) => path.join(racine, "plugins", "pulse-motion");
const { normaliser } = require(path.join(PLUGIN(RACINE_DEPOT), "scripts", "mouvements.js"));

const PAGES = { mouvements: "mouvements.html", styles: "catalogue.html", effets: "catalogue.html", personnages: "catalogue.html", "mots-du-mouvement": "lexique.html" };

const e = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Aperçu vidéo d'une carte : boucle muette, chargée seulement quand on la lit (docs/js/galerie.js), affiche en attendant. */
function apercu(mp4, jpg, legende, prefixe = "") {
  return `<video class="apercu" muted loop playsinline preload="none" poster="${prefixe}${jpg}" aria-label="${e(legende)}"><source src="${prefixe}${mp4}" type="video/mp4"></video>`;
}

function blocMouvements() {
  const { categories, mouvements } = G.dictionnaire();
  const recetteCourte = (m) => m.recette.exemple.replace(/\s*\n\s*/g, " ").slice(0, 160) + (m.recette.exemple.length > 160 ? "…" : "");
  return categories.map((c) => {
    const cartes = mouvements.filter((m) => m.categorie === c.id).map((m) => {
      const [mp4, jpg] = G.fichiersMouvement(m.no);
      const mots = normaliser([m.no, `#${m.no}`, m.nom.fr, m.nom.metier, m.slug, ...m.motsCles].join(" "));
      return `<article class="carte-mouvement" id="m${m.no}" data-categorie="${c.id}" data-mots="${e(mots)}">
<figure>${apercu(mp4, jpg, `Aperçu : ${m.nom.fr}`)}</figure>
<p class="carte-mouvement-numero">#${m.no}</p>
<h3 class="carte-mouvement-nom">${e(m.nom.fr)} <span lang="en">${e(m.nom.metier)}</span></h3>
<p class="carte-mouvement-sens">${e(m.sens)}</p>
<details><summary>Fiche</summary>
<p><strong>Pour le demander :</strong></p>
<pre class="commande"><code>${e(m.demande)}</code></pre>
<p><strong>Quand :</strong> ${e(m.quand)}</p>
<p><strong>Recette :</strong> <code>${e(recetteCourte(m))}</code></p>${m.motionPrompt ? `\n<p class="carte-mouvement-source">Motion Prompt <a href="https://showheyohtaki.github.io/motion-prompt/" rel="noopener">#${m.motionPrompt}</a></p>` : ""}
</details>
</article>`;
    }).join("\n");
    return `<section class="categorie-mouvements" id="categorie-${c.id}" data-categorie="${c.id}">
<h2>${e(c.nom)}</h2>
<div class="grille-mouvements">
${cartes}
</div>
</section>`;
  }).join("\n");
}

function blocStyles() {
  return G.STYLES_LIVRES().map((style) => {
    const dossier = path.join(PLUGIN(RACINE_DEPOT), "styles", style);
    const id = JSON.parse(fs.readFileSync(path.join(dossier, "identite.json"), "utf8"));
    const scenes = JSON.parse(fs.readFileSync(path.join(dossier, "catalogue.json"), "utf8")).scenes;
    const [mp4, ...images] = G.fichiersStyle(style);
    const vignettes = scenes.map((s, i) => `<figure class="vignette"><img src="${images[i]}" alt="Scène ${e(s.nom)} du style ${e(style)}" loading="lazy" width="480" height="270"><figcaption><code>${e(s.nom)}</code> · ${e(s.role)}</figcaption></figure>`).join("\n");
    const liste = (titre, xs) => (xs && xs.length ? `<p><strong>${titre} :</strong> ${xs.map(e).join(" · ")}</p>` : "");
    return `<details class="style-en-mouvement" id="style-${style}">
<summary>Le style <strong>${e(style)}</strong> en mouvement</summary>
<figure class="capture">${apercu(mp4, images[0], `Les huit scènes du style ${style}`)}<figcaption>Les huit scènes toutes faites du style ${e(style)}, avec des textes d'exemple.</figcaption></figure>
<div class="grille-vignettes">
${vignettes}
</div>
<p><strong>Signature :</strong> ${e(id.signature)}</p>
${liste("À faire", id.aFaire)}
${liste("À éviter", id.aEviter)}
</details>`;
  }).join("\n");
}

function blocEffets() {
  const cartes = G.effets().map((nom) => {
    const r = JSON.parse(fs.readFileSync(path.join(PLUGIN(RACINE_DEPOT), "effets", `${nom}.json`), "utf8"));
    const [mp4, jpg] = G.fichiersEffet(nom);
    return `<article class="carte-effet" id="effet-${nom}">
<figure>${apercu(mp4, jpg, `Aperçu de l'effet ${nom}`)}</figure>
<h3><code>${e(nom)}</code></h3>
<p>${e(r.description)}</p>
</article>`;
  }).join("\n");
  return `<p>${G.effets().length} effets livrés, chacun montré tel que le moteur le dessine.</p>
<div class="grille-mouvements">
${cartes}
</div>`;
}

function blocPersonnages() {
  const r = require("child_process").spawnSync(process.execPath, [path.join(PLUGIN(RACINE_DEPOT), "scripts", "pm.js"), "personnages", "liste"], { encoding: "utf8" });
  const clips = JSON.parse(r.stdout).clips;
  const cartes = G.clipsPersonnages().map((nom) => {
    const c = clips.find((x) => x.nom === nom);
    const [mp4, jpg] = G.fichiersClip(nom);
    return `<article class="carte-effet" id="clip-${nom}">
<figure>${apercu(mp4, jpg, `Le mouvement ${nom}, joué par le Touffu`)}</figure>
<h3><code>${e(nom)}</code></h3>
<p>${e(c ? c.description : "")}</p>
</article>`;
  }).join("\n");
  return `<h3>Les mouvements, joués par le Touffu</h3>
<div class="grille-mouvements">
${cartes}
</div>`;
}

function blocMotsDuMouvement() {
  const { categories, mouvements } = G.dictionnaire();
  return categories.map((c) => `<h3>${e(c.nom)}</h3>
<ul class="liste-mots">
${mouvements.filter((m) => m.categorie === c.id).map((m) => `<li><a href="mouvements.html#m${m.no}">${e(m.nom.fr)}</a> <span lang="en">(${e(m.nom.metier)})</span> : ${e(m.sens.charAt(0).toLowerCase() + m.sens.slice(1))}.</li>`).join("\n")}
</ul>`).join("\n");
}

/** HTML de chaque bloc (toujours depuis le plugin de ce dépôt). */
function blocs() {
  return {
    mouvements: blocMouvements(),
    styles: blocStyles(),
    effets: blocEffets(),
    personnages: blocPersonnages(),
    "mots-du-mouvement": blocMotsDuMouvement(),
  };
}

/** Remplace chaque bloc dans les pages de <racine>/docs ; -> { pages, enRetard } (pages modifiées, ou à modifier avec verifier). */
function appliquer(racine = RACINE_DEPOT, { verifier = false } = {}) {
  const contenus = blocs();
  const parPage = {};
  for (const [nom, page] of Object.entries(PAGES)) (parPage[page] = parPage[page] || []).push(nom);
  const enRetard = [];
  for (const [page, noms] of Object.entries(parPage)) {
    const fichier = path.join(racine, "docs", page);
    const avant = fs.readFileSync(fichier, "utf8");
    let html = avant;
    for (const nom of noms) {
      const debut = `<!-- galerie:${nom} -->`;
      const fin = `<!-- /galerie:${nom} -->`;
      const i = html.indexOf(debut);
      const j = html.indexOf(fin);
      if (i < 0 || j < i) throw new Error(`${page} : marqueurs ${debut} … ${fin} absents.`);
      html = html.slice(0, i + debut.length) + "\n" + contenus[nom] + "\n" + html.slice(j);
    }
    if (html !== avant) {
      enRetard.push(page);
      if (!verifier) fs.writeFileSync(fichier, html);
    }
  }
  return { pages: Object.keys(parPage), enRetard };
}

if (require.main === module) {
  const verifier = process.argv.includes("--verifier");
  try {
    const { enRetard } = appliquer(RACINE_DEPOT, { verifier });
    if (verifier && enRetard.length) {
      console.error(`Pages à régénérer : ${enRetard.join(", ")}. Relancez : node outils/site/galerie.js`);
      process.exit(1);
    }
    console.log(enRetard.length && !verifier ? `Pages écrites : ${enRetard.join(", ")}.` : "Galerie à jour.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { blocs, appliquer, PAGES };
