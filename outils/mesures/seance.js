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
const { spawn, spawnSync } = require("child_process");
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

/** Dossier des transcriptions de Claude Code pour un dossier de travail. */
const dossierTranscriptions = (dossier) => path.join(os.homedir(), ".claude", "projects", path.resolve(dossier).replace(/[^A-Za-z0-9]/g, "-"));

function lignesJSON(fichier) {
  const r = [];
  for (const l of fs.readFileSync(fichier, "utf8").split(/\r?\n/)) { if (l.trim()) { try { r.push(JSON.parse(l)); } catch { /* ligne en cours d'écriture */ } } }
  return r;
}

/** La dernière réponse de la séance (principale, ou d'un agent) finit son tour (end_turn), sans outil en attente. */
function tourFini(fichier, { agent = false } = {}) {
  const lignes = lignesJSON(fichier);
  for (let i = lignes.length - 1; i >= 0; i--) {
    const l = lignes[i];
    if (l.isSidechain && !agent) continue;
    if (l.type === "user") return false;
    if (l.type === "assistant") return Boolean(l.message && l.message.stop_reason === "end_turn");
  }
  return false;
}

/** Tous les agents de la séance ont fini. */
function agentsFinis(transcription) {
  const dossier = path.join(transcription.replace(/\.jsonl$/, ""), "subagents");
  if (!fs.existsSync(dossier)) return true;
  return fs.readdirSync(dossier).filter((f) => f.endsWith(".jsonl")).every((f) => {
    try { if (JSON.parse(fs.readFileSync(path.join(dossier, f.replace(/\.jsonl$/, ".meta.json")), "utf8")).finished === true) return true; } catch { /* méta absente */ }
    return tourFini(path.join(dossier, f), { agent: true });
  });
}

/** Processus descendants (Windows) : [{ pid, nom, ligne }]. */
function descendants(pid) {
  if (process.platform !== "win32") return [];
  const r = spawnSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let tous = [];
  try { tous = JSON.parse(r.stdout); } catch { return []; }
  const enfants = new Map();
  for (const p of tous) { if (!enfants.has(p.ParentProcessId)) enfants.set(p.ParentProcessId, []); enfants.get(p.ParentProcessId).push(p); }
  const liste = [];
  const pile = [pid];
  while (pile.length) for (const e of enfants.get(pile.pop()) || []) { liste.push({ pid: e.ProcessId, nom: e.Name, ligne: e.CommandLine || "" }); pile.push(e.ProcessId); }
  return liste;
}

// Commandes qui tournent sans fin par nature (serveurs ouverts « en arrière-plan ») : elles n'empêchent pas la fin.
const SERVEURS = /pm\.js"?\s+(apercu|atelier|mouvements\s+choisir|personnages\s+atelier|voix\s+studio|musique\s+ecouter)\b|apercu\.js|atelier\.js/;

function arreterArbre(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8" });
  else { try { process.kill(pid); } catch { /* déjà arrêté */ } }
}

/**
 * Une séance non interactive. Claude Code attend la fin de ses tâches de fond avant de rendre la main : un aperçu
 * ouvert « en arrière-plan » ne finit jamais. La séance est donc arrêtée dès que son tour est fini (fin de tour, agents
 * finis, aucune commande en cours hors des serveurs, transcription immobile depuis 30 s).
 */
async function lancerSeance({ plugin, demande, temoin = null, sansScenes = false, delaiMinutes = 90, garder = false, calme = 30000 }) {
  const dossier = preparer({ plugin, temoin, sansScenes });
  const args = ["-p", demande, "--plugin-dir", plugin, "--output-format", "json", "--permission-mode", "acceptEdits",
    "--settings", JSON.stringify({ enabledPlugins: { "pulse-motion@pulse-motion": false } }), "--allowedTools", ...OUTILS];
  const debut = Date.now();
  const enfant = spawn("claude", args, { cwd: dossier, windowsHide: true, env: { ...process.env, PM_SANS_OUVRIR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  enfant.stdout.on("data", (d) => { stdout += d; });
  enfant.stderr.on("data", (d) => { stderr = (stderr + d).slice(-4000); });
  let arretee = null;
  const code = await new Promise((resoudre) => {
    let fini = false;
    const veille = setInterval(() => {
      if (fini) return;
      if (Date.now() - debut > delaiMinutes * 60000) { arretee = "délai dépassé"; arreterArbre(enfant.pid); return; }
      const d = dossierTranscriptions(dossier);
      if (!fs.existsSync(d)) return;
      const f = fs.readdirSync(d).filter((n) => n.endsWith(".jsonl")).map((n) => path.join(d, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      if (!f || Date.now() - fs.statSync(f).mtimeMs < calme || !tourFini(f) || !agentsFinis(f)) return;
      const actifs = descendants(enfant.pid).filter((p) => /node/i.test(p.nom) && /pm\.js|scripts[\\/]/.test(p.ligne) && !SERVEURS.test(p.ligne));
      if (actifs.length) return;
      arretee = "tour fini, serveurs laissés ouverts arrêtés";
      arreterArbre(enfant.pid);
    }, 5000);
    enfant.on("close", (c) => { fini = true; clearInterval(veille); resoudre(c); });
  });
  const dureeMur = (Date.now() - debut) / 1000;
  let resultat = null;
  try { resultat = JSON.parse(stdout); } catch { resultat = null; }
  arreterApercu(dossier);
  let transcription = resultat && resultat.session_id ? trouverTranscription(resultat.session_id) : null;
  if (!transcription) {
    const d = dossierTranscriptions(dossier);
    transcription = fs.existsSync(d) ? (fs.readdirSync(d).filter((n) => n.endsWith(".jsonl")).map((n) => path.join(d, n))[0] || null) : null;
  }
  const bilan = transcription ? bilanSession(transcription) : null;
  const sortie = {
    date: new Date(debut).toISOString(), plugin, demande, temoin, sansScenes, dureeMur, code, arretee,
    claude: resultat ? { session: resultat.session_id, duree: resultat.duration_ms / 1000, tours: resultat.num_turns, cout: resultat.total_cost_usd, modeles: Object.keys(resultat.modelUsage || {}), refus: resultat.permission_denials, resultat: String(resultat.result || "").slice(-1500) } : { stdout: stdout.slice(-1500), stderr: stderr.slice(-1500) },
    transcription, bilan,
    etape: (() => { try { return JSON.parse(spawnSync(process.execPath, [path.join(plugin, "scripts", "pm.js"), "etat", "."], { cwd: dossier, encoding: "utf8" }).stdout).etape; } catch { return null; } })(),
    scenesEcrites: fs.existsSync(path.join(dossier, "scenes")) ? fs.readdirSync(path.join(dossier, "scenes")).length : 0,
    dossier: garder ? dossier : null,
  };
  if (!garder) { try { fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { /* fichier encore ouvert : laissé dans le dossier temporaire */ } }
  return sortie;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (o, d) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const plugin = path.resolve(valeur("--plugin", path.join(__dirname, "..", "..", "plugins", "pulse-motion")));
  const demande = valeur("--demande");
  if (!demande) { console.error("Usage : node outils/mesures/seance.js --plugin <dossier> --demande \"<phrase>\" [--temoin <nom>] [--sans-scenes] [--sortie <fichier>]"); process.exit(2); }
  lancerSeance({ plugin, demande, temoin: valeur("--temoin", null), sansScenes: args.includes("--sans-scenes"), delaiMinutes: Number(valeur("--delai", "90")), garder: args.includes("--garder") }).then((r) => {
    const fichier = valeur("--sortie", null);
    if (fichier) { fs.mkdirSync(path.dirname(path.resolve(fichier)), { recursive: true }); fs.writeFileSync(fichier, JSON.stringify(r, null, 2)); }
    console.log(JSON.stringify({ demande: r.demande, dureeMur: r.dureeMur, code: r.code, arretee: r.arretee, etape: r.etape, scenesEcrites: r.scenesEcrites, premierePhraseS: r.bilan && r.bilan.premierePhraseS, appelsAvant: r.bilan && r.bilan.appelsAvantPremierePhrase, appelsOutils: r.bilan && r.bilan.appelsOutils, commandes: r.bilan && r.bilan.commandes, blocDeFin: r.bilan && r.bilan.blocDeFin }, null, 2));
  }, (e) => { console.error(e); process.exit(1); });
}

module.exports = { lancerSeance, preparer, trouverTranscription, tourFini, dossierTranscriptions };
