'use strict';
// Les trois enveloppes de bin/ (sh, invite de commandes, PowerShell) : Node absent, un message en français que les
// compétences reconnaissent (blocs injectés au lancement, spec Rapidité § 5.5) et le code 3 ; Node présent, la commande
// passe ; Node hors du PATH, à un emplacement connu, trouvé quand même (spec Retouches et ergonomie, 5.6 point 1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { copierProjet } = require('./aide/projet.js');
const copierVideo = () => copierProjet('projet-simple');

const BIN = path.join(__dirname, '..', 'bin');
const MESSAGE = 'Node.js introuvable : « node » n\'est pas installé.';
const WINDOWS = process.platform === 'win32';
const SYSTEME = WINDOWS ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : null;

/** sh : celui du système, ou celui de Git pour Windows. */
function trouverSh() {
  if (!WINDOWS) return fs.existsSync('/bin/sh') ? '/bin/sh' : null;
  const candidats = [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'sh.exe'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'sh.exe')];
  return candidats.find((c) => fs.existsSync(c)) || null;
}

// Environnement sans Node : seul le dossier des outils du système (ou un dossier vide) reste dans le PATH ; les emplacements
// connus sont remplacés par un chemin absent (une machine d'intégration a souvent /usr/local/bin/node).
const sansNode = (dossier, emplacements = path.join(dossier, 'absent', 'node')) => ({
  ...(WINDOWS ? { PATH: SYSTEME, SystemRoot: process.env.SystemRoot, PATHEXT: '.COM;.EXE;.BAT;.CMD' } : { PATH: dossier }),
  PM_NODE_EMPLACEMENTS: emplacements,
});

function lancer(enveloppe, args, env, cwd, entree) {
  const f = path.join(BIN, enveloppe);
  const options = { env, cwd, encoding: 'utf8', ...(entree !== undefined ? { input: entree } : {}) };
  if (enveloppe.endsWith('.cmd')) {
    return spawnSync(path.join(SYSTEME, 'cmd.exe'), ['/d', '/s', '/c', `""${f}" ${args.join(' ')}"`], { ...options, windowsVerbatimArguments: true });
  }
  if (enveloppe.endsWith('.ps1')) {
    return spawnSync(path.join(SYSTEME, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f, ...args], options);
  }
  return spawnSync(trouverSh(), [f, ...args], options);
}

/** Un « node » à un emplacement connu simulé, hors du PATH : un relais vers le vrai pour sh, une copie (ou un lien dur) de
 *  node.exe pour l'invite de commandes et PowerShell. -> chemin */
function nodeSimule(dossier, enveloppe) {
  if (enveloppe === 'pulse-motion') {
    const f = path.join(dossier, '.nvm', 'versions', 'node', 'v22.1.0', 'bin', 'node');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `#!/bin/sh\nexec "${process.execPath.replace(/\\/g, '/')}" "$@"\n`, { mode: 0o755 });
    return f;
  }
  const f = path.join(dossier, 'Programs', 'nodejs', 'node.exe');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  try { fs.linkSync(process.execPath, f); } catch { fs.copyFileSync(process.execPath, f); }
  return f;
}

const CAS = [
  { enveloppe: 'pulse-motion', skip: !trouverSh() && 'sh introuvable' },
  { enveloppe: 'pulse-motion.cmd', skip: !WINDOWS && 'Windows seulement' },
  { enveloppe: 'pulse-motion.ps1', skip: (!WINDOWS || !fs.existsSync(path.join(SYSTEME || '', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))) && 'Windows PowerShell absent' },
];

for (const { enveloppe, skip } of CAS) {
  test(`relais : sans Node, message en français et code 3 : ${enveloppe}`, { skip }, () => {
    const dossier = dossierTemporaire('pm-enveloppe-');
    const absent = lancer(enveloppe, ['etat', '.'], sansNode(dossier), dossier);
    assert.equal(absent.status, 3, absent.stderr);
    assert.equal(absent.stdout.trim(), MESSAGE);
    // Node présent : la commande passe et répond en JSON.
    const present = lancer(enveloppe, ['etat', '.'], process.env, dossier);
    assert.equal(present.status, 0, present.stderr);
    assert.equal(JSON.parse(present.stdout).projet, false);
  });

  test(`relais : Node trouvé hors du PATH (emplacement connu simulé) : ${enveloppe}`, { skip }, () => {
    const dossier = dossierTemporaire('pm-enveloppe-');
    const node = nodeSimule(dossier, enveloppe);
    const r = lancer(enveloppe, ['etat', '.'], sansNode(dossier, `${path.join(dossier, 'rien', 'node')};${node}`), dossier);
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).projet, false);
  });
}

test('relais : les emplacements connus sont ceux de la spec (Program Files, AppData, Homebrew, /usr/local, nvm)', () => {
  const sh = fs.readFileSync(path.join(BIN, 'pulse-motion'), 'utf8');
  for (const e of ['/opt/homebrew/bin/node', '/usr/local/bin/node', '.nvm/versions/node/v*/bin/node', '$ProgramFiles/nodejs/node.exe', '$LOCALAPPDATA/Programs/nodejs/node.exe']) assert.ok(sh.includes(e), `sh : ${e}`);
  for (const f of ['pulse-motion.cmd', 'pulse-motion.ps1']) {
    const t = fs.readFileSync(path.join(BIN, f), 'utf8');
    assert.match(t, /ProgramFiles%?\\nodejs\\node\.exe/, f);
    assert.match(t, /LOCALAPPDATA%?\\Programs\\nodejs\\node\.exe/, f);
    assert.match(t, /exit (\/b )?3/, f);
  }
  assert.match(sh, /exit 3/);
});

test('rappel : Node absent, consigne d\'installation pour Claude', { skip: !trouverSh() && 'sh introuvable' }, () => {
  const dossier = dossierTemporaire('pm-enveloppe-');
  const r = lancer('pulse-motion', ['rappel'], sansNode(dossier), dossier, JSON.stringify({ cwd: dossier }));
  assert.equal(r.status, 0, r.stderr);
  const sortie = JSON.parse(r.stdout);
  assert.equal(sortie.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(sortie.hookSpecificOutput.additionalContext, /Node\.js manque[^"]*proposer de l'installer avec l'accord de la personne/);
  // Node présent : le rappel ordinaire (dossier sans vidéo : rien).
  const present = lancer('pulse-motion', ['rappel'], process.env, dossier, JSON.stringify({ cwd: dossier }));
  assert.equal(present.status, 0, present.stderr);
  assert.equal(present.stdout, '');
  // Second crochet (rappel-node) : la même consigne sans Node ; rien quand Node est là (le premier crochet fait le rappel).
  const second = lancer('pulse-motion', ['rappel-node'], sansNode(dossier), dossier, '{}');
  assert.equal(second.status, 0, second.stderr);
  assert.match(JSON.parse(second.stdout).hookSpecificOutput.additionalContext, /Node\.js manque/);
  const muet = lancer('pulse-motion', ['rappel-node'], process.env, dossier, JSON.stringify({ cwd: copierVideo() }));
  assert.equal(muet.status, 0, muet.stderr);
  assert.equal(muet.stdout, '');
});

test('wrapper-node-absent-message-francais : le message est celui que les compétences reconnaissent', () => {
  for (const s of ['reprendre', 'retoucher', 'exporter']) {
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'skills', s, 'SKILL.md'), 'utf8'), /« Node\.js introuvable »/, s);
  }
});
