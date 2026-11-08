'use strict';
// Les trois enveloppes de bin/ (sh, invite de commandes, PowerShell) : Node absent, un message en français que les
// compétences reconnaissent (blocs injectés au lancement, spec Rapidité § 5.5) ; Node présent, la commande passe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { dossierTemporaire } = require('./aide/temporaire.js');

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

// Environnement sans Node : seul le dossier des outils du système (ou un dossier vide) reste dans le PATH.
const sansNode = (dossier) => (WINDOWS ? { PATH: SYSTEME, SystemRoot: process.env.SystemRoot, PATHEXT: '.COM;.EXE;.BAT;.CMD' } : { PATH: dossier });

function lancer(enveloppe, args, env, cwd) {
  const f = path.join(BIN, enveloppe);
  if (enveloppe.endsWith('.cmd')) {
    return spawnSync(path.join(SYSTEME, 'cmd.exe'), ['/d', '/s', '/c', `""${f}" ${args.join(' ')}"`], { windowsVerbatimArguments: true, env, cwd, encoding: 'utf8' });
  }
  if (enveloppe.endsWith('.ps1')) {
    return spawnSync(path.join(SYSTEME, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f, ...args], { env, cwd, encoding: 'utf8' });
  }
  return spawnSync(trouverSh(), [f, ...args], { env, cwd, encoding: 'utf8' });
}

const CAS = [
  { enveloppe: 'pulse-motion', skip: !trouverSh() && 'sh introuvable' },
  { enveloppe: 'pulse-motion.cmd', skip: !WINDOWS && 'Windows seulement' },
  { enveloppe: 'pulse-motion.ps1', skip: (!WINDOWS || !fs.existsSync(path.join(SYSTEME || '', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))) && 'Windows PowerShell absent' },
];

for (const { enveloppe, skip } of CAS) {
  test(`wrapper-node-absent-message-francais : ${enveloppe}`, { skip }, () => {
    const dossier = dossierTemporaire('pm-enveloppe-');
    const absent = lancer(enveloppe, ['etat', '.'], sansNode(dossier), dossier);
    assert.equal(absent.status, 1, absent.stderr);
    assert.equal(absent.stdout.trim(), MESSAGE);
    // Node présent : la commande passe et répond en JSON.
    const present = lancer(enveloppe, ['etat', '.'], process.env, dossier);
    assert.equal(present.status, 0, present.stderr);
    assert.equal(JSON.parse(present.stdout).projet, false);
  });
}

test('wrapper-node-absent-message-francais : le message est celui que les compétences reconnaissent', () => {
  for (const s of ['reprendre', 'retoucher', 'exporter']) {
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'skills', s, 'SKILL.md'), 'utf8'), /« Node\.js introuvable »/, s);
  }
});
