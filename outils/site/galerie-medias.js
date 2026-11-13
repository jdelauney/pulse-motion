// Wiki Pulse Motion – aperçus de la galerie (mouvements, styles, effets, personnages, cartes), rendus par le plugin : un projet de
// démonstration par lot, exporté en fidèle (720p), puis découpé par ffmpeg en courtes boucles muettes de 480 px et en images
// fixes. Les listes viennent des sources du plugin : les pages (outils/site/galerie.js) et les aperçus restent d'accord.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const RACINE = path.join(__dirname, "..", "..");
const PLUGIN = path.join(RACINE, "plugins", "pulse-motion");
const DOCS = path.join(RACINE, "docs");
const GALERIE = "medias/galerie";
const { projetDeDemos, projetDeMouvements } = require(path.join(PLUGIN, "scripts", "lib", "choisir-mouvements.js"));

// ---------------------------------------------------------------- Ce que montre la galerie (sans rien fabriquer)

const dictionnaire = () => JSON.parse(fs.readFileSync(path.join(PLUGIN, "references", "mouvements", "mouvements.json"), "utf8"));
const STYLES_LIVRES = () => fs.readdirSync(path.join(PLUGIN, "styles")).filter((s) => fs.existsSync(path.join(PLUGIN, "styles", s, "catalogue.json"))).sort();
const scenesDuStyle = (style) => JSON.parse(fs.readFileSync(path.join(PLUGIN, "styles", style, "catalogue.json"), "utf8")).scenes.map((s) => s.nom);
const recette = (nom) => JSON.parse(fs.readFileSync(path.join(PLUGIN, "effets", `${nom}.json`), "utf8"));
const estMilieu = (r) => Object.prototype.hasOwnProperty.call(r, "milieu");

/** Recettes d'effets montrées : toutes celles de effets/, dans l'ordre alphabétique. */
const effets = () => fs.readdirSync(path.join(PLUGIN, "effets")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();

/** Mouvements (clips) de la bibliothèque des personnages. */
function clipsPersonnages() {
  const r = spawnSync(process.execPath, [path.join(PLUGIN, "scripts", "pm.js"), "personnages", "liste"], { encoding: "utf8" });
  // Les calques additifs (respiration, clignement) s'ajoutent seuls : ce ne sont pas des mouvements à jouer.
  return JSON.parse(r.stdout).clips.filter((c) => !/calque/.test(c.description || "")).map((c) => c.nom).sort();
}

const fichiersMouvement = (no) => [`${GALERIE}/mouvements/${no}.mp4`, `${GALERIE}/mouvements/${no}.jpg`];
/** Images témoin A et B d'un style (même contenu pour tous les styles : references/styles/temoin.json). */
const fichiersTemoin = (style) => [`${GALERIE}/styles/${style}-temoin-a.jpg`, `${GALERIE}/styles/${style}-temoin-b.jpg`];
/** Boucle du style, une image par scène toute faite, puis les images témoin A et B. */
const fichiersStyle = (style) => [`${GALERIE}/styles/${style}.mp4`, ...scenesDuStyle(style).map((t) => `${GALERIE}/styles/${style}-${t}.jpg`), ...fichiersTemoin(style)];
const fichiersEffet = (nom) => [`${GALERIE}/effets/${nom}.mp4`, `${GALERIE}/effets/${nom}.jpg`];
const fichiersClip = (nom) => [`${GALERIE}/personnages/${nom}.mp4`, `${GALERIE}/personnages/${nom}.jpg`];

/** Personnages livrés (dessins de la bibliothèque) : [{ nom, description, maniere }], dans l'ordre alphabétique. */
function dessinsLivres() {
  const r = spawnSync(process.execPath, [path.join(PLUGIN, "scripts", "pm.js"), "personnages", "liste"], { encoding: "utf8" });
  return JSON.parse(r.stdout).dessins.map((d) => ({ nom: d.nom, description: d.description, maniere: d.maniere || "pieces" }));
}
const fichiersDessin = (nom) => [`${GALERIE}/dessins/${nom}.mp4`, `${GALERIE}/dessins/${nom}.jpg`];

// ---------------------------------------------------------------- Fabrication

function outils() {
  const { trouverFfmpeg } = require(path.join(PLUGIN, "scripts", "lib", "ffmpeg.js"));
  const f = trouverFfmpeg();
  if (!f.present) throw new Error("ffmpeg est introuvable : " + f.installer);
  return f.chemin;
}

/** Exporte le projet en fidèle (720p), avec les options en plus (`--scene <id>`) ; -> chemin du MP4. */
function exporter(dossier, options = []) {
  const r = spawnSync(process.execPath, [path.join(PLUGIN, "scripts", "exporter.js"), dossier, "--qualite", "720p", ...options], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const sortie = (r.stdout || "").trim();
  let resume = null;
  for (let i = sortie.lastIndexOf("{"); i >= 0 && !resume; i = sortie.lastIndexOf("{", i - 1)) {
    if (i > 0 && sortie[i - 1] !== "\n") continue;
    try { resume = JSON.parse(sortie.slice(i)); } catch { /* objet incomplet */ }
  }
  if (r.status !== 0 || !resume || !resume.ok) throw new Error(`export impossible : ${(resume && resume.message) || (r.stderr || "").trim().split(/\r?\n/).slice(-3).join(" ")}`);
  return resume.fichier;
}

/**
 * Une boucle MP4 muette (480 px par défaut, CRF 28, lecture dès le chargement) et une image JPEG par plage.
 * plages : [{ debut, duree, sortie (relatif à docs/, .mp4), affiche (relatif à docs/, .jpg), tAffiche (s, dans la vidéo), largeur? }]
 */
function decouper(video, plages) {
  const ffmpeg = outils();
  for (const p of plages) {
    const mp4 = path.join(DOCS, p.sortie);
    const largeur = p.largeur || 480;
    fs.mkdirSync(path.dirname(mp4), { recursive: true });
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(p.debut), "-t", String(p.duree), "-i", video, "-an",
      "-vf", `scale=${largeur}:-2`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    if (p.affiche) {
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(p.tAffiche), "-i", video, "-frames:v", "1", "-vf", `scale=${largeur}:-2`, "-q:v", "4", path.join(DOCS, p.affiche)]);
    }
  }
}

function avecDossier(prefixe, fn) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), prefixe));
  const nettoyer = () => fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 3 });
  let r;
  try { r = fn(dossier); } catch (e) { nettoyer(); throw e; }
  if (r && typeof r.then === "function") return r.finally(nettoyer);
  nettoyer();
  return r;
}

function fabriquerMouvements() {
  // PM_MEDIAS_MANQUANTS=1 : seuls les mouvements dont un aperçu manque sont fabriqués (les médias publiés restent tels quels).
  const manquantsSeuls = process.env.PM_MEDIAS_MANQUANTS === "1";
  const mouvements = dictionnaire().mouvements.filter((e) => !manquantsSeuls || !fichiersMouvement(e.no).every((f) => fs.existsSync(path.join(DOCS, f))));
  if (!mouvements.length) return;
  avecDossier("pm-galerie-mouvements-", (dossier) => {
    const { plages } = projetDeMouvements(dossier, mouvements);
    const video = exporter(dossier);
    decouper(video, plages.map((p, i) => {
      const [mp4, jpg] = fichiersMouvement(p.no);
      // Image fixe vers la fin du mouvement, ou pendant l'effet (un éclat d'étincelles est fini à 80 %).
      const part = mouvements[i].recette.type === "effet" ? 0.35 : 0.8;
      return { debut: p.debut, duree: p.fin - p.debut, sortie: mp4, affiche: jpg, tAffiche: p.debut + (p.fin - p.debut) * part };
    }));
  });
}

/** Boucle (les neuf scènes du témoin, 2,5 s chacune), une image par scène, et les images témoin A et B, rendues par le
 * plugin comme « pulse-motion style planche --temoin » (lib/temoin.js), réduites en JPEG de 480 px. */
async function fabriquerStyles() {
  const { projetBoucle, imagesTemoin } = require(path.join(PLUGIN, "scripts", "lib", "temoin.js"));
  const ffmpeg = outils();
  // PM_MEDIAS_MANQUANTS=1 : seuls les styles dont un média manque sont fabriqués (les médias publiés restent tels quels).
  const manquantsSeuls = process.env.PM_MEDIAS_MANQUANTS === "1";
  for (const style of STYLES_LIVRES()) {
    if (manquantsSeuls && fichiersStyle(style).every((f) => fs.existsSync(path.join(DOCS, f)))) continue;
    const dossierStyle = path.join(PLUGIN, "styles", style);
    const dossier = projetBoucle({ dossierStyle });
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dossier, "deroule.json"), "utf8"));
      const video = exporter(dossier);
      const { calculerMinutage } = require(path.join(PLUGIN, "moteur", "minutage.js"));
      const min = calculerMinutage(d.scenes, {});
      const [mp4, ...autres] = fichiersStyle(style);
      const images = autres.slice(0, d.scenes.length);
      fs.mkdirSync(path.dirname(path.join(DOCS, mp4)), { recursive: true });
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", video, "-an", "-vf", "scale=480:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(DOCS, mp4)]);
      min.scenes.forEach((s, i) => {
        execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(s.debut + (s.fin - s.debut) * 0.85), "-i", video, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", path.join(DOCS, images[i])]);
      });
    } finally {
      fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 3 });
    }
    await avecDossier("pm-galerie-temoin-", async (sortie) => {
      const r = await imagesTemoin({ dossierStyle, sortie });
      if (!r.ok) throw new Error(`images témoin de ${style} : ${r.message}`);
      const [a, b] = fichiersTemoin(style);
      for (const [png, jpg] of [[r.images.A, a], [r.images.B, b]]) {
        execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", png, "-vf", "scale=480:-2", "-q:v", "4", path.join(DOCS, jpg)]);
      }
    });
  }
}

/** Démo d'un effet : un titre servant d'ancre, l'effet posé dessus (un milieu en data-milieu ; une métamorphose vers un second titre). */
function demoEffet(nom) {
  const r = recette(nom);
  const titres = '<h2 id="ancre" data-texte="titre" data-start="0.1" style="position: relative"></h2>';
  if (estMilieu(r)) {
    return { id: nom, duree: 3, textes: { titre: nom }, html: `${titres}\n<div data-milieu="${nom}" data-start="0" data-dur="3"></div>\n<div data-effet="fumee" data-start="0.2" data-dur="2.5" data-calque="arriere"></div>` };
  }
  // Un effet couplé au milieu (force « milieu », « injecte ») a besoin d'un milieu dans la scène.
  const milieu = /"(?:milieu|injecte)"\s*:|"type":"milieu"/.test(JSON.stringify(r)) ? '\n<div data-milieu="air" data-start="0" data-dur="3"></div>' : "";
  const cible = nom === "metamorphose" ? '\n<h2 id="arrivee" data-texte="texte" data-start="0.1" style="position: relative"></h2>' : "";
  const attrCible = nom === "metamorphose" ? ' data-cible="#arrivee"' : "";
  return { id: nom, duree: 3, textes: { titre: nom, texte: "arrivée" }, html: `${titres}${cible}${milieu}\n<div data-effet="${nom}" data-ancre="#ancre"${attrCible} data-start="0.4" data-dur="2"></div>` };
}

function fabriquerEffets() {
  avecDossier("pm-galerie-effets-", (dossier) => {
    const { plages } = projetDeDemos(dossier, effets().map(demoEffet), { titre: "Effets", style: "tech-sombre" }); // un fond sombre : les effets lumineux s'y voient
    const video = exporter(dossier);
    decouper(video, plages.map((p) => {
      const [mp4, jpg] = fichiersEffet(p.id);
      return { debut: p.debut, duree: p.fin - p.debut, sortie: mp4, affiche: jpg, tAffiche: p.debut + 1.6 };
    }));
  });
}

function fabriquerPersonnages() {
  avecDossier("pm-galerie-personnages-", (dossier) => {
    const demos = clipsPersonnages().map((clip) => ({
      id: clip, duree: 3,
      html: `<div data-personnage="touffu" data-x="50" data-sol="90" data-taille="60" data-vue="35"><i data-action="jouer" data-clip="${clip}" data-start="0.2"></i></div>`,
    }));
    const { plages } = projetDeDemos(dossier, demos, { titre: "Personnages", style: "tech-sombre" }); // le Touffu, blanc, se voit sur un fond sombre
    const video = exporter(dossier);
    decouper(video, plages.map((p) => {
      const [mp4, jpg] = fichiersClip(p.id);
      return { debut: p.debut, duree: p.fin - p.debut, sortie: mp4, affiche: jpg, tAffiche: p.debut + 1.2 };
    }));
  });
}

/** Chaque personnage livré marche, se tourne vers nous, salue puis saute : 5 s, sur un fond clair. */
function fabriquerDessins() {
  // PM_MEDIAS_MANQUANTS=1 : seuls les dessins dont un média manque sont fabriqués (les médias publiés restent tels quels).
  const manquantsSeuls = process.env.PM_MEDIAS_MANQUANTS === "1";
  const aFaire = dessinsLivres().filter((d) => !manquantsSeuls || !fichiersDessin(d.nom).every((x) => fs.existsSync(path.join(DOCS, x))));
  if (!aFaire.length) return;
  avecDossier("pm-galerie-dessins-", (dossier) => {
    const demos = aFaire.map((d) => ({
      id: d.nom, duree: 5,
      html: `<div data-personnage="${d.nom}" data-x="25" data-sol="90" data-taille="62"><i id="va" data-action="marcher" data-vers="55" data-start="0.2" data-dur="1.6"></i><i id="tourne" data-action="tourner" data-vue="70" data-start="#va:fin" data-dur="0.4"></i><i id="salut" data-action="jouer" data-clip="coucou" data-start="#tourne:fin"></i><i data-action="expression" data-expression="joie" data-start="#tourne:fin"></i><i data-action="jouer" data-clip="saut" data-start="#salut:fin+0.1"></i></div>`,
    }));
    const { plages } = projetDeDemos(dossier, demos, { titre: "Personnages livrés" });
    const video = exporter(dossier);
    decouper(video, plages.map((p) => {
      const [mp4, jpg] = fichiersDessin(p.id);
      return { debut: p.debut, duree: p.fin - p.debut, sortie: mp4, affiche: jpg, tAffiche: p.debut + 2.6 };
    }));
  });
}

// ---------------------------------------------------------------- Cartes (catalogue)

// Une démo par usage des cartes (spec S9, 5.10) : la demande en français, et la scène que Pulse Motion en tire. Fonds de
// Natural Earth livrés avec le plugin : aucune ressource en ligne dans la vidéo.
const STYLE_CARTE = "<style>@scope { .carte { position: absolute; inset: 0; width: 100%; height: 100%; } .pm-liaison { stroke-dasharray: 100; stroke-dashoffset: calc(100 * (1 - var(--p))); } }</style>";
const apparait = (debut, duree = 0.5) => `data-start="${debut}" data-dur="${duree}" data-tween="opacity 0→1"`;
const DEMOS_CARTES = [
  { id: "monde", ratio: "16:9", titre: "Le monde, pays par pays",
    demande: "Une carte du monde où nos pays d'export apparaissent un par un : France, Brésil, Canada, Japon, Australie.",
    html: `<svg class="carte" data-carte="monde" data-carte-cadre="monde">${["FR", "BR", "CA", "JP", "AU"].map((c, i) => `<path data-pays="${c}" ${apparait(Math.round((0.3 + 0.45 * i) * 100) / 100)}></path>`).join("")}</svg>` },
  { id: "europe", ratio: "16:9", titre: "L'Europe",
    demande: "Une carte de l'Europe avec nos quatre filiales en couleur, puis la Pologne et Varsovie : c'est la prochaine.",
    textes: { varsovie: "Varsovie" },
    html: `<svg class="carte" data-carte="monde" data-carte-pays="FR,DE,ES,IT" data-carte-cadre="europe"><path data-pays="PL" ${apparait(1.2, 0.8)}></path><g data-repere="Varsovie" ${apparait(2)}><text data-texte="varsovie"></text></g></svg>` },
  { id: "france", ratio: "16:9", titre: "La France, ses régions et l'outre-mer",
    demande: "La carte de France avec ses régions ; l'outre-mer, dans ses encarts, s'allume.",
    html: `<svg class="carte" data-carte="france" data-carte-cadre="monde">${["GUA", "MTQ", "GUF", "REU", "MYT"].map((c, i) => `<path data-pays="${c}" data-start="${Math.round((0.5 + 0.4 * i) * 10) / 10}" data-dur="0.8" data-tween="--pm-surligne 0→1"></path>`).join("")}</svg>` },
  { id: "mamoudzou", ratio: "16:9", titre: "Mamoudzou, à Mayotte",
    demande: "Sur la carte de France, marque Mamoudzou, à Mayotte.",
    textes: { mamoudzou: "Mamoudzou" },
    html: `<svg class="carte" data-carte="france" data-carte-regions="MYT" data-carte-cadre="monde"><g data-repere="Mamoudzou" ${apparait(0.8)}><text data-texte="mamoudzou"></text></g></svg>` },
  { id: "liaison", ratio: "16:9", titre: "De Paris à New York",
    demande: "Une ligne qui relie Paris à New York, comme un vol.",
    textes: { paris: "Paris", newyork: "New York" },
    html: `<svg class="carte" data-carte="monde" data-carte-pays="FR,US"><path data-liaison="Paris→New York" data-start="0.9" data-dur="1.8"></path><g data-repere="Paris" ${apparait(0.3)}><text data-texte="paris"></text></g><g data-repere="New York" ${apparait(2.5)}><text data-texte="newyork"></text></g></svg>` },
  { id: "vertical", ratio: "9:16", titre: "Nos agences en France",
    demande: "En vertical, pour les réseaux : nos agences en France, de Rennes à La Réunion.",
    textes: { rennes: "Rennes", lyon: "Lyon", toulouse: "Toulouse", reunion: "Saint-Denis" },
    html: `<svg class="carte" data-carte="france" data-carte-regions="BRE,ARA,OCC,REU" data-carte-cadre="monde"><path data-liaison="Lyon→Rennes" data-start="1" data-dur="1.2"></path><path data-liaison="Lyon→Toulouse" data-start="1.4" data-dur="1.2"></path><g data-repere="Lyon" ${apparait(0.3)}><text data-texte="lyon"></text></g><g data-repere="Rennes" ${apparait(2)}><text data-texte="rennes"></text></g><g data-repere="Toulouse" ${apparait(2.4)}><text data-texte="toulouse"></text></g><g data-repere="Saint-Denis" ${apparait(2.8)}><text data-texte="reunion"></text></g></svg>` },
];
const DUREE_CARTE = 5;
const demosCartes = () => DEMOS_CARTES;
const fichiersCarte = (id) => [`${GALERIE}/cartes/${id}.mp4`, `${GALERIE}/cartes/${id}.jpg`];

/** Démos des cartes : un projet par format (16:9, puis 9:16), exporté en fidèle, découpé en boucles (480 px de large en 16:9,
 * 360 en 9:16) et en images fixes vers la fin de chaque démo. */
function fabriquerCartes() {
  // PM_MEDIAS_MANQUANTS=1 : seules les démos dont un média manque sont fabriquées (les médias publiés restent tels quels).
  const manquantsSeuls = process.env.PM_MEDIAS_MANQUANTS === "1";
  for (const ratio of ["16:9", "9:16"]) {
    const aFaire = DEMOS_CARTES.filter((d) => d.ratio === ratio && (!manquantsSeuls || !fichiersCarte(d.id).every((f) => fs.existsSync(path.join(DOCS, f)))));
    if (!aFaire.length) continue;
    avecDossier("pm-galerie-cartes-", (dossier) => {
      const demos = aFaire.map((d) => ({ id: d.id, duree: DUREE_CARTE, textes: d.textes || {}, html: `${STYLE_CARTE}\n${d.html}` }));
      const { plages } = projetDeDemos(dossier, demos, { titre: "Cartes", ratio });
      const video = exporter(dossier);
      decouper(video, plages.map((p) => {
        const [mp4, jpg] = fichiersCarte(p.id);
        return { debut: p.debut, duree: p.fin - p.debut, sortie: mp4, affiche: jpg, tAffiche: p.debut + (p.fin - p.debut) * 0.9, largeur: ratio === "9:16" ? 360 : 480 };
      }));
    });
  }
}

// ---------------------------------------------------------------- Exemples des modèles de vidéo (page Idées)

const modelesVideo = () => require(path.join(PLUGIN, "scripts", "modeles.js")).listerModeles();
const dossierExemple = (m) => path.join(PLUGIN, "exemples", m.exemple || m.id);
// « La chaîne du froid » (formation courte) a déjà sa vidéo sans voix sur le site (média chaine-du-froid de medias.js).
const DEJA_PUBLIE = { "chaine-du-froid": ["medias/chaine-du-froid.mp4", "assets/captures/chaine-du-froid-affiche.jpg"] };
/** [mp4, jpg] de l'exemple d'un modèle (relatifs à docs/). */
const fichiersExemple = (m) => DEJA_PUBLIE[m.exemple || m.id] || [`medias/exemples/${m.exemple || m.id}.mp4`, `medias/exemples/${m.exemple || m.id}.jpg`];
const exemplesAFabriquer = () => modelesVideo().filter((m) => !DEJA_PUBLIE[m.exemple || m.id]);

/** Exporte chaque exemple (sans voix ni sous-titres, ils n'en ont pas) en fidèle 720p, avec sa musique ; une affiche par vidéo. */
function fabriquerExemples() {
  const ffmpeg = outils();
  const { calculerMinutage } = require(path.join(PLUGIN, "moteur", "minutage.js"));
  for (const m of exemplesAFabriquer()) {
    avecDossier(`pm-galerie-exemple-`, (dossier) => {
      const source = dossierExemple(m);
      fs.cpSync(source, dossier, { recursive: true, filter: (f) => !/^(sortie|\.pulse-motion|\.historique|exemple\.json|appli)([\\/]|$)/.test(path.relative(source, f)) });
      const video = exporter(dossier);
      const [mp4, jpg] = fichiersExemple(m);
      fs.mkdirSync(path.dirname(path.join(DOCS, mp4)), { recursive: true });
      fs.copyFileSync(video, path.join(DOCS, mp4));
      // Affiche : la troisième scène presque finie (ses textes posés).
      const d = JSON.parse(fs.readFileSync(path.join(dossier, "deroule.json"), "utf8"));
      const s = calculerMinutage(d.scenes, {}).scenes[Math.min(2, d.scenes.length - 1)];
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(s.debut + (s.fin - s.debut) * 0.85), "-i", video, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", path.join(DOCS, jpg)]);
    });
  }
}

// ---------------------------------------------------------------- Avant / après d'une retouche (page Exemples)

const PAGE_EXEMPLES = path.join(__dirname, "exemples.json");
/** Données de la page Exemples (outils/site/exemples.json). */
const donneesExemples = () => JSON.parse(fs.readFileSync(PAGE_EXEMPLES, "utf8"));
const retouches = () => donneesExemples().retouches;
const RETOUCHES = "medias/exemples/retouches";
/** [avant.mp4, avant.jpg, après.mp4, après.jpg] d'une retouche (relatifs à docs/). */
const fichiersRetouche = (r) => ["avant", "apres"].flatMap((q) => [`${RETOUCHES}/${r.id}-${q}.mp4`, `${RETOUCHES}/${r.id}-${q}.jpg`]);

/** Classes d'une recette de type « classe » du dictionnaire (lues dans son exemple). */
function classesDeRecette(m) {
  if (m.recette.type !== "classe") throw new Error(`#${m.no} : seule une recette de type « classe » se pose sur un élément ici.`);
  const c = /class="([^"]+)"/.exec(m.recette.exemple);
  if (!c) throw new Error(`#${m.no} : classe introuvable dans l'exemple de la recette.`);
  return c[1].split(/\s+/).filter(Boolean);
}

/** Copie de l'exemple dans `dossier`, sans voix, sous-titres ni logo (comme la vidéo publiée de l'exemple). */
function copierSansVoix(source, dossier) {
  fs.cpSync(source, dossier, { recursive: true, filter: (f) => !/^(sortie|\.pulse-motion|\.historique|exemple\.json|appli)([\\/]|$)/.test(path.relative(source, f)) });
  const fichier = path.join(dossier, "deroule.json");
  const d = JSON.parse(fs.readFileSync(fichier, "utf8"));
  for (const s of d.scenes) delete s.voix;
  delete d.sousTitres;
  if (d.charte) {
    delete d.charte.logo;
    if (!Object.keys(d.charte).length) delete d.charte;
  }
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2) + "\n");
}

/**
 * Applique une retouche à la copie, comme le dit la consigne de /pulse-motion:retoucher (§ 4, « Appliquer ») : « ralentis
 * la scène 3 » règle `rythme` dans le déroulé ; un mouvement nommé pose la recette du dictionnaire sur l'élément visé, sans
 * sa classe d'entrée du style, et s'ajoute à `scenes[].mouvements`. -> la scène retouchée du déroulé.
 */
function appliquerRetouche(dossier, r) {
  const fichier = path.join(dossier, "deroule.json");
  const d = JSON.parse(fs.readFileSync(fichier, "utf8"));
  const scene = d.scenes.find((s) => s.id === r.scene);
  if (!scene) throw new Error(`retouche ${r.id} : scène ${r.scene} introuvable.`);
  if (r.rythme !== undefined) scene.rythme = r.rythme;
  if (r.mouvement) {
    const m = dictionnaire().mouvements.find((x) => x.no === r.mouvement.no);
    if (!m) throw new Error(`retouche ${r.id} : mouvement #${r.mouvement.no} introuvable.`);
    const html = path.join(dossier, scene.fichier);
    let trouve = false;
    const apres = fs.readFileSync(html, "utf8").replace(/<([a-z0-9]+)([^>]*\bid="([^"]+)"[^>]*)>/g, (tout, balise, attributs, id) => {
      if (id !== r.mouvement.element) return tout;
      trouve = true;
      const a = attributs.replace(/\bclass="([^"]*)"/, (x, classes) => {
        const gardees = classes.split(/\s+/).filter((c) => c && !(r.mouvement.retirer || []).includes(c));
        return `class="${[...gardees, ...classesDeRecette(m)].join(" ")}"`;
      });
      return `<${balise}${a}>`;
    });
    if (!trouve) throw new Error(`retouche ${r.id} : élément #${r.mouvement.element} introuvable dans ${scene.fichier}.`);
    fs.writeFileSync(html, apres);
    const entree = r.mouvement.element === "titre" ? `#${m.no}` : { mouvement: `#${m.no}`, element: r.mouvement.element };
    scene.mouvements = [...(scene.mouvements || []), entree];
  }
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2) + "\n");
  return scene;
}

/** Pour chaque retouche : la scène exportée avant et après (extrait de la scène, fidèle 720p), en boucles de 640 px. */
function fabriquerRetouches() {
  const { calculerMinutage } = require(path.join(PLUGIN, "moteur", "minutage.js"));
  for (const r of retouches()) {
    const [avantMp4, avantJpg, apresMp4, apresJpg] = fichiersRetouche(r);
    for (const [quoi, mp4, jpg] of [["avant", avantMp4, avantJpg], ["apres", apresMp4, apresJpg]]) {
      avecDossier("pm-galerie-retouche-", (dossier) => {
        copierSansVoix(path.join(PLUGIN, "exemples", r.exemple), dossier);
        if (quoi === "apres") appliquerRetouche(dossier, r);
        const d = JSON.parse(fs.readFileSync(path.join(dossier, "deroule.json"), "utf8"));
        const s = calculerMinutage(d.scenes, {}).scenes.find((x) => x.id === r.scene);
        const duree = s.fin - s.debut;
        const video = exporter(dossier, ["--scene", r.scene]);
        // Image fixe au milieu de la scène, avant comme après : les deux se comparent au même moment de son déroulement.
        decouper(video, [{ debut: 0, duree: duree + 1, sortie: mp4, affiche: jpg, tAffiche: duree * 0.5, largeur: 640 }]);
      });
    }
  }
}

/** Lots de la galerie, au format de MEDIAS (outils/site/medias.js). Leurs sources comprennent ce fichier et la chaîne
 * d'export : une démo ou un réglage d'export changé refait les aperçus. */
const FABRICATION = [__filename, path.join(PLUGIN, "scripts", "assembler.js"), path.join(PLUGIN, "scripts", "exporter.js"), path.join(PLUGIN, "scripts", "lib", "choisir-mouvements.js")];
const LOTS = [
  { id: "galerie-mouvements", sortie: `${GALERIE}/mouvements/001.mp4`, sorties: () => dictionnaire().mouvements.flatMap((e) => fichiersMouvement(e.no)),
    sources: [path.join(PLUGIN, "references", "mouvements"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles", "clair-pedagogique"), ...FABRICATION], fabriquer: fabriquerMouvements },
  { id: "galerie-styles", sortie: `${GALERIE}/styles/clair-pedagogique.mp4`, sorties: () => STYLES_LIVRES().flatMap(fichiersStyle),
    sources: [path.join(PLUGIN, "styles"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "references", "styles", "temoin.json"), path.join(PLUGIN, "scripts", "lib", "temoin.js"), path.join(PLUGIN, "scripts", "lib", "projet-essai.js"), ...FABRICATION], fabriquer: fabriquerStyles },
  { id: "galerie-effets", sortie: `${GALERIE}/effets/confettis.mp4`, sorties: () => effets().flatMap(fichiersEffet),
    sources: [path.join(PLUGIN, "effets"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles", "tech-sombre"), ...FABRICATION], fabriquer: fabriquerEffets },
  { id: "galerie-personnages", sortie: `${GALERIE}/personnages/coucou.mp4`, sorties: () => clipsPersonnages().flatMap(fichiersClip),
    sources: [path.join(PLUGIN, "personnages"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles", "tech-sombre"), ...FABRICATION], fabriquer: fabriquerPersonnages },
  { id: "galerie-dessins", sortie: `${GALERIE}/dessins/touffu.mp4`, sorties: () => dessinsLivres().flatMap((d) => fichiersDessin(d.nom)),
    sources: [path.join(PLUGIN, "personnages"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles", "clair-pedagogique"), ...FABRICATION], fabriquer: fabriquerDessins },
  { id: "exemples", sortie: "medias/exemples/pitch.mp4", sorties: () => exemplesAFabriquer().flatMap(fichiersExemple),
    sources: [path.join(PLUGIN, "exemples"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles"), ...FABRICATION], fabriquer: fabriquerExemples },
  { id: "galerie-cartes", sortie: `${GALERIE}/cartes/monde.mp4`, sorties: () => DEMOS_CARTES.flatMap((d) => fichiersCarte(d.id)),
    sources: [path.join(PLUGIN, "cartes"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "scripts", "lib", "cartes.js"), path.join(PLUGIN, "styles", "clair-pedagogique"), ...FABRICATION], fabriquer: fabriquerCartes },
  { id: "retouches", sortie: `${RETOUCHES}/ralentir-avant.mp4`, sorties: () => retouches().flatMap(fichiersRetouche),
    sources: [PAGE_EXEMPLES, path.join(PLUGIN, "exemples", "chaine-du-froid"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles", "clair-pedagogique"),
      path.join(PLUGIN, "references", "mouvements"), ...FABRICATION], fabriquer: fabriquerRetouches },
];

module.exports = { LOTS, GALERIE, dictionnaire, STYLES_LIVRES, scenesDuStyle, effets, clipsPersonnages, dessinsLivres, demoEffet,
  fichiersMouvement, fichiersStyle, fichiersTemoin, fichiersEffet, fichiersClip, fichiersDessin, decouper, modelesVideo, dossierExemple, fichiersExemple, exemplesAFabriquer,
  donneesExemples, retouches, fichiersRetouche, appliquerRetouche, copierSansVoix, classesDeRecette, demosCartes, fichiersCarte };
