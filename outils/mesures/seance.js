#!/usr/bin/env node
// Mesures Pulse Motion – une séance réelle de Claude Code, non interactive, sur une copie d'un témoin, puis son bilan
// de jetons et de temps (jetons.js). Sert à la mesure de création (spec Rapidité § 5.1.3) et aux mesures des compétences
// (effort, appels avant la première phrase).
//
// Lancer : node outils/mesures/seance.js --plugin <dossier du plugin> --demande "<phrase ou /commande>"
//            [--temoin chaine-du-froid|trois-minutes] [--sans-scenes] [--sortie <fichier.json>] [--delai <minutes>]
//
// --sans-scenes : le témoin sans ses scènes, déroulé et style déjà validés (étape « fabrication ») : la mesure de
// création, avec --demande "/pulse-motion:reprendre". Sans --temoin : un dossier vide.
// La séance tourne avec le plugin donné (--plugin-dir), le plugin installé du même nom désactivé, PM_SANS_OUVRIR=1
// (aucune fenêtre ouverte), les outils des compétences autorisés. Le dossier de travail est retiré à la fin.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { copierTemoin, sourceTemoin } = require("./mesurer.js");
const { bilanSession } = require("./jetons.js");

const OUTILS = ["Bash(pulse-motion *)", "Bash(node *)", "Read", "Write", "Edit", "Glob", "Grep", "Agent"];

function preparer({ plugin, temoin, sansScenes }) {
  const dossier = temoin ? copierTemoin(sourceTemoin(temoin, plugin)) : fs.mkdtempSync(path.join(os.tmpdir(), "pm-seance-"));
  if (temoin && sansScenes) {
    fs.rmSync(path.join(dossier, "scenes"), { recursive: true, force: true });
    const pm = path.join(plugin, "scripts", "pm.js");
    for (const accord of ["deroule", "style"]) spawnSync(process.execPath, [pm, "etat", ".", "--accord", accord], { cwd: dossier, encoding: "utf8" });
  }
  return dossier;
}

/** Transcription d'une séance : ~/.claude/projects/<dossier>/<id>.jsonl */
function trouverTranscription(id) {
  const racine = path.join(os.homedir(), ".claude", "projects");
  for (const d of fs.readdirSync(racine)) {
    const f = path.join(racine, d, `${id}.jsonl`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** Arrête l'aperçu qu'une séance aurait laissé tourner dans le dossier. */
function arreterApercu(dossier) {
  try {
    const etat = JSON.parse(fs.readFileSync(path.join(dossier, ".pulse-motion", "etat.json"), "utf8"));
    if (etat.apercu && etat.apercu.pid) process.kill(etat.apercu.pid);
  } catch { /* rien à arrêter */ }
}

function lancerSeance({ plugin, demande, temoin = null, sansScenes = false, delaiMinutes = 90, garder = false }) {
  const dossier = preparer({ plugin, temoin, sansScenes });
  const args = ["-p", demande, "--plugin-dir", plugin, "--output-format", "json", "--permission-mode", "acceptEdits",
    "--settings", JSON.stringify({ enabledPlugins: { "pulse-motion@pulse-motion": false } }), "--allowedTools", ...OUTILS];
  const debut = Date.now();
  const r = spawnSync("claude", args, {
    cwd: dossier, input: "", encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    timeout: delaiMinutes * 60000, env: { ...process.env, PM_SANS_OUVRIR: "1" },
  });
  const dureeMur = (Date.now() - debut) / 1000;
  let resultat = null;
  try { resultat = JSON.parse(r.stdout); } catch { resultat = null; }
  arreterApercu(dossier);
  const transcription = resultat && resultat.session_id ? trouverTranscription(resultat.session_id) : null;
  const bilan = transcription ? bilanSession(transcription) : null;
  const sortie = {
    date: new Date(debut).toISOString(), plugin, demande, temoin, sansScenes, dureeMur, code: r.status,
    erreur: r.error ? r.error.message : null,
    claude: resultat ? { session: resultat.session_id, duree: resultat.duration_ms / 1000, tours: resultat.num_turns, cout: resultat.total_cost_usd, modeles: Object.keys(resultat.modelUsage || {}), refus: resultat.permission_denials, resultat: String(resultat.result || "").slice(-1500) } : { stdout: String(r.stdout || "").slice(-1500), stderr: String(r.stderr || "").slice(-1500) },
    transcription, bilan,
    etape: (() => { try { return JSON.parse(spawnSync(process.execPath, [path.join(plugin, "scripts", "pm.js"), "etat", "."], { cwd: dossier, encoding: "utf8" }).stdout).etape; } catch { return null; } })(),
    scenesEcrites: fs.existsSync(path.join(dossier, "scenes")) ? fs.readdirSync(path.join(dossier, "scenes")).length : 0,
    dossier: garder ? dossier : null,
  };
  if (!garder) fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  return sortie;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (o, d) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const plugin = path.resolve(valeur("--plugin", path.join(__dirname, "..", "..", "plugins", "pulse-motion")));
  const demande = valeur("--demande");
  if (!demande) { console.error("Usage : node outils/mesures/seance.js --plugin <dossier> --demande \"<phrase>\" [--temoin <nom>] [--sans-scenes] [--sortie <fichier>]"); process.exit(2); }
  const r = lancerSeance({ plugin, demande, temoin: valeur("--temoin", null), sansScenes: args.includes("--sans-scenes"), delaiMinutes: Number(valeur("--delai", "90")), garder: args.includes("--garder") });
  const fichier = valeur("--sortie", null);
  if (fichier) { fs.mkdirSync(path.dirname(path.resolve(fichier)), { recursive: true }); fs.writeFileSync(fichier, JSON.stringify(r, null, 2)); }
  console.log(JSON.stringify({ demande: r.demande, dureeMur: r.dureeMur, code: r.code, etape: r.etape, scenesEcrites: r.scenesEcrites, premierePhraseS: r.bilan && r.bilan.premierePhraseS, appelsAvant: r.bilan && r.bilan.appelsAvantPremierePhrase, appelsOutils: r.bilan && r.bilan.appelsOutils, commandes: r.bilan && r.bilan.commandes, blocDeFin: r.bilan && r.bilan.blocDeFin }, null, 2));
}

module.exports = { lancerSeance, preparer, trouverTranscription };
