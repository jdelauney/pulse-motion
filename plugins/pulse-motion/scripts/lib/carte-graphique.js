'use strict';
/* Pulse Motion – Chrome dessine-t-il avec la carte graphique ? (spec S2, 5.18)
 *
 * sonder({ navigateur, ouvrir }) -> Promise<{ webgpu, repli, description, webgl }> : Chrome sans fenêtre, WebGPU actif
 *   (optionsChrome({ gpu: true })), adaptateur WebGPU (absent, isFallbackAdapter, description) et moteur de rendu WebGL
 *   (WEBGL_debug_renderer_info).
 * juger(brut) -> { ok, logiciel, webgpu, message } : logiciel si l'adaptateur est un repli ou si le rendu est SwiftShader,
 *   llvmpipe, softpipe ou Microsoft Basic Render.
 * sonderCarteGraphique({ navigateur, lancer, delai }) -> { ok, logiciel, webgpu, message } : la sonde dans un processus
 *   enfant synchrone (20 s au plus), pour garder l'interface synchrone d'etatOutils (scripts/outils.js).
 * Idée de lemo-opuscar (browser.mjs, warnIfSoftwareGL ; MIT), réécrite.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const LOGICIELS = /SwiftShader|llvmpipe|softpipe|Microsoft Basic Render/i;

const MESSAGES = {
  logiciel: 'Chrome dessine sans la carte graphique : les effets de particules et les shaders saccaderont dans l\'aperçu, et l\'export sera plus lent ; la vidéo exportée restera juste. Mettre à jour le pilote de la carte graphique règle souvent cela.',
  sansWebgpu: 'Ce navigateur n\'a pas WebGPU : les effets de particules ne s\'afficheront pas dans l\'aperçu ; mettre Chrome ou Edge à jour.',
  bon: 'La carte graphique est utilisée par Chrome.',
};

const SONDE = `(async function () {
  var r = { webgpu: false, repli: false, description: '', webgl: '' };
  try {
    var a = navigator.gpu && await navigator.gpu.requestAdapter();
    if (a) {
      r.webgpu = true;
      var info = a.info || (a.requestAdapterInfo ? await a.requestAdapterInfo() : {}) || {};
      r.repli = Boolean(info.isFallbackAdapter || a.isFallbackAdapter);
      r.description = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ');
    }
  } catch (e) { r.erreurWebgpu = String(e && e.message || e); }
  try {
    var c = document.createElement('canvas');
    var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (gl) {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      r.webgl = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    }
  } catch (e) { r.erreurWebgl = String(e && e.message || e); }
  return r;
})()`;

async function sonder({ navigateur, ouvrir = require('./cdp.js').ouvrirPage }) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-carte-'));
  const fichier = path.join(dossier, 'sonde.html');
  fs.writeFileSync(fichier, '<!doctype html><meta charset="utf-8"><title>Sonde</title>', 'utf8');
  const page = await ouvrir({ navigateur, largeur: 64, hauteur: 64, gpu: true, delai: 15000 });
  try {
    // Fichier local : contexte sûr, où WebGPU est exposé.
    await page.aller(pathToFileURL(fichier).href);
    return await page.evaluer(SONDE);
  } finally {
    await page.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}

function juger(brut) {
  const logiciel = Boolean(brut.repli) || LOGICIELS.test(brut.webgl || '') || LOGICIELS.test(brut.description || '');
  const webgpu = Boolean(brut.webgpu);
  if (logiciel) return { ok: false, logiciel: true, webgpu, message: MESSAGES.logiciel };
  if (!webgpu) return { ok: false, logiciel: false, webgpu: false, message: MESSAGES.sansWebgpu };
  return { ok: true, logiciel: false, webgpu: true, message: MESSAGES.bon };
}

function sonderCarteGraphique({ navigateur, lancer = spawnSync, delai = 20000 } = {}) {
  const r = lancer(process.execPath, [__filename, navigateur], { encoding: 'utf8', timeout: delai, windowsHide: true });
  let brut = null;
  try { brut = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch { brut = null; }
  if (r.error || r.status !== 0 || !brut) {
    const cause = r.error && r.error.code === 'ETIMEDOUT' ? 'pas de réponse en 20 s' : 'Chrome n\'a pas répondu';
    return { ok: false, logiciel: null, webgpu: null, message: `La carte graphique n'a pas pu être vérifiée (${cause}).` };
  }
  return juger(brut);
}

if (require.main === module) {
  sonder({ navigateur: process.argv[2] }).then((r) => { console.log(JSON.stringify(r)); process.exit(0); }, (e) => { console.error(e.message); process.exit(1); });
}

module.exports = { sonder, juger, sonderCarteGraphique, MESSAGES, LOGICIELS };
