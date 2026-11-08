#!/usr/bin/env node
// Mesures Pulse Motion – description de la machine qui mesure : système, processeur, fils, mémoire, carte graphique,
// versions de Chrome (ou Edge), ffmpeg, Node et Claude Code. Chaque champ introuvable vaut null.
// Lancer : node outils/mesures/machine.js
"use strict";

const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function sortie(commande, args, options = {}) {
  const r = spawnSync(commande, args, { encoding: "utf8", windowsHide: true, timeout: 20000, ...options });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout || ""}`.trim() || null;
}

function carteGraphique() {
  if (process.platform === "win32") {
    const t = sortie("powershell", ["-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ' ; '"]);
    return t || null;
  }
  if (process.platform === "darwin") {
    const t = sortie("system_profiler", ["SPDisplaysDataType"]);
    const m = t && /Chipset Model: (.+)/.exec(t);
    return m ? m[1].trim() : null;
  }
  const t = sortie("sh", ["-c", "lspci | grep -i -E 'vga|3d'"]);
  return t || null;
}

function versionNavigateur(racinePlugin) {
  let chemin = null;
  try { chemin = require(path.join(racinePlugin, "scripts", "lib", "navigateur.js")).trouverNavigateur(); } catch { chemin = null; }
  if (!chemin) return { chemin: null, version: null };
  if (process.platform === "win32") {
    const v = sortie("powershell", ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${chemin.replace(/'/g, "''")}').VersionInfo.ProductVersion`]);
    return { chemin, version: v };
  }
  return { chemin, version: sortie(chemin, ["--version"]) };
}

/** -> { systeme, processeur, fils, memoireGo, carteGraphique, chrome, ffmpeg, node, claudeCode } */
function decrireMachine({ racinePlugin = path.join(__dirname, "..", "..", "plugins", "pulse-motion") } = {}) {
  const cpus = os.cpus();
  const ffmpeg = sortie("ffmpeg", ["-hide_banner", "-version"]);
  const claude = sortie("claude", ["--version"], { shell: process.platform === "win32" });
  return {
    systeme: `${os.type()} ${os.release()} (${os.arch()})`,
    processeur: cpus.length ? cpus[0].model.trim() : null,
    fils: cpus.length,
    memoireGo: Math.round(os.totalmem() / 1e9),
    carteGraphique: carteGraphique(),
    chrome: versionNavigateur(racinePlugin),
    ffmpeg: ffmpeg ? (/ffmpeg version (\S+)/.exec(ffmpeg) || [, ffmpeg.split("\n")[0]])[1] : null,
    node: process.version,
    claudeCode: claude ? claude.split("\n")[0] : null,
  };
}

if (require.main === module) console.log(JSON.stringify(decrireMachine(), null, 2));

module.exports = { decrireMachine };
