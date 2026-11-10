// Wiki Pulse Motion – aperçus de la galerie (mouvements, styles, effets, personnages), rendus par le plugin : un projet de
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

/** Exporte le projet en fidèle (720p) ; -> chemin du MP4. */
function exporter(dossier) {
  const r = spawnSync(process.execPath, [path.join(PLUGIN, "scripts", "exporter.js"), dossier, "--qualite", "720p"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
 * Une boucle MP4 muette (480 px, CRF 28, lecture dès le chargement) et une image JPEG par plage.
 * plages : [{ debut, duree, sortie (relatif à docs/, .mp4), affiche (relatif à docs/, .jpg), tAffiche (s, dans la vidéo) }]
 */
function decouper(video, plages) {
  const ffmpeg = outils();
  for (const p of plages) {
    const mp4 = path.join(DOCS, p.sortie);
    fs.mkdirSync(path.dirname(mp4), { recursive: true });
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(p.debut), "-t", String(p.duree), "-i", video, "-an",
      "-vf", "scale=480:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    if (p.affiche) {
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(p.tAffiche), "-i", video, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", path.join(DOCS, p.affiche)]);
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
  const { mouvements } = dictionnaire();
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

/** Boucle (les huit scènes du témoin, 2,5 s chacune), une image par scène, et les images témoin A et B, rendues par le
 * plugin comme « pulse-motion style planche --temoin » (lib/temoin.js), réduites en JPEG de 480 px. */
async function fabriquerStyles() {
  const { projetBoucle, imagesTemoin } = require(path.join(PLUGIN, "scripts", "lib", "temoin.js"));
  const ffmpeg = outils();
  for (const style of STYLES_LIVRES()) {
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
  avecDossier("pm-galerie-dessins-", (dossier) => {
    const demos = dessinsLivres().map((d) => ({
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
      fs.cpSync(source, dossier, { recursive: true, filter: (f) => !/^(sortie|\.pulse-motion|\.historique|exemple\.json)([\/]|$)/.test(path.relative(source, f)) });
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
];

module.exports = { LOTS, GALERIE, dictionnaire, STYLES_LIVRES, scenesDuStyle, effets, clipsPersonnages, dessinsLivres, demoEffet,
  fichiersMouvement, fichiersStyle, fichiersTemoin, fichiersEffet, fichiersClip, fichiersDessin, decouper, modelesVideo, dossierExemple, fichiersExemple, exemplesAFabriquer };
