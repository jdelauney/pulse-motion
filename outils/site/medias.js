#!/usr/bin/env node
// Wiki Pulse Motion – fabrique les médias du site à partir du plugin : vidéos d'exemple (dans docs/medias/, ignoré par git, publiées sur
// gh-pages par outils/site/publier.js) et captures (dans docs/assets/captures/, versionnées). Tout est rendu par le plugin lui-même, sur
// une copie de l'exemple : l'exemple d'origine n'est jamais modifié. Un média dont les sources n'ont pas changé n'est pas refait
// (empreintes dans docs/medias/empreintes.json).
// Lancer : node outils/site/medias.js [<id>…] [--forcer]
// Il faut Chrome ou Edge, et ffmpeg pour les vidéos.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const RACINE = path.join(__dirname, "..", "..");
const PLUGIN = path.join(RACINE, "plugins", "pulse-motion");
const DOCS = path.join(RACINE, "docs");
const MEDIAS_DIR = path.join(DOCS, "medias");
const CAPTURES = path.join(DOCS, "assets", "captures");
const EMPREINTES = path.join(MEDIAS_DIR, "empreintes.json");
const EXEMPLE = path.join(PLUGIN, "exemples", "chaine-du-froid");
const POIDS_MAX_PNG = 400 * 1024;

/** Copie de l'exemple sans voix, sans sous-titres ni logo (la vidéo du tutoriel 1) ; rend son dossier. */
function copieSansVoix(source) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "pm-medias-"));
  fs.cpSync(source, dossier, { recursive: true, filter: (f) => !/^(sortie|\.pulse-motion|\.historique)([\\/]|$)/.test(path.relative(source, f)) });
  const fichier = path.join(dossier, "deroule.json");
  const d = JSON.parse(fs.readFileSync(fichier, "utf8"));
  for (const s of d.scenes) delete s.voix;
  delete d.sousTitres;
  if (d.charte) {
    delete d.charte.logo;
    if (!Object.keys(d.charte).length) delete d.charte;
  }
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2) + "\n");
  return dossier;
}

/** Début (s) de la scène `id` dans la vidéo, transitions comprises. */
function debutScene(dossier, id) {
  const { calculerMinutage } = require(path.join(PLUGIN, "moteur", "minutage.js"));
  const d = JSON.parse(fs.readFileSync(path.join(dossier, "deroule.json"), "utf8"));
  const s = calculerMinutage(d.scenes, {}).scenes.find((x) => x.id === id);
  if (!s) throw new Error(`scène ${id} introuvable`);
  return s.debut;
}

/** Lance un script du plugin et rend son résumé JSON (dernière ligne qui commence par « { »). */
function scriptPlugin(nom, args) {
  const r = spawnSync(process.execPath, [path.join(PLUGIN, "scripts", nom), ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const json = (r.stdout || "").trim().split(/\r?\n/).reverse().find((l) => l.startsWith("{"));
  let resume = null;
  try { resume = JSON.parse(json); } catch { /* sans résumé */ }
  if (r.status !== 0 || !resume || resume.ok === false) {
    throw new Error(`${nom} a échoué : ${(resume && resume.message) || (r.stderr || "").trim().split(/\r?\n/).slice(-3).join(" ")}`);
  }
  return resume;
}

function ffmpeg() {
  const { trouverFfmpeg } = require(path.join(PLUGIN, "scripts", "lib", "ffmpeg.js"));
  const f = trouverFfmpeg();
  if (!f.present) throw new Error("ffmpeg est introuvable : " + f.installer);
  return f.chemin;
}

/** Image d'une vidéo à l'instant t, en JPEG de largeur `largeur`. */
function extraireImage(video, t, sortie, largeur = 1280) {
  execFileSync(ffmpeg(), ["-y", "-loglevel", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", `scale=${largeur}:-2`, "-q:v", "3", sortie]);
}

/** PNG trop lourd : réencodé en JPEG (qualité ≈ 85) à côté, le PNG retiré. Rend le chemin final. */
function alleger(png) {
  if (fs.statSync(png).size <= POIDS_MAX_PNG) return png;
  const jpg = png.replace(/\.png$/, ".jpg");
  execFileSync(ffmpeg(), ["-y", "-loglevel", "error", "-i", png, "-q:v", "4", jpg]);
  fs.rmSync(png);
  return jpg;
}

/** Ouvre `url` dans Chrome ou Edge sans fenêtre, à la taille donnée, et rend la page pilotable. */
async function ouvrir(url, largeur = 1440, hauteur = 900) {
  const { trouverNavigateur } = require(path.join(PLUGIN, "scripts", "lib", "navigateur.js"));
  const { ouvrirPage } = require(path.join(PLUGIN, "scripts", "lib", "cdp.js"));
  const navigateur = trouverNavigateur();
  if (!navigateur) throw new Error("Chrome ou Edge est introuvable.");
  const page = await ouvrirPage({ navigateur, largeur, hauteur });
  await page.aller(url);
  return page;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const urlFichier = (f) => "file:///" + path.resolve(f).split(path.sep).join("/").replace(/^\/+/, "");

/** Les médias du site. `sortie` : chemin relatif à docs/ (sert aussi à outils/site/liens.js). */
const MEDIAS = [
  {
    id: "chaine-du-froid",
    sortie: "medias/chaine-du-froid.mp4",
    sources: [EXEMPLE],
    async fabriquer() {
      const copie = copieSansVoix(EXEMPLE);
      try {
        const r = scriptPlugin("exporter.js", [copie, "--qualite", "720p"]);
        fs.mkdirSync(MEDIAS_DIR, { recursive: true });
        const video = path.join(MEDIAS_DIR, "chaine-du-froid.mp4");
        fs.copyFileSync(r.fichier, video);
        extraireImage(video, debutScene(copie, "seuil") + 4, path.join(CAPTURES, "chaine-du-froid-affiche.jpg"));
      } finally {
        fs.rmSync(copie, { recursive: true, force: true });
      }
    },
  },
  {
    id: "premiere-comparaison-styles",
    sortie: "assets/captures/premiere-comparaison-styles.png",
    sources: [EXEMPLE, path.join(PLUGIN, "styles")],
    async fabriquer() {
      const copie = copieSansVoix(EXEMPLE);
      let page;
      try {
        const r = scriptPlugin("comparer.js", [copie, "clair-pedagogique,chaleureux,minimal"]);
        page = await ouvrir(urlFichier(r.fichier));
        await pause(1500);
        const png = path.join(CAPTURES, "premiere-comparaison-styles.png");
        fs.writeFileSync(png, await page.capturer());
        return alleger(png);
      } finally {
        if (page) await page.fermer();
        fs.rmSync(copie, { recursive: true, force: true });
      }
    },
  },
  {
    id: "premiere-apercu",
    sortie: "assets/captures/premiere-apercu.png",
    sources: [EXEMPLE, path.join(PLUGIN, "moteur")],
    async fabriquer() {
      const { demarrerApercu } = require(path.join(PLUGIN, "scripts", "apercu.js"));
      const copie = copieSansVoix(EXEMPLE);
      let apercu;
      let page;
      try {
        apercu = await demarrerApercu({ dossier: copie, port: 0 });
        page = await ouvrir(apercu.url);
        const t = debutScene(copie, "seuil") + 4;
        await page.evaluer(`(async () => {
          for (let i = 0; i < 100 && !document.querySelector('input[aria-label="Position"]'); i++) await new Promise((r) => setTimeout(r, 100));
          const c = document.querySelector('input[aria-label="Position"]');
          c.value = String(${t});
          c.dispatchEvent(new Event('input'));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        })()`);
        await pause(1500);
        const png = path.join(CAPTURES, "premiere-apercu.png");
        fs.writeFileSync(png, await page.capturer());
        return alleger(png);
      } finally {
        if (page) await page.fermer();
        if (apercu) await apercu.fermer();
        fs.rmSync(copie, { recursive: true, force: true });
      }
    },
  },
];

function empreinte(media) {
  const h = crypto.createHash("sha256");
  h.update(JSON.parse(fs.readFileSync(path.join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version);
  const parcourir = (f) => {
    const st = fs.statSync(f);
    if (st.isDirectory()) fs.readdirSync(f).sort().forEach((n) => parcourir(path.join(f, n)));
    else { h.update(path.relative(RACINE, f)); h.update(fs.readFileSync(f)); }
  };
  media.sources.forEach(parcourir);
  return h.digest("hex");
}

async function principal(args) {
  const forcer = args.includes("--forcer");
  const ids = args.filter((a) => !a.startsWith("--"));
  const inconnus = ids.filter((id) => !MEDIAS.some((m) => m.id === id));
  if (inconnus.length) throw new Error(`Média inconnu : ${inconnus.join(", ")}. Connus : ${MEDIAS.map((m) => m.id).join(", ")}.`);
  fs.mkdirSync(MEDIAS_DIR, { recursive: true });
  const notes = fs.existsSync(EMPREINTES) ? JSON.parse(fs.readFileSync(EMPREINTES, "utf8")) : {};
  for (const m of MEDIAS.filter((x) => !ids.length || ids.includes(x.id))) {
    const e = empreinte(m);
    const present = fs.existsSync(path.join(DOCS, m.sortie)) || fs.existsSync(path.join(DOCS, m.sortie.replace(/\.png$/, ".jpg")));
    if (!forcer && notes[m.id] === e && present) { console.log(`${m.id} : à jour.`); continue; }
    console.log(`${m.id} : fabrication…`);
    const fait = await m.fabriquer();
    notes[m.id] = e;
    fs.writeFileSync(EMPREINTES, JSON.stringify(notes, null, 2) + "\n");
    console.log(`${m.id} : fait${fait ? ` (${path.relative(RACINE, fait)})` : ""}.`);
  }
}

if (require.main === module) {
  principal(process.argv.slice(2)).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
}

module.exports = { MEDIAS, copieSansVoix, debutScene };
