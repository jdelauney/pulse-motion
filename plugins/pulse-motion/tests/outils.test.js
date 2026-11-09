'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { etatOutils } = require('../scripts/outils.js');
const CG = require('../scripts/lib/carte-graphique.js');

const tout = {
  trouverNavigateur: () => 'C:/chrome.exe',
  trouverFfmpeg: () => ({ present: true, versionOk: true, version: '7.1', commande: 'winget install ffmpeg' }),
  etatWhisper: () => ({ python: { commande: ['py'], version: '3.12.1' }, venv: true, modele: 'small', pret: true, message: 'prête' }),
  pythonAncien: () => null,
  voixSysteme: () => ({ ok: true, message: 'voix du système disponible' }),
  sonderCarteGraphique: () => ({ ok: true, logiciel: false, webgpu: true, message: 'La carte graphique est utilisée par Chrome.' }),
};

test('tout présent : chaque outil ok', () => {
  const e = etatOutils(tout);
  for (const k of ['node', 'navigateur', 'ffmpeg', 'python', 'transcription', 'voixSysteme']) assert.equal(e[k].ok, true, k);
  assert.equal(e.ffmpeg.version, '7.1');
  assert.equal(e.transcription.modele, 'small');
});

test('tout absent, Python trop ancien, détection qui lève : JSON complet, messages', () => {
  const e = etatOutils({
    trouverNavigateur: () => { throw new Error('boum'); },
    trouverFfmpeg: () => ({ present: false, versionOk: false, commande: 'winget install ffmpeg' }),
    etatWhisper: () => ({ python: null, venv: false, modele: null, pret: false, message: 'Python introuvable', commandeSysteme: { commande: 'winget install python', message: 'winget' } }),
    pythonAncien: () => '3.7.2',
    voixSysteme: () => ({ ok: false, message: 'installez espeak-ng (sudo apt install espeak-ng)' }),
  });
  assert.equal(e.navigateur.ok, false);
  assert.match(e.navigateur.message, /Chrome ou Edge/);
  assert.equal(e.ffmpeg.ok, false);
  assert.equal(e.ffmpeg.commande, 'winget install ffmpeg');
  assert.equal(e.python.ok, false);
  assert.equal(e.python.ancien, '3.7.2');
  assert.ok(e.python.commandeSysteme);
  assert.equal(e.transcription.ok, false);
  assert.equal(e.voixSysteme.ok, false);
});

test('une détection qui lève ne casse pas les autres', () => {
  const e = etatOutils({ ...tout, etatWhisper: () => { throw new Error('python cassé'); }, voixSysteme: () => { throw new Error('powershell absent'); } });
  assert.equal(e.ffmpeg.ok, true);
  assert.equal(e.transcription.ok, false);
  assert.equal(e.voixSysteme.ok, false);
  assert.match(e.transcription.message, /python cassé/);
});

test('pulse-motion outils : JSON, code 0 même quand des outils manquent', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), 'outils'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  const e = JSON.parse(r.stdout);
  assert.equal(e.node.ok, true);
  assert.ok('transcription' in e && 'voixSysteme' in e);
});

test('outils.test.js › carteGraphique : logiciel reconnu sur SwiftShader et llvmpipe, message en français', () => {
  const swift = CG.juger({ webgpu: true, repli: false, description: 'google swiftshader', webgl: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' });
  assert.deepEqual([swift.ok, swift.logiciel], [false, true]);
  assert.match(swift.message, /^Chrome dessine sans la carte graphique : .*pilote de la carte graphique/);
  const llvm = CG.juger({ webgpu: false, webgl: 'llvmpipe (LLVM 15.0.7, 256 bits)' });
  assert.deepEqual([llvm.ok, llvm.logiciel], [false, true]);
  assert.equal(CG.juger({ webgpu: true, repli: true, webgl: 'ANGLE (NVIDIA)' }).logiciel, true, 'adaptateur de repli');
  assert.equal(CG.juger({ webgpu: true, webgl: 'ANGLE (Microsoft, Microsoft Basic Render Driver)' }).logiciel, true);
  const sans = CG.juger({ webgpu: false, webgl: 'ANGLE (NVIDIA GeForce)' });
  assert.deepEqual([sans.ok, sans.logiciel, sans.webgpu], [false, false, false]);
  assert.match(sans.message, /n'a pas WebGPU : les effets de particules ne s'afficheront pas/);
  assert.deepEqual(CG.juger({ webgpu: true, webgl: 'ANGLE (NVIDIA GeForce RTX)' }), { ok: true, logiciel: false, webgpu: true, message: 'La carte graphique est utilisée par Chrome.' });
  // Sonde en processus enfant synchrone, délai de 20 s : une sonde muette est dite en une phrase.
  let vu = null;
  const r = CG.sonderCarteGraphique({ navigateur: 'C:/chrome.exe', lancer: (cmd, args, o) => { vu = o.timeout; return { error: { code: 'ETIMEDOUT' }, status: null, stdout: '' }; } });
  assert.equal(vu, 20000);
  assert.match(r.message, /n'a pas pu être vérifiée \(pas de réponse en 20 s\)/);
  const ok = CG.sonderCarteGraphique({ navigateur: 'x', lancer: () => ({ status: 0, stdout: JSON.stringify({ webgpu: true, webgl: 'llvmpipe' }) }) });
  assert.equal(ok.logiciel, true);
  assert.equal(etatOutils(tout).carteGraphique.ok, true);
});

test('outils.test.js › sans navigateur, carteGraphique n\'est pas sondée', () => {
  let sondee = false;
  const e = etatOutils({ ...tout, trouverNavigateur: () => null, sonderCarteGraphique: () => { sondee = true; return {}; } });
  assert.equal(e.navigateur.ok, false);
  assert.equal(e.carteGraphique, null);
  assert.equal(sondee, false);
});
