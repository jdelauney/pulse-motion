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
const fichiersStyle = (style) => [`${GALERIE}/styles/${style}.mp4`, ...scenesDuStyle(style).map((t) => `${GALERIE}/styles/${style}-${t}.jpg`)];
const fichiersEffet = (nom) => [`${GALERIE}/effets/${nom}.mp4`, `${GALERIE}/effets/${nom}.jpg`];
const fichiersClip = (nom) => [`${GALERIE}/personnages/${nom}.mp4`, `${GALERIE}/personnages/${nom}.jpg`];

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
  try { return fn(dossier); } finally { fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 3 }); }
}

function fabriquerMouvements() {
  const { mouvements } = dictionnaire();
  avecDossier("pm-galerie-mouvements-", (dossier) => {
    const { plages } = projetDeMouvements(dossier, mouvements);
    const video = exporter(dossier);
    decouper(video, plages.map((p) => {
      const [mp4, jpg] = fichiersMouvement(p.no);
      return { debut: p.debut, duree: p.fin - p.debut, sortie: mp4, affiche: jpg, tAffiche: p.debut + (p.fin - p.debut) * 0.8 };
    }));
  });
}

function fabriquerStyles() {
  const { projetEssai } = require(path.join(PLUGIN, "scripts", "lib", "projet-essai.js"));
  const ffmpeg = outils();
  for (const style of STYLES_LIVRES()) {
    const dossier = projetEssai({ dossierStyle: path.join(PLUGIN, "styles", style), textes: "exemple" });
    try {
      // 2,5 s par scène toute faite : la boucle du style montre ses 8 scènes en 20 s.
      const fichier = path.join(dossier, "deroule.json");
      const d = JSON.parse(fs.readFileSync(fichier, "utf8"));
      for (const s of d.scenes) s.duree = 2.5;
      fs.writeFileSync(fichier, JSON.stringify(d, null, 2));
      const video = exporter(dossier);
      const { calculerMinutage } = require(path.join(PLUGIN, "moteur", "minutage.js"));
      const min = calculerMinutage(d.scenes, {});
      const [mp4, ...images] = fichiersStyle(style);
      fs.mkdirSync(path.dirname(path.join(DOCS, mp4)), { recursive: true });
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", video, "-an", "-vf", "scale=480:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(DOCS, mp4)]);
      min.scenes.forEach((s, i) => {
        execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(s.debut + (s.fin - s.debut) * 0.85), "-i", video, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", path.join(DOCS, images[i])]);
      });
    } finally {
      fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 3 });
    }
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

/** Lots de la galerie, au format de MEDIAS (outils/site/medias.js). */
const LOTS = [
  { id: "galerie-mouvements", sortie: `${GALERIE}/mouvements/001.mp4`, sorties: () => dictionnaire().mouvements.flatMap((e) => fichiersMouvement(e.no)),
    sources: [path.join(PLUGIN, "references", "mouvements"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles", "clair-pedagogique"), path.join(PLUGIN, "scripts", "lib", "choisir-mouvements.js")], fabriquer: fabriquerMouvements },
  { id: "galerie-styles", sortie: `${GALERIE}/styles/clair-pedagogique.mp4`, sorties: () => STYLES_LIVRES().flatMap(fichiersStyle),
    sources: [path.join(PLUGIN, "styles"), path.join(PLUGIN, "moteur")], fabriquer: fabriquerStyles },
  { id: "galerie-effets", sortie: `${GALERIE}/effets/confettis.mp4`, sorties: () => effets().flatMap(fichiersEffet),
    sources: [path.join(PLUGIN, "effets"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles", "tech-sombre"), path.join(PLUGIN, "scripts", "lib", "choisir-mouvements.js")], fabriquer: fabriquerEffets },
  { id: "galerie-personnages", sortie: `${GALERIE}/personnages/coucou.mp4`, sorties: () => clipsPersonnages().flatMap(fichiersClip),
    sources: [path.join(PLUGIN, "personnages"), path.join(PLUGIN, "moteur"), path.join(PLUGIN, "styles", "tech-sombre"), path.join(PLUGIN, "scripts", "lib", "choisir-mouvements.js")], fabriquer: fabriquerPersonnages },
];

module.exports = { LOTS, GALERIE, dictionnaire, STYLES_LIVRES, scenesDuStyle, effets, clipsPersonnages, demoEffet,
  fichiersMouvement, fichiersStyle, fichiersEffet, fichiersClip, decouper };
