'use strict';
/* Trouve Chrome ou Edge et rend une page en mode sans fenêtre (tests seulement). */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
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

function trouverNavigateur() {
  if (process.env.PM_NAVIGATEUR) return process.env.PM_NAVIGATEUR;
  return (CANDIDATS[process.platform] || []).find((p) => fs.existsSync(p)) || null;
}

/** Charge un fichier HTML ou une URL ; -> Promise du DOM après exécution des scripts. */
function rendreDOM(navigateur, cible) {
  const url = /^https?:/.test(cible) ? cible : pathToFileURL(path.resolve(cible)).href;
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-chrome-'));
  return new Promise((resolve, reject) => {
    execFile(navigateur, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profil}`, '--allow-file-access-from-files',
      '--virtual-time-budget=5000', '--dump-dom', url,
    ], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26 }, (erreur, sortie) => {
      fs.rmSync(profil, { recursive: true, force: true });
      if (erreur) reject(erreur); else resolve(sortie);
    });
  });
}

module.exports = { trouverNavigateur, rendreDOM };
