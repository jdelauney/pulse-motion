#!/usr/bin/env node
// Pulse Motion – porte de publication, à passer avant chaque envoi : dans les fichiers suivis par git, aucun chemin de cet
// ordinateur (le dossier personnel, le dossier qui contient le dépôt) ni secret (clé privée, jeton d'un service). Les chemins
// d'exemple des pages (« C:\Users\Marie\… ») passent : seuls ceux de l'ordinateur qui lance la porte sont refusés.
// Tous les fichiers suivis sont examinés ; les réglages de Claude Code du mainteneur (.claude/settings.json) ne sont pas suivis.
// Idée de Lemo-Opuscar (tools/release.py : LOCAL_PATH, SECRET ; MIT), réécrite.
// Lancer : node outils/publication/porte.js   (code 1 et la liste des problèmes si un fichier en a)
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

/** Secrets reconnus : [nom, motif]. Des formes publiques et stables, pour ne rien signaler à tort. */
const SECRETS = [
  ["clé privée", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ["jeton GitHub", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["clé Anthropic", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["clé OpenAI", /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/],
  ["clé AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["jeton Slack", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["clé Google", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["jeton GitLab", /\bglpat-[A-Za-z0-9_-]{20,}\b/],
];

/** Dossiers exclus de l'examen (relatifs à la racine, en /). Aucun : les réglages de Claude Code du mainteneur
 *  (.claude/settings.json) ne sont plus suivis par git, et tout fichier suivi est examiné. */
const EXCLUS = [];
const TAILLE_MAX = 2 * 1024 * 1024;

/** Dossiers communs à tous les ordinateurs : seuls, ils ne disent rien de celui-ci. */
const GENERIQUES = new Set(["users", "home", "program files", "program files (x86)", "windows", "tmp", "temp", "var", "opt", "usr", "documents"]);

const echapper =(t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Motif d'un chemin de l'ordinateur, quelle que soit son écriture (« \ », « / », « \\ » échappé dans du JSON), sans casse.
 * null si le chemin est trop court pour être propre à cet ordinateur (« C:\ », « C:\Users », « /home ») ; un lecteur et un
 * dossier qui n'est pas commun suffisent (« E:\Projets »).
 */
function motifChemin(chemin) {
  const segments = String(chemin).split(/[\\/]+/).filter(Boolean);
  const lecteur = segments.length > 0 && /^[A-Za-z]:$/.test(segments[0]);
  const utiles = segments.filter((s) => !/^[A-Za-z]:$/.test(s));
  const propre = utiles.length >= 2 || (lecteur && utiles.length === 1 && !GENERIQUES.has(utiles[0].toLowerCase()));
  if (!propre) return null;
  return new RegExp(`${segments.map(echapper).join("[\\\\/]+")}(?![A-Za-z0-9_-])`, "i");
}

/** Racine du dépôt principal (celle d'un worktree est rapportée au dépôt qui le porte). */
function racinePrincipale(racine) {
  try {
    const commun = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: racine, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return path.dirname(path.resolve(commun));
  } catch {
    return path.resolve(racine);
  }
}

/** « D:\Atelier » s'écrit aussi « /d/Atelier » dans Git Bash et MSYS (et « /mnt/d/Atelier » sous WSL). */
function formesPosix(chemin) {
  const m = /^([A-Za-z]):[\\/]+(.*)$/.exec(String(chemin));
  if (!m) return [];
  const reste = m[2].replace(/\\/g, "/");
  return [`/${m[1].toLowerCase()}/${reste}`, `/mnt/${m[1].toLowerCase()}/${reste}`];
}

/** Chemins propres à cet ordinateur : le dossier personnel et le dossier qui contient le dépôt, sous leurs écritures
 *  Windows et Git Bash. -> [{ chemin, motif }] */
function cheminsLocaux({ racine, accueil = os.homedir() }) {
  const base = [accueil, path.dirname(racinePrincipale(racine))].filter(Boolean);
  const chemins = [...base, ...base.flatMap(formesPosix)];
  return [...new Set(chemins)].map((chemin) => ({ chemin, motif: motifChemin(chemin) })).filter((c) => c.motif);
}

/** Problèmes d'un texte : [{ ligne, sorte: "chemin" | "secret", nom }]. */
function examinerTexte(texte, chemins) {
  const problemes = [];
  texte.split(/\r?\n/).forEach((l, i) => {
    for (const c of chemins) if (c.motif.test(l)) problemes.push({ ligne: i + 1, sorte: "chemin", nom: c.chemin });
    for (const [nom, motif] of SECRETS) if (motif.test(l)) problemes.push({ ligne: i + 1, sorte: "secret", nom });
  });
  return problemes;
}

/** Fichiers suivis par git (relatifs, en /), hors exclus. */
function fichiersSuivis(racine) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: racine, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean)
    .filter((f) => !EXCLUS.some((x) => f.startsWith(x)));
}

/**
 * Examine les fichiers (tous les fichiers suivis par défaut) ; les fichiers binaires, absents ou trop gros sont sautés.
 * -> [{ fichier, ligne, sorte, nom }]
 */
function verifierDepot(racine, { accueil = os.homedir(), fichiers = fichiersSuivis(racine) } = {}) {
  const chemins = cheminsLocaux({ racine, accueil });
  const problemes = [];
  for (const f of fichiers) {
    const complet = path.join(racine, f);
    let octets;
    try {
      const st = fs.statSync(complet);
      if (!st.isFile() || st.size > TAILLE_MAX) continue;
      octets = fs.readFileSync(complet);
    } catch { continue; }
    if (octets.subarray(0, 8000).includes(0)) continue; // binaire
    for (const p of examinerTexte(octets.toString("utf8"), chemins)) problemes.push({ fichier: f, ...p });
  }
  return problemes;
}

/** Une ligne lisible par problème (sans recopier le secret). */
const decrire = (p) => `${p.fichier}:${p.ligne} : ${p.sorte === "chemin" ? `chemin de cet ordinateur (${p.nom})` : p.nom}`;

if (require.main === module) {
  const racine = path.join(__dirname, "..", "..");
  try {
    const problemes = verifierDepot(racine);
    if (problemes.length) {
      console.error(`Porte de publication : ${problemes.length} problème${problemes.length > 1 ? "s" : ""} à corriger avant d'envoyer.\n  ${problemes.map(decrire).join("\n  ")}`);
      process.exit(1);
    }
    console.log("Porte de publication : aucun chemin de cet ordinateur ni secret dans les fichiers suivis.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { SECRETS, motifChemin, cheminsLocaux, examinerTexte, verifierDepot, fichiersSuivis, racinePrincipale, decrire };
