#!/usr/bin/env node
// Wiki Pulse Motion – écrit dans les pages les cartes de la galerie, du catalogue, du lexique, des idées et des exemples, à partir
// des sources du plugin (dictionnaire de mouvements, styles, recettes d'effets, mouvements de personnages, modèles de vidéo et leurs
// exemples) et de outils/site/exemples.json (demandes hors exemple.json, Vibe Connection, retouches avant / après). Chaque bloc va entre
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

const PAGES = { mouvements: "mouvements.html", styles: "catalogue.html", effets: "catalogue.html", personnages: "catalogue.html", dessins: "personnages.html", "mots-du-mouvement": "lexique.html", idees: "idees.html", exemples: "exemples.html", retouches: "exemples.html" };

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
<p><strong>Recette :</strong> <code>${e(recetteCourte(m))}</code></p>${m.motionPrompt ? `\n<p class="carte-mouvement-source">Inspiré de la fiche n° ${m.motionPrompt} de <a href="https://showheyohtaki.github.io/motion-prompt/" rel="noopener">Motion Prompt</a></p>` : ""}
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
function carteStyle(style, id) {
  const scenes = JSON.parse(fs.readFileSync(path.join(PLUGIN(RACINE_DEPOT), "styles", style, "catalogue.json"), "utf8")).scenes;
  const [mp4, ...images] = G.fichiersStyle(style);
  const [a, b] = G.fichiersTemoin(style);
  const vignettes = scenes.map((sc, i) => `<figure class="vignette"><img src="${images[i]}" alt="Scène ${e(sc.nom)} du style ${e(style)}" loading="lazy" width="480" height="270"><figcaption><code>${e(sc.nom)}</code> · ${e(sc.role)}</figcaption></figure>`).join("\n");
  const liste = (titre, xs) => (xs && xs.length ? `<p><strong>${titre} :</strong> ${xs.map(e).join(" · ")}</p>` : "");
  const provenance = (id.provenance || []).length
    ? `<p><strong>Provenance :</strong> ${id.provenance.map((p) => `${e(p.depot)}, style « ${e(p.style)} » (${e(p.licence)})`).join(" · ")}</p>`
    : "<p><strong>Provenance :</strong> style d'origine Pulse Motion</p>";
  return `<details class="style-en-mouvement" id="style-${style}" data-categorie="${e(id.categorie || "autres")}">
<summary>Le style <strong>${e(style)}</strong> · ${e((id.personnalite || []).join(", "))}</summary>
<div class="grille-vignettes temoin">
<figure class="vignette"><img src="${a}" alt="Image témoin A (titre) du style ${e(style)}" loading="lazy" width="480" height="270"><figcaption>A · le titre, mêmes textes pour tous les styles</figcaption></figure>
<figure class="vignette"><img src="${b}" alt="Image témoin B (chiffre clé) du style ${e(style)}" loading="lazy" width="480" height="270"><figcaption>B · le chiffre clé, 1 250 kg</figcaption></figure>
</div>
<figure class="capture">${apercu(mp4, images[0], `Les neuf scènes du style ${style}`)}<figcaption>Les neuf scènes toutes faites du style ${e(style)}, avec le même contenu témoin, « la chaîne du froid ».</figcaption></figure>
<div class="grille-vignettes">
${vignettes}
</div>
${liste("Pour", id.usages)}
${id.nonPas ? `<p><strong>Ce qu'il n'est pas :</strong> ${e(id.nonPas)}</p>` : ""}
<p><strong>Signature :</strong> ${e(id.signature)}</p>
${liste("À faire", id.aFaire)}
${liste("À éviter", id.aEviter)}
${provenance}
</details>`;
}

function blocStyles() {
  return stylesParCategorie().map((g) => `<section class="categorie-styles" id="styles-${g.categorie.id}" data-categorie="${g.categorie.id}">
<h4>${e(g.categorie.nom)}</h4>
${g.styles.map((x) => carteStyle(x.style, x.identite)).join("\n")}
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
const duree = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`);
const QUESTIONS = [["montre", "Que montre-t-on ?"], ["duree", "Durée"], ["public", "Public"], ["parcours", "Parcours"], ["ajouter", "À ajouter"], ["musique", "Musique"], ["voix", "Voix"], ["sousTitres", "Sous-titres"], ["style", "Style"]];

// Ordre de la page Idées : du plus courant au plus particulier (un modèle absent de la liste vient à la fin).
const ORDRE_IDEES = ["formation-courte", "tutoriel-logiciel", "explication", "presentation-produit", "histoire", "publication-sociale", "accueil", "pitch", "annonce"];
const rangIdee = (m) => (ORDRE_IDEES.includes(m.id) ? ORDRE_IDEES.indexOf(m.id) : ORDRE_IDEES.length);

/** Page Idées : un modèle par section, avec la vidéo de son exemple, les phrases à copier, sa structure et la séance d'origine. */
function blocIdees() {
  const modeles = G.modelesVideo().sort((a, b) => rangIdee(a) - rangIdee(b));
  const sommaire = `<nav class="idees-sommaire" aria-label="Les modèles"><ul>
${modeles.map((m) => `<li><a href="#modele-${m.id}">${e(m.nom)}</a></li>`).join("\n")}
</ul></nav>`;
  const sections = modeles.map((m) => {
    const [mp4, jpg] = G.fichiersExemple(m);
    const dossier = G.dossierExemple(m);
    const deroule = JSON.parse(fs.readFileSync(path.join(dossier, "deroule.json"), "utf8"));
    const fichierRecit = path.join(dossier, "exemple.json");
    const recit = fs.existsSync(fichierRecit) ? JSON.parse(fs.readFileSync(fichierRecit, "utf8")) : null;
    const vertical = m.format === "9:16" || m.format === "4:5";
    const scenes = m.scenes.map((sc, i) => `<tr><td>${i + 1}</td><td>${e(sc.intention.charAt(0).toUpperCase() + sc.intention.slice(1))}${sc.ecran ? " (filmé à l'écran)" : ""}</td><td>${String(sc.duree).replace(".", ",")} s</td></tr>`).join("\n");
    const variantes = [["grandPublic", "Pour le grand public"], ["professionnels", "Pour des professionnels"], ["eleves", "Pour des élèves ou des stagiaires"]]
      .map(([cle, titre]) => `<li><strong>${titre} :</strong> <code>${e(m.variantes[cle])}</code></li>`).join("\n");
    const styles = m.styles.map((st, i) => `<a href="catalogue.html#style-${st}">${e(st)}</a>${i === 0 ? " (conseillé)" : ""}`).join(" · ");
    let seance;
    if (recit) {
      const reponses = QUESTIONS.filter(([k]) => recit.reponses[k]).map(([k, q]) => `<dt>${q}</dt><dd>${e(recit.reponses[k])}</dd>`).join("\n");
      const retouches = recit.retouches.length ? `<p><strong>Retouches :</strong></p>\n<ul>\n${recit.retouches.map((r) => `<li>« ${e(r)} »</li>`).join("\n")}\n</ul>` : "<p><strong>Retouches :</strong> aucune.</p>";
      // Tutoriel logiciel : les étapes filmées et ce qui s'est passé au tournage (prise refaite, flou).
      const parcours = (recit.parcours || []).length ? `\n<p><strong>Les étapes filmées, sur l'appli d'essai :</strong></p>\n<ol>\n${recit.parcours.map((x) => `<li>${e(x)}</li>`).join("\n")}\n</ol>` : "";
      const tournage = (recit.tournage || []).length ? `\n<p><strong>Au tournage :</strong> ${recit.tournage.map(e).join(" ")}</p>` : "";
      const corrections = (recit.corrections || []).length ? `\n<p><strong>Corrigé par Claude après le contrôle :</strong> ${recit.corrections.map(e).join(" ")}</p>` : "";
      seance = `<p>La phrase de départ :</p>
<pre class="commande"><code>${e(recit.phrase)}</code></pre>
<p>Les réponses aux questions (les réponses conseillées, le public selon le sujet, et sans voix) :</p>
<dl class="idee-reponses">
${reponses}
</dl>
${retouches}${parcours}${tournage}${corrections}`;
    } else {
      seance = `<p>C'est la vidéo du tutoriel <a href="tutoriels/premiere-video.html">Première vidéo</a>, faite pas à pas avec <code>/pulse-motion:creer</code> ; ici sans sa voix.</p>`;
    }
    return `<section class="idee-modele" id="modele-${m.id}">
<h2>${e(m.nom)}</h2>
<p class="idee-pour">${e(m.pourQui)}</p>
<p>${e(m.description)} <span class="idee-format">${duree(m.duree)} environ, ${FORMATS[m.format]}.</span></p>
<figure class="capture idee-video${vertical ? " idee-video-verticale" : ""}"><video controls preload="none" playsinline poster="${jpg}" aria-label="Exemple : ${e(deroule.titre)}"><source src="${mp4}" type="video/mp4"></video><figcaption>Exemple : « ${e(deroule.titre)} », fabriqué par Pulse Motion. <a href="${mp4}" download>Télécharger la vidéo (MP4)</a></figcaption></figure>
<h3>Des phrases à copier</h3>
${m.phrases.map((ph) => `<pre class="commande"><code>${e(ph)}</code></pre>`).join("\n")}
<h3>Selon votre public</h3>
<ul>
${variantes}
</ul>
<h3>Les scènes du modèle</h3>
<table>
<thead><tr><th>Scène</th><th>Rôle</th><th>Durée</th></tr></thead>
<tbody>
${scenes}
</tbody>
</table>
<p><strong>Styles conseillés :</strong> ${styles}.</p>${m.declinaison ? `
<p><strong>Variante :</strong> « ${e(m.declinaison.nom)} », ${FORMATS[m.declinaison.format]}, ${duree(m.declinaison.duree)}${m.declinaison.etapes ? `, ${m.declinaison.etapes} étapes` : ""}${m.declinaison.appareil === "telephone" ? ", filmée sur téléphone" : ""}.</p>` : ""}
<details class="idee-seance"><summary>Comment cette vidéo a été faite</summary>
${seance}
</details>
</section>`;
  }).join("\n");
  return `${sommaire}\n${sections}`;
}

// ---------------------------------------------------------------- Page Exemples (chantier F, Valorisation)

const { calculerMinutage } = require(path.join(PLUGIN(RACINE_DEPOT), "moteur", "minutage.js"));
const secondes = (x) => `${String(Math.round(x * 100) / 100).replace(".", ",")} s`;
const majuscule = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);

/** Lignes du déroulé validé : n°, ce que fait la scène, ses textes à l'écran, sa durée réelle (rythme compris, sans voix). */
function lignesDeroule(deroule) {
  const min = calculerMinutage(deroule.scenes, {}).scenes;
  return deroule.scenes.map((sc, i) => {
    const intention = sc.intention ? majuscule(sc.intention.replace(/\s+–\s+/, " : ")) : "";
    const textes = Object.values(sc.textes || {}).filter((t) => typeof t === "string" && t.trim()).map((t) => `« ${e(t)} »`).join(" · ");
    return `<tr><td>${i + 1}</td><td>${e(intention)}</td><td>${textes || "—"}</td><td>${secondes(min[i].fin - min[i].debut)}</td></tr>`;
  }).join("\n");
}

/**
 * Page Exemples : pour chaque exemple livré, l'avant et l'après du processus (la demande d'origine, le déroulé validé, la
 * vidéo), dans l'ordre de la page Idées ; puis Vibe Connection. Les demandes viennent de exemple.json (séance d'origine)
 * ou de outils/site/exemples.json (chaîne du froid, Vibe Connection).
 */
function blocExemples() {
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
  const sommaire = `<nav class="idees-sommaire" aria-label="Les exemples"><ul>
${fiches.map((f) => `<li><a href="#exemple-${f.id}">${e(f.deroule.titre)}</a></li>`).join("\n")}
<li><a href="#exemple-vibe-connection">${e(donnees.vibeConnection.titre)}</a></li>
</ul></nav>`;
  const sections = fiches.map(({ m, id, deroule, recit, hors }) => {
    const [mp4, jpg] = G.fichiersExemple(m);
    const vertical = deroule.format && (deroule.format.ratio === "9:16" || deroule.format.ratio === "4:5");
    const total = calculerMinutage(deroule.scenes, {}).duree;
    const note = recit
      ? `<p>Puis les réponses conseillées aux questions de Pulse Motion${recit.retouches.length ? ` et ${recit.retouches.length === 1 ? "une retouche" : `${recit.retouches.length} retouches`}` : ", sans retouche"} : le détail est dans <a href="idees.html#modele-${m.id}">la page Idées</a>.</p>`
      : `<p>${e(hors.note)} <a href="${hors.tutoriel}">Le tutoriel pas à pas</a>.</p>`;
    return `<section class="exemple" id="exemple-${id}">
<h2>${e(deroule.titre)}</h2>
<p class="idee-pour">Modèle <a href="idees.html#modele-${m.id}">${e(m.nom)}</a> · ${secondes(total).replace(" s", "")} secondes, ${FORMATS[(deroule.format && deroule.format.ratio) || "16:9"]}.</p>
<h3>1. La demande</h3>
<pre class="commande"><code>${e(recit ? recit.phrase : hors.phrase)}</code></pre>
${note}
<h3>2. Le déroulé validé</h3>
<p>Avant d'animer quoi que ce soit, Pulse Motion propose ce déroulé et attend votre accord.</p>
<table>
<thead><tr><th>Scène</th><th>Ce qu'elle fait</th><th>À l'écran</th><th>Durée</th></tr></thead>
<tbody>
${lignesDeroule(deroule)}
</tbody>
</table>
<h3>3. La vidéo</h3>
<figure class="capture idee-video${vertical ? " idee-video-verticale" : ""}"><video controls preload="none" playsinline poster="${jpg}" aria-label="La vidéo : ${e(deroule.titre)}"><source src="${mp4}" type="video/mp4"></video><figcaption>« ${e(deroule.titre)} », telle que Pulse Motion l'a fabriquée, sans voix. <a href="${mp4}" download>Télécharger la vidéo (MP4)</a></figcaption></figure>
</section>`;
  }).join("\n");
  const v = donnees.vibeConnection;
  const totalVibe = v.scenes.reduce((t, sc) => t + sc.duree, 0);
  const vibe = `<section class="exemple" id="exemple-vibe-connection">
<h2>${e(v.titre)}</h2>
<p class="idee-pour">Une histoire, un faux film muet et rétro · ${Math.floor(totalVibe / 60)} min ${totalVibe % 60} s, ${FORMATS[v.format]}.</p>
<h3>1. Les demandes</h3>
<p>${e(v.note)}</p>
<details><summary>La première demande, en entier</summary>
<pre class="commande"><code>${e(v.phrase)}</code></pre>
</details>
<h3>2. Le déroulé</h3>
<table>
<thead><tr><th>Scène</th><th>Ce qu'elle fait</th><th>Durée</th></tr></thead>
<tbody>
${v.scenes.map((sc, i) => `<tr><td>${i + 1}</td><td>${e(sc.role)}</td><td>${secondes(sc.duree)}</td></tr>`).join("\n")}
</tbody>
</table>
<h3>3. La vidéo</h3>
<figure class="capture capture-carree"><video controls preload="none" playsinline poster="${v.affiche}" width="1080" height="1080" aria-label="La vidéo : ${e(v.titre)}"><source src="${v.video}" type="video/mp4"></video><figcaption>Le film fini, avec sa musique et ses bruitages. <a href="${v.tutoriel}">Le refaire pas à pas</a>.</figcaption></figure>
</section>`;
  return `${sommaire}\n${sections}\n${vibe}`;
}

/** Ce que change une retouche, dit en mots simples et calculé depuis sa définition (rythme du déroulé, fiche du dictionnaire). */
function explicationRetouche(r, deroule) {
  const i = deroule.scenes.findIndex((sc) => sc.id === r.scene);
  const sc = deroule.scenes[i];
  if (i < 0) throw new Error(`retouche ${r.id} : scène ${r.scene} introuvable dans exemples/${r.exemple}.`);
  if (r.rythme !== undefined) {
    return `Pulse Motion règle le rythme de la scène ${i + 1} dans le déroulé (${String(r.rythme).replace(".", ",")}) : tous ses temps s'étirent, et elle passe de ${secondes(sc.duree)} à ${secondes(sc.duree / r.rythme)}. Les textes et le dessin ne changent pas.`;
  }
  const m = G.dictionnaire().mouvements.find((x) => x.no === r.mouvement.no);
  if (!m) throw new Error(`retouche ${r.id} : mouvement #${r.mouvement.no} introuvable.`);
  return `Le ${r.mouvement.element === "titre" ? "titre" : `bloc « ${e(r.mouvement.element)} »`} de la scène ${i + 1} entre désormais en ${e(m.nom.fr.toLowerCase())} (<span lang="en">${e(m.nom.metier)}</span>, <a href="mouvements.html#m${m.no}">#${m.no}</a> du dictionnaire) : il ${e(m.sens.charAt(0).toLowerCase() + m.sens.slice(1))}, ${(r.mouvement.retirer || []).includes("entre-bas") ? "au lieu de monter doucement comme le veut le style" : "au lieu de son entrée habituelle"}. Rien d'autre ne change.`;
}

/** Page Exemples : deux retouches, la scène avant et après, côte à côte (aperçus du lot « retouches » de outils/site/medias.js). */
function blocRetouches() {
  return G.retouches().map((r) => {
    const deroule = JSON.parse(fs.readFileSync(path.join(PLUGIN(RACINE_DEPOT), "exemples", r.exemple, "deroule.json"), "utf8"));
    const [avMp4, avJpg, apMp4, apJpg] = G.fichiersRetouche(r);
    const n = deroule.scenes.findIndex((sc) => sc.id === r.scene) + 1;
    const demande = r.phrase.replace(/^\/pulse-motion:retoucher\s+/, "");
    return `<section class="retouche" id="retouche-${r.id}">
<h3>« ${e(majuscule(demande))} »</h3>
<pre class="commande"><code>${e(r.phrase)}</code></pre>
<p>${explicationRetouche(r, deroule)}</p>
<div class="avant-apres">
<figure>${apercu(avMp4, avJpg, `Avant : la scène ${n} de « ${deroule.titre} »`)}<figcaption><strong>Avant</strong> · la scène ${n} de « ${e(deroule.titre)} »</figcaption></figure>
<figure>${apercu(apMp4, apJpg, `Après « ${demande} » : la même scène`)}<figcaption><strong>Après</strong> · la même scène, retouchée</figcaption></figure>
</div>
</section>`;
  }).join("\n");
}

/** HTML de chaque bloc (toujours depuis le plugin de ce dépôt). */
function blocs() {
  return {
    mouvements: blocMouvements(),
    styles: blocStyles(),
    effets: blocEffets(),
    personnages: blocPersonnages(),
    dessins: blocDessins(),
    "mots-du-mouvement": blocMotsDuMouvement(),
    idees: blocIdees(),
    exemples: blocExemples(),
    retouches: blocRetouches(),
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
    // Un style livré se montre par sa boucle et ses images témoin A et B : sans elles, la galerie n'est pas prête.
    const manques = verifier ? manquesStyles(RACINE_DEPOT) : [];
    if (manques.length) {
      console.error(`Styles incomplets dans la galerie (node outils/site/medias.js galerie-styles) :\n  ${manques.join("\n  ")}`);
      process.exit(1);
    }
    console.log(enRetard.length && !verifier ? `Pages écrites : ${enRetard.join(", ")}.` : "Galerie à jour.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { blocs, appliquer, PAGES, manquesStyles, stylesParCategorie, grouperParCategorie, explicationRetouche };
