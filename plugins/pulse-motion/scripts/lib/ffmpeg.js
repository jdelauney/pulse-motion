'use strict';
/* Pulse Motion – ffmpeg et ffprobe : où ils sont (PM_FFMPEG, PATH, emplacements connus de winget, scoop, Homebrew,
 * apt), leur version (4.4 au moins), et la commande qui les installe sur ce système. ffmpeg n'est jamais livré
 * avec le plugin : la personne l'installe une fois, avec son accord (skill exporter). Seuls les dossiers absolus
 * du PATH sont lus : un dossier de projet ne peut pas fournir son propre ffmpeg. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MINIMUM = { majeure: 4, mineure: 4 };
const RECENTE = { majeure: 99, mineure: 0 };

/** Première ligne de « ffmpeg -version » -> { majeure, mineure } ; versions git (N-…, git-…, AAAA-MM-JJ-git-…) : récentes. */
function lireVersion(texte) {
  const m = /ffmpeg version (\S+)/.exec(String(texte));
  if (!m) return null;
  if (/^(N-|git-|\d{4}-\d{2}-\d{2}-git-)/.test(m[1])) return RECENTE;
  const v = /^n?(\d+)\.(\d+)/.exec(m[1]);
  return v ? { majeure: Number(v[1]), mineure: Number(v[2]) } : null;
}

/** Commande sûre à lancer pour installer ffmpeg sur ce système, ou null s'il n'y en a pas de connue. */
function commandeSure({ plateforme = process.platform, existe = fs.existsSync } = {}) {
  if (plateforme === 'win32') return 'winget install --id Gyan.FFmpeg -e';
  if (plateforme === 'darwin') return 'brew install ffmpeg';
  if (existe('/usr/bin/apt')) return 'sudo apt install ffmpeg';
  if (existe('/usr/bin/dnf')) return 'sudo dnf install ffmpeg';
  if (existe('/usr/bin/pacman')) return 'sudo pacman -S ffmpeg';
  return null;
}

/** Texte d'installation à montrer : la commande, ou une phrase si aucune commande n'est connue. */
function commandeInstallation(options = {}) {
  return commandeSure(options) || 'installer le paquet ffmpeg avec le gestionnaire de paquets du système';
}

function emplacements(env, plateforme) {
  const exe = plateforme === 'win32' ? '.exe' : '';
  const chemins = plateforme === 'win32' ? path.win32 : path.posix;
  const dossiers = [];
  if (env.PM_FFMPEG) {
    const v = env.PM_FFMPEG.replace(/^"(.*)"$/, '$1');
    dossiers.push(/ffmpeg(\.exe)?$/i.test(v) ? path.dirname(v) : v);
  }
  const separateur = plateforme === 'win32' ? ';' : ':';
  for (const brut of String(env.PATH || env.Path || '').split(separateur)) {
    const d = brut.trim().replace(/^"(.*)"$/, '$1');
    if (d && chemins.isAbsolute(d)) dossiers.push(d);
  }
  if (plateforme === 'win32') {
    if (env.LOCALAPPDATA) dossiers.push(path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
    if (env.USERPROFILE) dossiers.push(path.join(env.USERPROFILE, 'scoop', 'shims'));
    dossiers.push('C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin');
  } else if (plateforme === 'darwin') {
    dossiers.push('/opt/homebrew/bin', '/usr/local/bin');
  } else {
    dossiers.push('/usr/bin', '/usr/local/bin', '/snap/bin');
  }
  return dossiers.map((d) => ({ ffmpeg: path.normalize(path.join(d, `ffmpeg${exe}`)), ffprobe: path.normalize(path.join(d, `ffprobe${exe}`)) }));
}

const executerParDefaut = (chemin, args) => execFileSync(chemin, args, { encoding: 'utf8', timeout: 15000, windowsHide: true });
const suffisante = (v) => v.majeure > MINIMUM.majeure || (v.majeure === MINIMUM.majeure && v.mineure >= MINIMUM.mineure);

/** -> { present, chemin, cheminProbe, version, versionOk, commande, installer, message } */
function trouverFfmpeg({ env = process.env, plateforme = process.platform, existe = fs.existsSync, executer = executerParDefaut } = {}) {
  const commande = commandeSure({ plateforme, existe });
  const installer = commandeInstallation({ plateforme, existe });
  const conseil = commande ? `« ${commande} »` : installer;
  const absent = (message) => ({ present: false, chemin: null, cheminProbe: null, version: null, versionOk: false, commande, installer, message });
  let sansProbe = null;
  let ancien = null;
  for (const e of emplacements(env, plateforme)) {
    if (!existe(e.ffmpeg)) continue;
    if (!existe(e.ffprobe)) { sansProbe = sansProbe || e.ffmpeg; continue; }
    let sortie;
    try { sortie = executer(e.ffmpeg, ['-version']); } catch { continue; }
    if (!/ffmpeg version/.test(String(sortie))) continue;
    // Version illisible : gardée, supposée récente (ffmpeg dira lui-même s'il ne sait pas faire).
    const v = lireVersion(sortie);
    const version = v ? (v === RECENTE ? 'récente' : `${v.majeure}.${v.mineure}`) : 'inconnue';
    const trouve = { present: true, chemin: e.ffmpeg, cheminProbe: e.ffprobe, version, commande, installer };
    if (!v || suffisante(v)) return { ...trouve, versionOk: true, message: `ffmpeg ${version === 'inconnue' ? '(version inconnue)' : version} est prêt pour l'export fidèle.` };
    // Trop ancien : gardé en réserve, un plus récent peut suivre (winget, scoop…).
    ancien = ancien || { ...trouve, versionOk: false, message: `ffmpeg ${version} est trop ancien : il faut la version 4.4 ou plus récente (${conseil}).` };
  }
  if (ancien) return ancien;
  if (sansProbe) return absent(`ffmpeg est là (${sansProbe}) mais pas ffprobe, qui l'accompagne d'habitude : réinstaller ffmpeg (${conseil}).`);
  return absent(`ffmpeg n'est pas installé : l'export fidèle en a besoin (${conseil}). Sans lui, la vidéo s'exporte dans le navigateur.`);
}

module.exports = { lireVersion, commandeSure, commandeInstallation, trouverFfmpeg, MINIMUM };
