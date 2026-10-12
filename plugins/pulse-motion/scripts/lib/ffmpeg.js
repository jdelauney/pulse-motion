'use strict';
/* Pulse Motion – ffmpeg et ffprobe : où ils sont (PM_FFMPEG, PATH, emplacements connus de winget, scoop, Homebrew,
 * apt), leur version (4.4 au moins), et la commande qui les installe sur ce système. ffmpeg n'est jamais livré
 * avec le plugin : la personne l'installe une fois, avec son accord (skill exporter). */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MINIMUM = { majeure: 4, mineure: 4 };

/** Première ligne de « ffmpeg -version » -> { majeure, mineure } ; version git (N-…) : récente. */
function lireVersion(texte) {
  const m = /ffmpeg version (\S+)/.exec(String(texte));
  if (!m) return null;
  if (/^N-/.test(m[1])) return { majeure: 99, mineure: 0 };
  const v = /^n?(\d+)\.(\d+)/.exec(m[1]);
  return v ? { majeure: Number(v[1]), mineure: Number(v[2]) } : null;
}

function commandeInstallation({ plateforme = process.platform, existe = fs.existsSync } = {}) {
  if (plateforme === 'win32') return 'winget install --id Gyan.FFmpeg -e';
  if (plateforme === 'darwin') return 'brew install ffmpeg';
  if (existe('/usr/bin/apt')) return 'sudo apt install ffmpeg';
  if (existe('/usr/bin/dnf')) return 'sudo dnf install ffmpeg';
  if (existe('/usr/bin/pacman')) return 'sudo pacman -S ffmpeg';
  return 'installer le paquet « ffmpeg » avec le gestionnaire de paquets du système';
}

function emplacements(env, plateforme) {
  const exe = plateforme === 'win32' ? '.exe' : '';
  const dossiers = [];
  if (env.PM_FFMPEG) {
    const v = env.PM_FFMPEG;
    dossiers.push(/ffmpeg(\.exe)?$/i.test(v) ? path.dirname(v) : v);
  }
  const separateur = plateforme === 'win32' ? ';' : ':';
  for (const d of String(env.PATH || env.Path || '').split(separateur)) if (d) dossiers.push(d);
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

/** -> { present, chemin, cheminProbe, version, versionOk, installer, message } */
function trouverFfmpeg({ env = process.env, plateforme = process.platform, existe = fs.existsSync, executer = executerParDefaut } = {}) {
  const installer = commandeInstallation({ plateforme, existe });
  const absent = (message) => ({ present: false, chemin: null, cheminProbe: null, version: null, versionOk: false, installer, message });
  let sansProbe = null;
  for (const e of emplacements(env, plateforme)) {
    if (!existe(e.ffmpeg)) continue;
    if (!existe(e.ffprobe)) { sansProbe = sansProbe || e.ffmpeg; continue; }
    let sortie;
    try { sortie = executer(e.ffmpeg, ['-version']); } catch { continue; }
    const v = lireVersion(sortie);
    if (!v) continue;
    const versionOk = v.majeure > MINIMUM.majeure || (v.majeure === MINIMUM.majeure && v.mineure >= MINIMUM.mineure);
    const version = `${v.majeure}.${v.mineure}`;
    return {
      present: true, chemin: e.ffmpeg, cheminProbe: e.ffprobe, version, versionOk, installer,
      message: versionOk ? `ffmpeg ${version} est prêt pour l'export fidèle.`
        : `ffmpeg ${version} est trop ancien : il faut la version 4.4 ou plus récente (« ${installer} »).`,
    };
  }
  if (sansProbe) return absent(`ffmpeg est là (${sansProbe}) mais pas ffprobe, qui l'accompagne d'habitude : réinstaller ffmpeg (« ${installer} »).`);
  return absent(`ffmpeg n'est pas installé : l'export fidèle en a besoin (« ${installer} »). Sans lui, la vidéo s'exporte dans le navigateur.`);
}

module.exports = { lireVersion, commandeInstallation, trouverFfmpeg, MINIMUM };
