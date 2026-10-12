'use strict';
/* Pulse Motion – trouve Chrome ou Edge et le lance sans fenêtre (export, planche, tests). */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const CANDIDATS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
};

/** Chemin de Chrome ou Edge (variable PM_NAVIGATEUR prioritaire), ou null. */
function trouverNavigateur() {
  if (process.env.PM_NAVIGATEUR) return process.env.PM_NAVIGATEUR;
  return (CANDIDATS[process.platform] || []).find((p) => fs.existsSync(p)) || null;
}

const OPTIONS = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars'];

/** Options de Chrome sans fenêtre ; gpu : WebGPU actif (vidéos avec effets de particules). */
function optionsChrome({ gpu = false } = {}) {
  if (!gpu) return OPTIONS.slice();
  const supplementaires = process.env.PM_OPTIONS_WEBGPU ? process.env.PM_OPTIONS_WEBGPU.split(/\s+/).filter(Boolean) : ['--enable-unsafe-webgpu'];
  return [...OPTIONS.filter((o) => o !== '--disable-gpu'), ...supplementaires];
}

/** Charge un fichier HTML ou une URL ; -> Promise du DOM après exécution des scripts. delai : en millisecondes. */
function rendreDOM(navigateur, cible, { delai = 60000 } = {}) {
  const url = /^https?:/.test(cible) ? cible : pathToFileURL(path.resolve(cible)).href;
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-chrome-'));
  return new Promise((resolve, reject) => {
    execFile(navigateur, [
      ...OPTIONS, `--user-data-dir=${profil}`, '--allow-file-access-from-files',
      '--virtual-time-budget=5000', '--dump-dom', url,
    ], { encoding: 'utf8', timeout: delai, maxBuffer: 1 << 26 }, (erreur, sortie) => {
      fs.rmSync(profil, { recursive: true, force: true });
      if (erreur) reject(erreur); else resolve(sortie);
    });
  });
}

/** Ouvre une URL sans fenêtre, en temps réel (gpu : WebGPU actif). -> { aQuitte(), fermer() } */
function ouvrirSansFenetre(navigateur, url, { gpu = false } = {}) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-chrome-'));
  const processus = spawn(navigateur, [...optionsChrome({ gpu }), `--user-data-dir=${profil}`, '--window-size=1280,800', url], { stdio: 'ignore' });
  let quitte = false;
  processus.on('error', () => { quitte = true; });
  processus.on('exit', () => { quitte = true; });
  return {
    /** Vrai si le navigateur s'est arrêté (plantage, lancement impossible). */
    aQuitte: () => quitte,
    fermer() {
      return new Promise((resolve) => {
        const fin = () => {
          // Chrome peut garder le profil verrouillé quelques instants après sa fermeture.
          setTimeout(() => { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); resolve(); }, 200);
        };
        if (quitte || processus.exitCode !== null) return fin();
        processus.once('exit', fin);
        processus.kill();
      });
    },
  };
}

module.exports = { trouverNavigateur, optionsChrome, rendreDOM, ouvrirSansFenetre };
