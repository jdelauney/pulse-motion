'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { execFileSync } = require('node:child_process');
const { copierProjet } = require('./aide/projet.js');

const RAPPEL = path.join(__dirname, '..', 'scripts', 'rappel.js');
const lancer = (entree) => execFileSync(process.execPath, [RAPPEL], { input: JSON.stringify(entree), encoding: 'utf8' });

test('vidéo en cours : contexte ajouté avec le titre, l\'étape et /pulse-motion:reprendre', () => {
  const dir = copierProjet('projet-simple');
  const sortie = JSON.parse(lancer({ cwd: dir, hook_event_name: 'SessionStart' }));
  assert.equal(sortie.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(sortie.hookSpecificOutput.additionalContext, /« La chaîne du froid » \(étape : deroule-a-valider\).*\/pulse-motion:reprendre/);
});

test('dossier sans vidéo : rien n\'est écrit', () => {
  const dir = dossierTemporaire('pm-vide-');
  assert.equal(lancer({ cwd: dir }), '');
});

test('entrée illisible : pas de plantage', () => {
  const sortie = execFileSync(process.execPath, [RAPPEL], { input: 'pas du json', encoding: 'utf8', cwd: os.tmpdir() });
  assert.equal(typeof sortie, 'string');
});

test('hooks.json : SessionStart lance le rappel par node, et par le relais sh quand Node manque (Node cherché aussi hors du PATH, spec S4 5.6)', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
  const [h, s] = hooks.hooks.SessionStart[0].hooks;
  // Le rappel ordinaire ne dépend pas d'un sh visible (Windows) ; le second crochet ne parle que si Node manque.
  assert.equal(h.command, 'node');
  assert.deepEqual(h.args, ['${CLAUDE_PLUGIN_ROOT}/scripts/rappel.js']);
  assert.equal(s.command, 'sh');
  assert.deepEqual(s.args, ['${CLAUDE_PLUGIN_ROOT}/bin/pulse-motion', 'rappel-node']);
  // pulse-motion rappel lance scripts/rappel.js avec l'entrée du crochet.
  const r = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), 'rappel'], { input: JSON.stringify({ cwd: copierProjet('projet-simple') }), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /\/pulse-motion:reprendre/);
});
