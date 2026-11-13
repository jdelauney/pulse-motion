#!/usr/bin/env node
// Wiki Pulse Motion – écrit dans les pages les cartes de la galerie, du catalogue, du lexique, des idées et des exemples, à partir
// des sources du plugin (dictionnaire de mouvements, styles, recettes d'effets, mouvements de personnages, démos des cartes, modèles
// de vidéo et leurs exemples) et de outils/site/exemples.json (demandes hors exemple.json, Vibe Connection, retouches avant / après). Chaque bloc va entre
// <!-- galerie:<nom> --> et <!-- /galerie:<nom> -->. Le contenu est dans le HTML : les pages se lisent sans JavaScript ; les
// aperçus (docs/medias/galerie/, outils/site/medias.js) s'y ajoutent quand ils existent.
// Les pages anglaises (docs/en/, chantier I) reçoivent les mêmes blocs en anglais : libellés écrits ici dans les deux langues, textes
// des sources traduits par le recueil outils/site/anglais.json ({ "texte français exact": "anglais" }). Un texte source sans
// traduction (nouveau, ou modifié depuis) reparaît en français, marqué lang="fr", et --verifier le signale.
// Lancer : node outils/site/galerie.js [--verifier | --anglais]
//   --verifier  n'écrit rien ; code 1 si une page ne suit plus les sources
//   --anglais   n'écrit rien ; liste (JSON) les textes des sources qui n'ont pas encore de traduction dans anglais.json
"use strict";

const fs = require("fs");
const path = require("path");
const G = require("./galerie-medias.js");

const RACINE_DEPOT = path.join(__dirname, "..", "..");
const PLUGIN = (racine) => path.join(racine, "plugins", "pulse-motion");
const { normaliser } = require(path.join(PLUGIN(RACINE_DEPOT), "scripts", "mouvements.js"));

const PAGES = { mouvements: "mouvements.html", styles: "catalogue.html", effets: "catalogue.html", personnages: "catalogue.html", cartes: "catalogue.html", dessins: "personnages.html", "mots-du-mouvement": "lexique.html", idees: "idees.html", exemples: "exemples.html", retouches: "exemples.html" };
/** Blocs des pages anglaises (docs/en/) ; la page des personnages et le lexique restent en français (spec I). */
const PAGES_EN = { mouvements: "en/mouvements.html", styles: "en/catalogue.html", effets: "en/catalogue.html", personnages: "en/catalogue.html", cartes: "en/catalogue.html", idees: "en/idees.html", exemples: "en/exemples.html", retouches: "en/exemples.html" };

const e = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- Langue

const RECUEIL = path.join(__dirname, "anglais.json");
const lireRecueil = () => (fs.existsSync(RECUEIL) ? JSON.parse(fs.readFileSync(RECUEIL, "utf8")).textes || {} : {});

/**
 * Contexte d'une langue : l(fr, en) choisit un libellé ; tr(fr) traduit un texte des sources (le français s'il manque) ;
 * te(fr) le donne échappé, marqué lang="fr" s'il n'est pas traduit ; m(chemin) préfixe un média ; manques : textes non traduits.
 */
function langue(code = "fr", recueil = code === "en" ? lireRecueil() : {}) {
  const en = code === "en";
  const manques = new Set();
  const trouve = (fr) => {
    const t = String(fr ?? "");
    if (!en || !t.trim()) return null;
    if (Object.prototype.hasOwnProperty.call(recueil, t)) return recueil[t];
    manques.add(t);
    return null;
  };
  return {
    en,
    manques,
    l: (fr, anglais) => (en ? anglais : fr),
    tr: (fr) => trouve(fr) ?? String(fr ?? ""),
    te: (fr) => { const t = trouve(fr); return t !== null ? e(t) : (en ? `<span lang="fr">${e(fr)}</span>` : e(fr)); },
    /** Traduction d'une demande (phrase à copier, restée en français) : « <p class="traduction">“…”</p> », vide en français. */
    traduction: (fr) => { const t = trouve(String(fr).replace(/^\/pulse-motion:[a-z-]+\s+/, "")); return t !== null ? `\n<p class="traduction">“${e(t)}”</p>` : ""; },
    m: (chemin) => (en && !/^[a-z]+:/i.test(chemin) ? `../${chemin}` : chemin),
    pre: en ? '<pre class="commande" lang="fr">' : '<pre class="commande">',
    nombre: (x) => (en ? String(x) : String(x).replace(".", ",")),
  };
}
const FR = () => langue("fr");

/** Aperçu vidéo d'une carte : boucle muette, chargée seulement quand on la lit (docs/js/galerie.js), affiche en attendant. */
function apercu(mp4, jpg, legende, prefixe = "") {
  return `<video class="apercu" muted loop playsinline preload="none" poster="${prefixe}${jpg}" aria-label="${e(legende)}"><source src="${prefixe}${mp4}" type="video/mp4"></video>`;
}
const prefixeMedias = (c) => (c.en ? "../" : "");
const minuscule = (t) => String(t).charAt(0).toLowerCase() + String(t).slice(1);

function blocMouvements(c = FR()) {
  const { categories, mouvements } = G.dictionnaire();
  const recetteCourte = (m) => m.recette.exemple.replace(/\s*\n\s*/g, " ").slice(0, 160) + (m.recette.exemple.length > 160 ? "…" : "");
  return categories.map((cat) => {
    const cartes = mouvements.filter((m) => m.categorie === cat.id).map((m) => {
      const [mp4, jpg] = G.fichiersMouvement(m.no);
      const mots = normaliser([m.no, `#${m.no}`, m.nom.fr, m.nom.metier, m.slug, ...m.motsCles, ...(c.en ? [c.tr(m.sens)] : [])].join(" "));
      const nom = c.en ? `${e(m.nom.metier)} <span lang="fr">${e(m.nom.fr)}</span>` : `${e(m.nom.fr)} <span lang="en">${e(m.nom.metier)}</span>`;
      return `<article class="carte-mouvement" id="m${m.no}" data-categorie="${cat.id}" data-mots="${e(mots)}">
<figure>${apercu(mp4, jpg, c.l(`Aperçu : ${m.nom.fr}`, `Preview: ${m.nom.metier}`), prefixeMedias(c))}</figure>
<p class="carte-mouvement-numero">#${m.no}</p>
<h3 class="carte-mouvement-nom">${nom}</h3>
<p class="carte-mouvement-sens">${c.te(m.sens)}</p>
<details><summary>${c.l("Fiche", "Details")}</summary>
<p><strong>${c.l("Pour le demander :", "To ask for it:")}</strong></p>
${c.pre}<code>${e(m.demande)}</code></pre>${c.traduction(m.demande)}
<p><strong>${c.l("Quand :", "When:")}</strong> ${c.te(m.quand)}</p>
<p><strong>${c.l("Recette :", "Recipe:")}</strong> <code>${e(recetteCourte(m))}</code></p>${m.motionPrompt ? `\n<p class="carte-mouvement-source">${c.l(`Inspiré de la fiche n° ${m.motionPrompt} de`, `Inspired by card no. ${m.motionPrompt} of`)} <a href="https://showheyohtaki.github.io/motion-prompt/" rel="noopener">Motion Prompt</a></p>` : ""}
</details>
</article>`;
    }).join("\n");
    return `<section class="categorie-mouvements" id="categorie-${cat.id}" data-categorie="${cat.id}">
<h2>${c.te(cat.nom)}</h2>
<div class="grille-mouvements">
${cartes}
</div>
</section>`;
  }).join("\n");
}

const { CATEGORIES } = require(path.join(PLUGIN(RACINE_DEPOT), "scripts", "lib", "contrat.js"));
const identiteDe = (style) => JSON.parse(fs.readFileSync(path.join(PLUGIN(RACINE_DEPOT), "styles", style, "identite.json"), "utf8"));

/** Styles livrés regroupés par catégorie, dans l'ordre de CATEGORIES : [{ categorie, styles }] (catégories vides omises). */
function stylesParCategorie() {
  return grouperParCategorie(G.STYLES_LIVRES().map((style) => ({ style, identite: identiteDe(style) })));
}

/** [{ style, identite }] -> [{ categorie, styles }] dans l'ordre de CATEGORIES, puis « Autres styles » ; groupes vides omis. */
function grouperParCategorie(styles) {
  const groupes = CATEGORIES.map((c) => ({ categorie: c, styles: styles.filter((x) => x.identite.categorie === c.id) }));
  const sans = styles.filter((x) => !CATEGORIES.some((c) => c.id === x.identite.categorie));
  if (sans.length) groupes.push({ categorie: { id: "autres", nom: "Autres styles" }, styles: sans });
  return groupes.filter((g) => g.styles.length);
}

/** Carte d'un style : images témoin A et B, boucle, vignettes des neuf scènes, personnalité, usages, « ce qu'il n'est pas »,
 * signature et provenance (spec Styles et réalisation, 5.6). */
function carteStyle(style, id, c = FR()) {
  const scenes = JSON.parse(fs.readFileSync(path.join(PLUGIN(RACINE_DEPOT), "styles", style, "catalogue.json"), "utf8")).scenes;
  const [mp4, ...images] = G.fichiersStyle(style);
  const [a, b] = G.fichiersTemoin(style);
  const p = prefixeMedias(c);
  const vignettes = scenes.map((sc, i) => `<figure class="vignette"><img src="${p}${images[i]}" alt="${c.l(`Scène ${e(sc.nom)} du style ${e(style)}`, `Scene ${e(sc.nom)} of the ${e(style)} style`)}" loading="lazy" width="480" height="270"><figcaption><code>${e(sc.nom)}</code> · ${c.te(sc.role)}</figcaption></figure>`).join("\n");
  const liste = (titre, xs) => (xs && xs.length ? `<p><strong>${titre} :</strong> ${xs.map(c.te).join(" · ")}</p>` : "");
  const listeEn = (titre, xs) => (c.en ? (xs && xs.length ? `<p><strong>${titre}:</strong> ${xs.map(c.te).join(" · ")}</p>` : "") : liste(titre, xs));
  const provenance = (id.provenance || []).length
    ? `<p><strong>${c.l("Provenance :", "Origin:")}</strong> ${id.provenance.map((x) => c.l(`${e(x.depot)}, style « ${e(x.style)} » (${e(x.licence)})`, `${e(x.depot)}, “${e(x.style)}” style (${e(x.licence)})`)).join(" · ")}</p>`
    : `<p><strong>${c.l("Provenance :", "Origin:")}</strong> ${c.l("style d'origine Pulse Motion", "an original Pulse Motion style")}</p>`;
  const personnalite = c.en ? (id.personnalite || []).map(c.te).join(", ") : e((id.personnalite || []).join(", "));
  return `<details class="style-en-mouvement" id="style-${style}" data-categorie="${e(id.categorie || "autres")}">
<summary>${c.l(`Le style <strong>${e(style)}</strong>`, `The <strong>${e(style)}</strong> style`)} · ${personnalite}</summary>
<div class="grille-vignettes temoin">
<figure class="vignette"><img src="${p}${a}" alt="${c.l(`Image témoin A (titre) du style ${e(style)}`, `Sample frame A (title) of the ${e(style)} style`)}" loading="lazy" width="480" height="270"><figcaption>${c.l("A · le titre, mêmes textes pour tous les styles", "A · the title, the same texts for every style")}</figcaption></figure>
<figure class="vignette"><img src="${p}${b}" alt="${c.l(`Image témoin B (chiffre clé) du style ${e(style)}`, `Sample frame B (key figure) of the ${e(style)} style`)}" loading="lazy" width="480" height="270"><figcaption>${c.l("B · le chiffre clé, 1 250 kg", "B · the key figure, 1,250 kg")}</figcaption></figure>
</div>
<figure class="capture">${apercu(mp4, images[0], c.l(`Les neuf scènes du style ${style}`, `The nine scenes of the ${style} style`), p)}<figcaption>${c.l(`Les neuf scènes toutes faites du style ${e(style)}, avec le même contenu témoin, « la chaîne du froid ».`, `The nine ready-made scenes of the ${e(style)} style, with the same sample content, “la chaîne du froid” (the cold chain).`)}</figcaption></figure>
<div class="grille-vignettes">
${vignettes}
</div>
${listeEn(c.l("Pour", "For"), id.usages)}
${id.nonPas ? `<p><strong>${c.l("Ce qu'il n'est pas :", "What it is not:")}</strong> ${c.te(id.nonPas)}</p>` : ""}
<p><strong>${c.l("Signature :", "Signature:")}</strong> ${c.te(id.signature)}</p>
${listeEn(c.l("À faire", "Do"), id.aFaire)}
${listeEn(c.l("À éviter", "Avoid"), id.aEviter)}
${provenance}
</details>`;
}

function blocStyles(c = FR()) {
  return stylesParCategorie().map((g) => `<section class="categorie-styles" id="styles-${g.categorie.id}" data-categorie="${g.categorie.id}">
<h4>${c.te(g.categorie.nom)}</h4>
${g.styles.map((x) => carteStyle(x.style, x.identite, c)).join("\n")}
</section>`).join("\n");
}

/**
 * Ce qui manque pour montrer chaque style livré (spec 5.6 point 3) : ses champs categorie et usages, sa boucle et ses images
 * témoin A et B dans <racine>/docs. -> liste de messages (vide : tout y est).
 */
function manquesStyles(racine = RACINE_DEPOT) {
  const manques = [];
  for (const style of G.STYLES_LIVRES()) {
    const id = identiteDe(style);
    if (!id.categorie) manques.push(`${style} : « categorie » absente de identite.json.`);
    if (!Array.isArray(id.usages) || !id.usages.length) manques.push(`${style} : « usages » absents de identite.json.`);
    const [mp4] = G.fichiersStyle(style);
    const [a, b] = G.fichiersTemoin(style);
    for (const [f, quoi] of [[mp4, "boucle"], [a, "image A"], [b, "image B"]]) {
      if (!fs.existsSync(path.join(racine, "docs", f))) manques.push(`${style} : ${quoi} absente (docs/${f}).`);
    }
  }
  return manques;
}

function blocEffets(c = FR()) {
  const cartes = G.effets().map((nom) => {
    const r = JSON.parse(fs.readFileSync(path.join(PLUGIN(RACINE_DEPOT), "effets", `${nom}.json`), "utf8"));
    const [mp4, jpg] = G.fichiersEffet(nom);
    return `<article class="carte-effet" id="effet-${nom}">
<figure>${apercu(mp4, jpg, c.l(`Aperçu de l'effet ${nom}`, `Preview of the ${nom} effect`), prefixeMedias(c))}</figure>
<h3><code>${e(nom)}</code></h3>
<p>${c.te(r.description)}</p>
</article>`;
  }).join("\n");
  return `<p>${c.l(`${G.effets().length} effets livrés, chacun montré tel que le moteur le dessine.`, `${G.effets().length} built-in effects, each shown exactly as the engine draws it.`)}</p>
<div class="grille-mouvements">
${cartes}
</div>`;
}

function blocPersonnages(c = FR()) {
  const r = require("child_process").spawnSync(process.execPath, [path.join(PLUGIN(RACINE_DEPOT), "scripts", "pm.js"), "personnages", "liste"], { encoding: "utf8" });
  const clips = JSON.parse(r.stdout).clips;
  const cartes = G.clipsPersonnages().map((nom) => {
    const x = clips.find((y) => y.nom === nom);
    const [mp4, jpg] = G.fichiersClip(nom);
    return `<article class="carte-effet" id="clip-${nom}">
<figure>${apercu(mp4, jpg, c.l(`Le mouvement ${nom}, joué par le Touffu`, `The ${nom} move, played by the Touffu`), prefixeMedias(c))}</figure>
<h3><code>${e(nom)}</code></h3>
<p>${c.te(x ? x.description : "")}</p>
</article>`;
  }).join("\n");
  return `<h3>${c.l("Les mouvements, joués par le Touffu", "The moves, played by the Touffu")}</h3>
<div class="grille-mouvements">
${cartes}
</div>`;
}

/** Catalogue : les démos des cartes (lot galerie-cartes de galerie-medias.js), chacune avec la demande qui la produit, et le
 * crédit des fonds de Natural Earth. */
function blocCartes(c = FR()) {
  const demos = G.demosCartes();
  const cartes = demos.map((d) => {
    const [mp4, jpg] = G.fichiersCarte(d.id);
    const vertical = d.ratio === "9:16";
    return `<article class="carte-effet${vertical ? " carte-verticale" : ""}" id="carte-${d.id}">
<figure>${apercu(mp4, jpg, c.l(`Démo : ${d.titre}`, `Demo: ${c.tr(d.titre)}`), prefixeMedias(c))}</figure>
<h3>${c.te(d.titre)}${vertical ? ` <span class="carte-maniere">${c.l("vertical (9:16)", "vertical (9:16)")}</span>` : ""}</h3>
${c.pre}<code>${e(d.demande)}</code></pre>${c.traduction(d.demande)}
</article>`;
  }).join("\n");
  return `<p>${c.l(`${demos.length} démos, chacune fabriquée par Pulse Motion à partir de la demande écrite dessous.`, `${demos.length} demos, each made by Pulse Motion from the request written below it.`)}</p>
<div class="grille-mouvements">
${cartes}
</div>
<p class="legende">${c.l(`Fonds de carte : <a href="https://www.naturalearthdata.com/" rel="noopener">Natural Earth</a>, domaine public. Ils sont livrés avec Pulse Motion : aucune carte n'est chargée en ligne, et le crédit s'ajoute tout seul aux crédits de votre vidéo.`, `Base maps: <a href="https://www.naturalearthdata.com/" rel="noopener">Natural Earth</a>, public domain. They ship with Pulse Motion: no map is loaded online, and the credit is added to your video’s credits automatically.`)}</p>`;
}

/** Page Personnages : une carte par personnage livré, son aperçu animé (il marche, se tourne, salue et saute). */
function blocDessins() {
  const MANIERES = { traits: "en traits", pieces: "en pièces pleines" };
  const cartes = G.dessinsLivres().map((d) => {
    const [mp4, jpg] = G.fichiersDessin(d.nom);
    return `<article class="carte-effet" id="dessin-${d.nom}">
<figure>${apercu(mp4, jpg, `Le personnage ${d.nom} marche, se tourne, salue et saute`)}</figure>
<h3><code>${e(d.nom)}</code> <span class="carte-maniere">${e(MANIERES[d.maniere] || "")}</span></h3>
<p>${e(d.description.charAt(0).toUpperCase() + d.description.slice(1))}.</p>
</article>`;
  }).join("\n");
  return `<div class="grille-mouvements">
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

const FORMATS = { "16:9": "paysage (16:9)", "9:16": "vertical (9:16)", "4:5": "portrait (4:5)", "1:1": "carré (1:1)" };
const FORMATS_EN = { "16:9": "landscape (16:9)", "9:16": "vertical (9:16)", "4:5": "portrait (4:5)", "1:1": "square (1:1)" };
const formatDe = (c, f) => (c.en ? FORMATS_EN : FORMATS)[f];
const duree = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`);
const QUESTIONS = [["montre", "Que montre-t-on ?", "What does it show?"], ["duree", "Durée", "Length"], ["public", "Public", "Audience"], ["parcours", "Parcours", "Path"], ["ajouter", "À ajouter", "To add"], ["musique", "Musique", "Music"], ["voix", "Voix", "Voice"], ["sousTitres", "Sous-titres", "Subtitles"], ["style", "Style", "Style"]];

// Ordre de la page Idées : du plus courant au plus particulier (un modèle absent de la liste vient à la fin).
const ORDRE_IDEES = ["formation-courte", "tutoriel-logiciel", "explication", "presentation-produit", "histoire", "publication-sociale", "accueil", "pitch", "annonce"];
const rangIdee = (m) => (ORDRE_IDEES.includes(m.id) ? ORDRE_IDEES.indexOf(m.id) : ORDRE_IDEES.length);

/** Titre d'une vidéo, resté en français à l'écran, pour une page anglaise : sa traduction entre parenthèses quand il y en a une. */
function titreVideo(c, titre) {
  const t = c.tr(titre);
  return t !== titre ? `“${e(titre)}” (${e(t)})` : `“${e(titre)}”`;
}

/** Page Idées : un modèle par section, avec la vidéo de son exemple, les phrases à copier, sa structure et la séance d'origine. */
function blocIdees(c = FR()) {
  const modeles = G.modelesVideo().sort((a, b) => rangIdee(a) - rangIdee(b));
  const sommaire = `<nav class="idees-sommaire" aria-label="${c.l("Les modèles", "The video templates")}"><ul>
${modeles.map((m) => `<li><a href="#modele-${m.id}">${c.te(m.nom)}</a></li>`).join("\n")}
</ul></nav>`;
  const sections = modeles.map((m) => {
    const [mp4n, jpgn] = G.fichiersExemple(m);
    const [mp4, jpg] = [c.m(mp4n), c.m(jpgn)];
    const dossier = G.dossierExemple(m);
    const deroule = JSON.parse(fs.readFileSync(path.join(dossier, "deroule.json"), "utf8"));
    const fichierRecit = path.join(dossier, "exemple.json");
    const recit = fs.existsSync(fichierRecit) ? JSON.parse(fs.readFileSync(fichierRecit, "utf8")) : null;
    const vertical = m.format === "9:16" || m.format === "4:5";
    const scenes = m.scenes.map((sc, i) => `<tr><td>${i + 1}</td><td>${c.te(sc.intention.charAt(0).toUpperCase() + sc.intention.slice(1))}${sc.ecran ? c.l(" (filmé à l'écran)", " (screen recording)") : ""}</td><td>${c.nombre(sc.duree)} s</td></tr>`).join("\n");
    const variantes = [["grandPublic", "Pour le grand public", "For the general public"], ["professionnels", "Pour des professionnels", "For professionals"], ["eleves", "Pour des élèves ou des stagiaires", "For pupils or trainees"]]
      .map(([cle, titre, title]) => {
        if (!c.en) return `<li><strong>${titre} :</strong> <code>${e(m.variantes[cle])}</code></li>`;
        const t = c.tr(m.variantes[cle].replace(/^\/pulse-motion:[a-z-]+\s+/, ""));
        const traduit = t !== m.variantes[cle].replace(/^\/pulse-motion:[a-z-]+\s+/, "");
        return `<li><strong>${title}:</strong> <code lang="fr">${e(m.variantes[cle])}</code>${traduit ? ` <span class="traduction">(“${e(t)}”)</span>` : ""}</li>`;
      }).join("\n");
    const styles = m.styles.map((st, i) => `<a href="catalogue.html#style-${st}">${e(st)}</a>${i === 0 ? c.l(" (conseillé)", " (recommended)") : ""}`).join(" · ");
    const deux = c.l(" :", ":");
    let seance;
    if (recit) {
      const reponses = QUESTIONS.filter(([k]) => recit.reponses[k]).map(([k, q, en]) => `<dt>${c.l(q, en)}</dt><dd>${k === "style" ? e(recit.reponses[k]) : c.te(recit.reponses[k])}</dd>`).join("\n");
      const retouches = recit.retouches.length
        ? `<p><strong>${c.l("Retouches :", "Edits:")}</strong></p>\n<ul>\n${recit.retouches.map((r) => (c.en ? `<li><span lang="fr">« ${e(r)} »</span>${c.tr(r) !== r ? ` (“${e(c.tr(r))}”)` : ""}</li>` : `<li>« ${e(r)} »</li>`)).join("\n")}\n</ul>`
        : `<p><strong>${c.l("Retouches :", "Edits:")}</strong> ${c.l("aucune.", "none.")}</p>`;
      // Tutoriel logiciel : les étapes filmées et ce qui s'est passé au tournage (prise refaite, flou).
      const parcours = (recit.parcours || []).length ? `\n<p><strong>${c.l("Les étapes filmées, sur l'appli d'essai :", "The recorded steps, on the test app:")}</strong></p>\n<ol>\n${recit.parcours.map((x) => `<li>${c.te(x)}</li>`).join("\n")}\n</ol>` : "";
      const tournage = (recit.tournage || []).length ? `\n<p><strong>${c.l("Au tournage :", "During recording:")}</strong> ${recit.tournage.map(c.te).join(" ")}</p>` : "";
      const corrections = (recit.corrections || []).length ? `\n<p><strong>${c.l("Corrigé par Claude après le contrôle :", "Fixed by Claude after the check:")}</strong> ${recit.corrections.map(c.te).join(" ")}</p>` : "";
      seance = `<p>${c.l("La phrase de départ :", "The opening request:")}</p>
${c.pre}<code>${e(recit.phrase)}</code></pre>${c.traduction(recit.phrase)}
<p>${c.l("Les réponses aux questions (les réponses conseillées, le public selon le sujet, et sans voix) :", "The answers to the questions (the recommended answers, the audience that suits the topic, and no voice):")}</p>
<dl class="idee-reponses">
${reponses}
</dl>
${retouches}${parcours}${tournage}${corrections}`;
    } else {
      seance = c.l(`<p>C'est la vidéo du tutoriel <a href="tutoriels/premiere-video.html">Première vidéo</a>, faite pas à pas avec <code>/pulse-motion:creer</code> ; ici sans sa voix.</p>`,
        `<p>This is the video from the <a href="tutoriels/premiere-video.html">First video</a> tutorial, made step by step with <code>/pulse-motion:creer</code>; shown here without its voice.</p>`);
    }
    const declinaison = m.declinaison ? c.l(`
<p><strong>Variante :</strong> « ${e(m.declinaison.nom)} », ${FORMATS[m.declinaison.format]}, ${duree(m.declinaison.duree)}${m.declinaison.etapes ? `, ${m.declinaison.etapes} étapes` : ""}${m.declinaison.appareil === "telephone" ? ", filmée sur téléphone" : ""}.</p>`, `
<p><strong>Variant:</strong> “${c.te(m.declinaison.nom)}”, ${FORMATS_EN[m.declinaison.format]}, ${duree(m.declinaison.duree)}${m.declinaison.etapes ? `, ${m.declinaison.etapes} steps` : ""}${m.declinaison.appareil === "telephone" ? ", filmed on a phone" : ""}.</p>`) : "";
    return `<section class="idee-modele" id="modele-${m.id}">
<h2>${c.te(m.nom)}</h2>
<p class="idee-pour">${c.te(m.pourQui)}</p>
<p>${c.te(m.description)} <span class="idee-format">${duree(m.duree)} ${c.l("environ", "or so")}, ${formatDe(c, m.format)}.</span></p>
<figure class="capture idee-video${vertical ? " idee-video-verticale" : ""}"><video controls preload="none" playsinline poster="${jpg}" aria-label="${c.l(`Exemple : ${e(deroule.titre)}`, `Example: ${e(c.tr(deroule.titre))}`)}"><source src="${mp4}" type="video/mp4"></video><figcaption>${c.l(`Exemple : « ${e(deroule.titre)} », fabriqué par Pulse Motion.`, `Example: ${titreVideo(c, deroule.titre)}, made by Pulse Motion.`)} <a href="${mp4}" download>${c.l("Télécharger la vidéo (MP4)", "Download the video (MP4)")}</a></figcaption></figure>
<h3>${c.l("Des phrases à copier", "Sentences to copy")}</h3>
${m.phrases.map((ph) => `${c.pre}<code>${e(ph)}</code></pre>${c.traduction(ph)}`).join("\n")}
<h3>${c.l("Selon votre public", "For your audience")}</h3>
<ul>
${variantes}
</ul>
<h3>${c.l("Les scènes du modèle", "The template’s scenes")}</h3>
<table>
<thead><tr><th>${c.l("Scène", "Scene")}</th><th>${c.l("Rôle", "Role")}</th><th>${c.l("Durée", "Length")}</th></tr></thead>
<tbody>
${scenes}
</tbody>
</table>
<p><strong>${c.l("Styles conseillés", "Recommended styles")}${deux}</strong> ${styles}.</p>${declinaison}
<details class="idee-seance"><summary>${c.l("Comment cette vidéo a été faite", "How this video was made")}</summary>
${seance}
</details>
</section>`;
  }).join("\n");
  return `${sommaire}\n${sections}`;
}

// ---------------------------------------------------------------- Page Exemples (chantier F, Valorisation)

const { calculerMinutage } = require(path.join(PLUGIN(RACINE_DEPOT), "moteur", "minutage.js"));
const arrondi = (x) => Math.round(x * 100) / 100;
const secondes = (x, c = FR()) => `${c.nombre(arrondi(x))} s`;
const majuscule = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);

/** Lignes du déroulé validé : n°, ce que fait la scène, ses textes à l'écran, sa durée réelle (rythme compris, sans voix). */
function lignesDeroule(deroule, c = FR()) {
  const min = calculerMinutage(deroule.scenes, {}).scenes;
  return deroule.scenes.map((sc, i) => {
    const intention = sc.intention ? majuscule(sc.intention.replace(/\s+–\s+/, " : ")) : "";
    const textes = Object.values(sc.textes || {}).filter((t) => typeof t === "string" && t.trim()).map((t) => `« ${e(t)} »`).join(" · ");
    // Les textes à l'écran sont ceux de la vidéo, en français : ils ne se traduisent pas.
    return `<tr><td>${i + 1}</td><td>${intention ? c.te(intention) : ""}</td><td${c.en && textes ? ' lang="fr"' : ""}>${textes || "—"}</td><td>${secondes(min[i].fin - min[i].debut, c)}</td></tr>`;
  }).join("\n");
}

/**
 * Page Exemples : pour chaque exemple livré, l'avant et l'après du processus (la demande d'origine, le déroulé validé, la
 * vidéo), dans l'ordre de la page Idées ; puis Vibe Connection. Les demandes viennent de exemple.json (séance d'origine)
 * ou de outils/site/exemples.json (chaîne du froid, Vibe Connection).
 */
function blocExemples(c = FR()) {
  const donnees = G.donneesExemples();
  const modeles = G.modelesVideo().sort((a, b) => rangIdee(a) - rangIdee(b));
  const fiches = modeles.map((m) => {
    const dossier = G.dossierExemple(m);
    const deroule = JSON.parse(fs.readFileSync(path.join(dossier, "deroule.json"), "utf8"));
    const fichierRecit = path.join(dossier, "exemple.json");
    const recit = fs.existsSync(fichierRecit) ? JSON.parse(fs.readFileSync(fichierRecit, "utf8")) : null;
    const id = path.basename(dossier);
    const hors = id === "chaine-du-froid" ? donnees.chaineDuFroid : null;
    if (!recit && !hors) throw new Error(`exemples/${id} : ni exemple.json ni demande dans outils/site/exemples.json.`);
    return { m, id, deroule, recit, hors };
  });
  const sommaire = `<nav class="idees-sommaire" aria-label="${c.l("Les exemples", "The examples")}"><ul>
${fiches.map((f) => `<li><a href="#exemple-${f.id}">${c.te(f.deroule.titre)}</a></li>`).join("\n")}
<li><a href="#exemple-vibe-connection">${e(donnees.vibeConnection.titre)}</a></li>
</ul></nav>`;
  const sections = fiches.map(({ m, id, deroule, recit, hors }) => {
    const [mp4, jpg] = G.fichiersExemple(m).map(c.m);
    const vertical = deroule.format && (deroule.format.ratio === "9:16" || deroule.format.ratio === "4:5");
    const total = calculerMinutage(deroule.scenes, {}).duree;
    const n = recit ? recit.retouches.length : 0;
    const note = recit
      ? c.l(`<p>Puis les réponses conseillées aux questions de Pulse Motion${n ? ` et ${n === 1 ? "une retouche" : `${n} retouches`}` : ", sans retouche"} : le détail est dans <a href="idees.html#modele-${m.id}">la page Idées</a>.</p>`,
        `<p>Then the recommended answers to Pulse Motion’s questions${n ? ` and ${n === 1 ? "one edit" : `${n} edits`}` : ", with no edit"}: the details are on <a href="idees.html#modele-${m.id}">the Ideas page</a>.</p>`)
      : `<p>${c.te(hors.note)} <a href="${hors.tutoriel}">${c.l("Le tutoriel pas à pas", "The step-by-step tutorial")}</a>.</p>`;
    const titre = c.en ? c.te(deroule.titre) : e(deroule.titre);
    return `<section class="exemple" id="exemple-${id}">
<h2>${titre}</h2>
<p class="idee-pour">${c.l("Modèle", "Template")} <a href="idees.html#modele-${m.id}">${c.te(m.nom)}</a> · ${secondes(total, c).replace(" s", "")} ${c.l("secondes", "seconds")}, ${formatDe(c, (deroule.format && deroule.format.ratio) || "16:9")}.</p>
<h3>${c.l("1. La demande", "1. The request")}</h3>
${c.pre}<code>${e(recit ? recit.phrase : hors.phrase)}</code></pre>${c.traduction(recit ? recit.phrase : hors.phrase)}
${note}
<h3>${c.l("2. Le déroulé validé", "2. The approved timeline")}</h3>
<p>${c.l("Avant d'animer quoi que ce soit, Pulse Motion propose ce déroulé et attend votre accord.", "Before animating anything, Pulse Motion proposes this timeline and waits for your approval.")}</p>
<table>
<thead><tr><th>${c.l("Scène", "Scene")}</th><th>${c.l("Ce qu'elle fait", "What it does")}</th><th>${c.l("À l'écran", "On screen (in French)")}</th><th>${c.l("Durée", "Length")}</th></tr></thead>
<tbody>
${lignesDeroule(deroule, c)}
</tbody>
</table>
<h3>${c.l("3. La vidéo", "3. The video")}</h3>
<figure class="capture idee-video${vertical ? " idee-video-verticale" : ""}"><video controls preload="none" playsinline poster="${jpg}" aria-label="${c.l(`La vidéo : ${e(deroule.titre)}`, `The video: ${e(c.tr(deroule.titre))}`)}"><source src="${mp4}" type="video/mp4"></video><figcaption>${c.l(`« ${e(deroule.titre)} », telle que Pulse Motion l'a fabriquée, sans voix.`, `${titreVideo(c, deroule.titre)}, as Pulse Motion made it, without a voice.`)} <a href="${mp4}" download>${c.l("Télécharger la vidéo (MP4)", "Download the video (MP4)")}</a></figcaption></figure>
</section>`;
  }).join("\n");
  const v = donnees.vibeConnection;
  const totalVibe = v.scenes.reduce((t, sc) => t + sc.duree, 0);
  const tutoVibe = c.en ? `../${v.tutoriel}" hreflang="fr` : v.tutoriel;
  const vibe = `<section class="exemple" id="exemple-vibe-connection">
<h2>${e(v.titre)}</h2>
<p class="idee-pour">${c.l(`Une histoire, un faux film muet et rétro · ${Math.floor(totalVibe / 60)} min ${totalVibe % 60} s, ${FORMATS[v.format]}.`, `A story, a mock silent retro film · ${Math.floor(totalVibe / 60)} min ${totalVibe % 60} s, ${FORMATS_EN[v.format]}.`)}</p>
<h3>${c.l("1. Les demandes", "1. The requests")}</h3>
<p>${c.te(v.note)}</p>
<details><summary>${c.l("La première demande, en entier", "The first request, in full")}</summary>
${c.pre}<code>${e(v.phrase)}</code></pre>${c.traduction(v.phrase)}
</details>
<h3>${c.l("2. Le déroulé", "2. The timeline")}</h3>
<table>
<thead><tr><th>${c.l("Scène", "Scene")}</th><th>${c.l("Ce qu'elle fait", "What it does")}</th><th>${c.l("Durée", "Length")}</th></tr></thead>
<tbody>
${v.scenes.map((sc, i) => `<tr><td>${i + 1}</td><td>${c.te(sc.role)}</td><td>${secondes(sc.duree, c)}</td></tr>`).join("\n")}
</tbody>
</table>
<h3>${c.l("3. La vidéo", "3. The video")}</h3>
<figure class="capture capture-carree"><video controls preload="none" playsinline poster="${c.m(v.affiche)}" width="1080" height="1080" aria-label="${c.l(`La vidéo : ${e(v.titre)}`, `The video: ${e(v.titre)}`)}"><source src="${c.m(v.video)}" type="video/mp4"></video><figcaption>${c.l(`Le film fini, avec sa musique et ses bruitages. <a href="${tutoVibe}">Le refaire pas à pas</a>.`, `The finished film, with its music and sound effects. <a href="${tutoVibe}">Remake it step by step</a> (in French).`)}</figcaption></figure>
</section>`;
  return `${sommaire}\n${sections}\n${vibe}`;
}

/** Ce que change une retouche, dit en mots simples et calculé depuis sa définition (rythme du déroulé, fiche du dictionnaire). */
function explicationRetouche(r, deroule, c = FR()) {
  const i = deroule.scenes.findIndex((sc) => sc.id === r.scene);
  const sc = deroule.scenes[i];
  if (i < 0) throw new Error(`retouche ${r.id} : scène ${r.scene} introuvable dans exemples/${r.exemple}.`);
  if (r.rythme !== undefined) {
    return c.l(`Pulse Motion règle le rythme de la scène ${i + 1} dans le déroulé (${String(r.rythme).replace(".", ",")}) : tous ses temps s'étirent, et elle passe de ${secondes(sc.duree)} à ${secondes(sc.duree / r.rythme)}. Les textes et le dessin ne changent pas.`,
      `Pulse Motion sets the pace of scene ${i + 1} in the timeline (${r.rythme}): all its timings stretch, and it goes from ${secondes(sc.duree, c)} to ${secondes(sc.duree / r.rythme, c)}. The texts and the drawing do not change.`);
  }
  const m = G.dictionnaire().mouvements.find((x) => x.no === r.mouvement.no);
  if (!m) throw new Error(`retouche ${r.id} : mouvement #${r.mouvement.no} introuvable.`);
  const style = (r.mouvement.retirer || []).includes("entre-bas");
  if (c.en) {
    return `The ${r.mouvement.element === "titre" ? "title" : `“${e(r.mouvement.element)}” block`} of scene ${i + 1} now comes in with a ${e(m.nom.metier.toLowerCase())} (<span lang="fr">${e(m.nom.fr.toLowerCase())}</span>, <a href="mouvements.html#m${m.no}">#${m.no}</a> in the dictionary): it ${e(minuscule(c.tr(m.sens)))}, ${style ? "instead of rising gently as the style would have it" : "instead of its usual entrance"}. Nothing else changes.`;
  }
  return `Le ${r.mouvement.element === "titre" ? "titre" : `bloc « ${e(r.mouvement.element)} »`} de la scène ${i + 1} entre désormais en ${e(m.nom.fr.toLowerCase())} (<span lang="en">${e(m.nom.metier)}</span>, <a href="mouvements.html#m${m.no}">#${m.no}</a> du dictionnaire) : il ${e(m.sens.charAt(0).toLowerCase() + m.sens.slice(1))}, ${style ? "au lieu de monter doucement comme le veut le style" : "au lieu de son entrée habituelle"}. Rien d'autre ne change.`;
}

/** Page Exemples : deux retouches, la scène avant et après, côte à côte (aperçus du lot « retouches » de outils/site/medias.js). */
function blocRetouches(c = FR()) {
  return G.retouches().map((r) => {
    const deroule = JSON.parse(fs.readFileSync(path.join(PLUGIN(RACINE_DEPOT), "exemples", r.exemple, "deroule.json"), "utf8"));
    const [avMp4, avJpg, apMp4, apJpg] = G.fichiersRetouche(r);
    const n = deroule.scenes.findIndex((sc) => sc.id === r.scene) + 1;
    const demande = r.phrase.replace(/^\/pulse-motion:retoucher\s+/, "");
    const p = prefixeMedias(c);
    const titre = c.en ? `“${e(majuscule(c.tr(demande)))}”` : `« ${e(majuscule(demande))} »`;
    return `<section class="retouche" id="retouche-${r.id}">
<h3>${titre}</h3>
${c.pre}<code>${e(r.phrase)}</code></pre>${c.traduction(r.phrase)}
<p>${explicationRetouche(r, deroule, c)}</p>
<div class="avant-apres">
<figure>${apercu(avMp4, avJpg, c.l(`Avant : la scène ${n} de « ${deroule.titre} »`, `Before: scene ${n} of “${deroule.titre}”`), p)}<figcaption>${c.l(`<strong>Avant</strong> · la scène ${n} de « ${e(deroule.titre)} »`, `<strong>Before</strong> · scene ${n} of ${titreVideo(c, deroule.titre)}`)}</figcaption></figure>
<figure>${apercu(apMp4, apJpg, c.l(`Après « ${demande} » : la même scène`, `After “${c.tr(demande)}”: the same scene`), p)}<figcaption>${c.l("<strong>Après</strong> · la même scène, retouchée", "<strong>After</strong> · the same scene, edited")}</figcaption></figure>
</div>
</section>`;
  }).join("\n");
}

/** HTML de chaque bloc (toujours depuis le plugin de ce dépôt), en français ou en anglais (« en » : seulement les blocs de PAGES_EN). */
function blocs(code = "fr", c = langue(code)) {
  if (c.en) {
    return {
      mouvements: blocMouvements(c),
      styles: blocStyles(c),
      effets: blocEffets(c),
      personnages: blocPersonnages(c),
      cartes: blocCartes(c),
      idees: blocIdees(c),
      exemples: blocExemples(c),
      retouches: blocRetouches(c),
    };
  }
  return {
    mouvements: blocMouvements(),
    styles: blocStyles(),
    effets: blocEffets(),
    personnages: blocPersonnages(),
    cartes: blocCartes(),
    dessins: blocDessins(),
    "mots-du-mouvement": blocMotsDuMouvement(),
    idees: blocIdees(),
    exemples: blocExemples(),
    retouches: blocRetouches(),
  };
}

/** Textes des sources montrés sur les pages anglaises sans traduction dans le recueil (triés). */
function textesSansTraduction(recueil = lireRecueil()) {
  const c = langue("en", recueil);
  blocs("en", c);
  return [...c.manques].sort();
}

/** Remplace chaque bloc dans les pages de <racine>/docs ; -> { pages, enRetard } (pages modifiées, ou à modifier avec verifier).
 * Les pages anglaises absentes de <racine>/docs/en sont ignorées (une copie partielle du wiki, dans les tests). */
function appliquer(racine = RACINE_DEPOT, { verifier = false } = {}) {
  const enRetard = [];
  const pages = [];
  for (const [code, table] of [["fr", PAGES], ["en", PAGES_EN]]) {
    if (code === "en" && !Object.values(table).some((p) => fs.existsSync(path.join(racine, "docs", p)))) continue;
    const contenus = blocs(code);
    const parPage = {};
    for (const [nom, page] of Object.entries(table)) (parPage[page] = parPage[page] || []).push(nom);
    for (const [page, noms] of Object.entries(parPage)) {
      const fichier = path.join(racine, "docs", page);
      pages.push(page);
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
        if (!verifier) fs.writeFileSync(fichier, html, "utf8");
      }
    }
  }
  return { pages, enRetard };
}

if (require.main === module) {
  const verifier = process.argv.includes("--verifier");
  try {
    if (process.argv.includes("--anglais")) {
      console.log(JSON.stringify(textesSansTraduction(), null, 1));
      process.exit(0);
    }
    const { enRetard } = appliquer(RACINE_DEPOT, { verifier });
    if (verifier && enRetard.length) {
      console.error(`Pages à régénérer : ${enRetard.join(", ")}. Relancez : node outils/site/galerie.js`);
      process.exit(1);
    }
    // Un style livré se montre par sa boucle et ses images témoin A et B : sans elles, la galerie n'est pas prête.
    const manques = verifier ? manquesStyles(RACINE_DEPOT) : [];
    if (manques.length) {
      console.error(`Styles incomplets dans la galerie (node outils/site/medias.js galerie-styles) :\n  ${manques.join("\n  ")}`);
      process.exit(1);
    }
    // Un texte sans traduction reste lisible (en français) : signalé, sans bloquer.
    const sansTraduction = textesSansTraduction();
    if (sansTraduction.length) console.warn(`${sansTraduction.length} texte(s) des pages anglaises sans traduction dans outils/site/anglais.json (node outils/site/galerie.js --anglais).`);
    console.log(enRetard.length && !verifier ? `Pages écrites : ${enRetard.join(", ")}.` : "Galerie à jour.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { blocs, appliquer, PAGES, PAGES_EN, langue, textesSansTraduction, manquesStyles, stylesParCategorie, grouperParCategorie, explicationRetouche };
