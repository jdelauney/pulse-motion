#!/usr/bin/env node
// Mesures Pulse Motion – export par usage (spec Rendu et export, D8 : 5.1, 5.2, 5.4) : poids et temps d'export de chaque
// usage sur les vidéos témoins, coût d'un second usage (dérivé de l'intermédiaire commun), écart de couleur de la mire.
//
// Lancer : node outils/mesures/usages.js [--plugin <dossier du plugin>] [--temoins chaine-du-froid,trois-minutes]
//                                        [--usages web,reseaux,…] [--derive] [--mire] [--sortie <fichier.json>]
//   --usages : usages exportés chacun sur une copie neuve du témoin (« web » seul pour un plugin sans usages : avant S5,
//              « web » est l'export par défaut, « 720p » l'export --qualite 720p) ;
//   --derive : sur une même copie, web puis reseaux puis courriel : temps de capture et de transcodage (décision 1) ;
//   --mire   : export de la mire des couleurs (tests/fixtures/mire-couleurs du dépôt) dans les deux voies, écart CIEDE2000 lu
//              par ffmpeg et par Chrome.
// PM_SANS_OUVRIR=1 et PM_PROFIL=1 passés aux commandes ; dossier personnel temporaire (les mesures de vitesse de cet outil
// ne se mêlent pas à celles de la personne).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { copierTemoin, sourceTemoin } = require("./mesurer.js");
const { decrireMachine } = require("./machine.js");

const DEPOT = path.join(__dirname, "..", "..");
const PLUGIN_DEFAUT = path.join(DEPOT, "plugins", "pulse-motion");
const arrondi = (x) => Math.round(x * 1000) / 1000;

function lancer(plugin, args, cwd, personnel) {
  const debut = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [path.join(plugin, "scripts", "pm.js"), ...args], {
    cwd, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PM_SANS_OUVRIR: "1", PM_PROFIL: "1", PULSE_MOTION_DOSSIER: personnel },
  });
  const duree = Number(process.hrtime.bigint() - debut) / 1e9;
  let resultat = null;
  try { resultat = JSON.parse(r.stdout); } catch { resultat = null; }
  return { code: r.status, duree: arrondi(duree), resultat, erreurs: String(r.stderr || "").slice(-1500) };
}

/** Arguments d'un usage : « 720p » (avant S5) devient --qualite 720p ; « web » n'ajoute rien (export par défaut). */
const argsUsage = (u) => (u === "web" ? [] : u === "720p" ? ["--qualite", "720p"] : ["--pour", u]);

function resumeExport(copie, x, dureeVideo) {
  const r = x.resultat || {};
  const fichier = r.fichier ? (path.isAbsolute(r.fichier) ? r.fichier : path.join(copie, r.fichier)) : null;
  const octets = fichier && fs.existsSync(fichier) ? fs.statSync(fichier).size : null;
  const profil = path.join(copie, "sortie", ".export", "profil.json");
  return {
    ok: x.code === 0 && r.ok === true, duree: x.duree, octets,
    moParMinute: octets && dureeVideo ? arrondi((octets / 1e6) * (60 / dureeVideo)) : null,
    secondesParSeconde: dureeVideo ? arrondi(x.duree / dureeVideo) : null,
    definition: r.definition || null, ips: r.ips || null, segmentsReencodes: r.segmentsReencodes, segmentsRepris: r.segmentsRepris,
    scenesRecapturees: r.scenesRecapturees, encodeur: r.encodeur, paralleles: r.paralleles,
    ...(fs.existsSync(profil) ? { profil: JSON.parse(fs.readFileSync(profil, "utf8")) } : {}),
    ...(x.code === 0 ? {} : { message: r.message, erreurs: x.erreurs }),
  };
}

async function mesurerUsages({ plugin, temoin, usages, journal }) {
  const source = sourceTemoin(temoin, plugin);
  const resultats = {};
  for (const u of usages) {
    const copie = copierTemoin(source);
    const personnel = fs.mkdtempSync(path.join(os.tmpdir(), "pm-mesure-perso-"));
    try {
      journal(`${temoin} : ${u}…`);
      const x = lancer(plugin, ["exporter", ".", ...argsUsage(u)], copie, personnel);
      const duree = x.resultat && x.resultat.duree;
      resultats[u] = resumeExport(copie, x, duree);
      journal(`  ${resultats[u].ok ? "ok" : "échec"} ${resultats[u].duree} s, ${resultats[u].octets} o`);
    } finally {
      fs.rmSync(copie, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      fs.rmSync(personnel, { recursive: true, force: true });
    }
  }
  return resultats;
}

/** Web, puis réseaux et courriel sur la même copie : ce qu'un second usage coûte quand l'intermédiaire existe. */
async function mesurerDerives({ plugin, temoin, journal }) {
  const copie = copierTemoin(sourceTemoin(temoin, plugin));
  const personnel = fs.mkdtempSync(path.join(os.tmpdir(), "pm-mesure-perso-"));
  const r = {};
  try {
    for (const u of ["web", "reseaux", "courriel"]) {
      journal(`${temoin} : ${u} après les précédents…`);
      const x = lancer(plugin, ["exporter", ".", ...argsUsage(u)], copie, personnel);
      r[u] = resumeExport(copie, x, x.resultat && x.resultat.duree);
    }
  } finally {
    fs.rmSync(copie, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.rmSync(personnel, { recursive: true, force: true });
  }
  return r;
}

/** Mire des couleurs : écart CIEDE2000 de chaque aplat, lu par ffmpeg et par Chrome, dans les deux voies du plugin mesuré. */
async function mesurerMire({ plugin, journal }) {
  const M = require(path.join(DEPOT, "plugins", "pulse-motion", "tests", "aide", "mire.js"));
  const F = require(path.join(DEPOT, "plugins", "pulse-motion", "scripts", "lib", "ffmpeg.js"));
  const { trouverNavigateur } = require(path.join(DEPOT, "plugins", "pulse-motion", "scripts", "lib", "navigateur.js"));
  const outil = F.trouverFfmpeg();
  const navigateur = trouverNavigateur();
  const r = {};
  for (const voie of ["fidele", "navigateur"]) {
    const copie = fs.mkdtempSync(path.join(os.tmpdir(), "pm-mire-"));
    const personnel = fs.mkdtempSync(path.join(os.tmpdir(), "pm-mesure-perso-"));
    fs.cpSync(M.MIRE, copie, { recursive: true });
    try {
      journal(`mire : ${voie}…`);
      const x = lancer(plugin, ["exporter", ".", ...(voie === "navigateur" ? ["--rapide"] : [])], copie, personnel);
      if (!x.resultat || !x.resultat.ok) { r[voie] = { ok: false, message: x.resultat && x.resultat.message, erreurs: x.erreurs }; continue; }
      const fichier = path.isAbsolute(x.resultat.fichier) ? x.resultat.fichier : path.join(copie, x.resultat.fichier);
      const sonde = await F.sonder({ ffprobe: outil.cheminProbe, fichier, compter: "aucun" });
      const parFfmpeg = M.ecartsPNG(await F.extraireImage({ ffmpeg: outil.chemin, fichier, t: 0.5 }));
      const parChrome = await M.ecartsChrome({ navigateur, fichier, t: 0.5 });
      r[voie] = { ok: true, couleurs: sonde.couleurs, ffmpeg: M.pire(parFfmpeg), chrome: M.pire(parChrome), ecartsChrome: parChrome };
      journal(`  ffmpeg ΔE max ${r[voie].ffmpeg.deltaE} (${r[voie].ffmpeg.hex}), Chrome ${r[voie].chrome.deltaE} (${r[voie].chrome.hex})`);
    } finally {
      fs.rmSync(copie, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      fs.rmSync(personnel, { recursive: true, force: true });
    }
  }
  return r;
}

function lireOptions(args) {
  const valeur = (o, d) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
  return {
    plugin: path.resolve(valeur("--plugin", PLUGIN_DEFAUT)),
    temoins: valeur("--temoins", "chaine-du-froid,trois-minutes").split(",").filter(Boolean),
    usages: valeur("--usages", "").split(",").filter(Boolean),
    derive: args.includes("--derive"),
    mire: args.includes("--mire"),
    sortie: args.includes("--sortie") ? path.resolve(valeur("--sortie")) : null,
  };
}

async function principal(args) {
  const o = lireOptions(args);
  const journal = (t) => process.stderr.write(`${t}\n`);
  const version = JSON.parse(fs.readFileSync(path.join(o.plugin, ".claude-plugin", "plugin.json"), "utf8")).version;
  const resultat = { date: new Date().toISOString(), plugin: { dossier: o.plugin, version }, machine: decrireMachine({ racinePlugin: o.plugin }), temoins: {} };
  const ecrire = () => { if (o.sortie) { fs.mkdirSync(path.dirname(o.sortie), { recursive: true }); fs.writeFileSync(o.sortie, JSON.stringify(resultat, null, 2)); } };
  for (const t of o.temoins) {
    resultat.temoins[t] = {};
    if (o.usages.length) resultat.temoins[t].usages = await mesurerUsages({ plugin: o.plugin, temoin: t, usages: o.usages, journal });
    if (o.derive) resultat.temoins[t].derives = await mesurerDerives({ plugin: o.plugin, temoin: t, journal });
    ecrire();
  }
  if (o.mire) resultat.mire = await mesurerMire({ plugin: o.plugin, journal });
  ecrire();
  if (!o.sortie) console.log(JSON.stringify(resultat, null, 2));
}

if (require.main === module) principal(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });

module.exports = { argsUsage, resumeExport, lireOptions };
