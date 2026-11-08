'use strict';
/* Contrôle immédiat de chaque scène écrite (spec Rapidité 5.11) : crochet PostToolUse du plugin. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { repondre } = require('../scripts/controle-scene.js');
const { controlerScene, sceneDuFichier } = require('../scripts/lib/controle-scene.js');
const { controlesRapides } = require('../scripts/controler.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const CROCHET = path.join(__dirname, '..', 'scripts', 'controle-scene.js');
const lancer = (evenement) => spawnSync(process.execPath, [CROCHET], { input: JSON.stringify(evenement), encoding: 'utf8' });

const REGLES = ['scene-invalide', 'texte-manquant', 'start-invalide', 'dur-invalide', 'reference-inconnue', 'reference-circulaire', 'tempo-absent',
  'ancre-mot-introuvable', 'son-inconnu', 'texte-petit', 'police-non-embarquee', 'effet-export', 'lettres-invalide', 'ressource-distante', 'ancre-introuvable'];

/** Scène aux défauts connus, une règle par ligne. */
const SCENE_FAUTIVE = `<section data-scene="intro" class="fond">
  <style>@scope { h1 { font-family: "Comic Sans MS"; } .petit { font-size: 1cqh; } .fusion { mix-blend-mode: multiply; } .fond-net { background: url("https://exemple.fr/fond.png"); } }</style>
  <h1 id="titre" data-texte="titre" data-start="0.3" data-lettres="tourbillon">Titre</h1>
  <p data-texte="sous" data-start="#absent+0.2">…</p>
  <p class="petit" data-texte="inconnue" data-dur="longtemps">x</p>
  <img src="https://exemple.fr/photo.png" alt="Photo" data-start="1" data-son="clochette-magique">
  <div data-effet="etincelles" data-ancre="#rien" data-start="1" data-dur="1"></div>
</section>`;

function projetFautif() {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), SCENE_FAUTIVE);
  return dir;
}

test('controle-scene-ignore-hors-projet : rien, sans sortie, pour un fichier qui n\'est pas une scène', () => {
  const vide = dossierTemporaire('pm-crochet-');
  fs.mkdirSync(path.join(vide, 'scenes'));
  fs.writeFileSync(path.join(vide, 'scenes', '01-x.html'), '<section data-scene="x"><p style="font-family: Arial">x</p></section>');
  const dir = copierProjet('projet-simple');
  const cas = [
    { tool_name: 'Write', tool_input: { file_path: path.join(vide, 'scenes', '01-x.html') }, cwd: vide },   // pas de deroule.json
    { tool_name: 'Write', tool_input: { file_path: path.join(dir, 'deroule.json') }, cwd: dir },            // pas une scène
    { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'assets', 'logo.svg') }, cwd: dir },
    { tool_name: 'Write', tool_input: { file_path: path.join(dir, 'scenes', '09-inconnue.html') }, cwd: dir }, // absente du déroulé
    { tool_name: 'Write', tool_input: {} },
  ];
  for (const e of cas) {
    const debut = process.hrtime.bigint();
    assert.equal(repondre(e), null, JSON.stringify(e));
    const ms = Number(process.hrtime.bigint() - debut) / 1e6;
    assert.ok(ms < 100, `${ms} ms`);
  }
  const r = lancer(cas[1]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  const illisible = spawnSync(process.execPath, [CROCHET], { input: 'pas du JSON', encoding: 'utf8' });
  assert.equal(illisible.status, 0);
  assert.equal(illisible.stdout, '');
});

test('controle-scene-memes-regles-que-le-controle : mêmes problèmes que les contrôles rapides sur la scène', () => {
  const dir = projetFautif();
  const { deroule } = lireDeroule(dir);
  const crochet = controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html: SCENE_FAUTIVE });
  const rapides = controlesRapides({ projet: dir, dossierStyles: STYLES }).problemes
    .filter((p) => p.scene === 'intro' && REGLES.includes(p.regle));
  const vus = (liste) => liste.map((p) => `${p.regle}|${p.gravite}|${p.message}`).sort();
  assert.deepEqual(vus(crochet), vus(rapides));
  const regles = new Set(crochet.map((p) => p.regle));
  for (const r of ['texte-manquant', 'reference-inconnue', 'dur-invalide', 'son-inconnu', 'texte-petit', 'police-non-embarquee', 'effet-export', 'lettres-invalide', 'ressource-distante', 'ancre-introuvable']) {
    assert.ok(regles.has(r), `${r} : ${JSON.stringify(crochet)}`);
  }
  // Une scène juste : rien.
  const juste = copierProjet('projet-simple');
  const d2 = lireDeroule(juste).deroule;
  assert.deepEqual(controlerScene({ projet: juste, deroule: d2, scene: d2.scenes[1], html: fs.readFileSync(path.join(juste, 'scenes', '02-chiffre.html'), 'utf8') }), []);
});

test('controle-scene-sortie-retroaction : decision « block », une ligne par problème, code 0 ; scène juste : rien', () => {
  const dir = projetFautif();
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  assert.equal(sceneDuFichier(fichier).scene.id, 'intro');
  const r = lancer({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: fichier }, cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const sortie = JSON.parse(r.stdout);
  assert.equal(sortie.decision, 'block');
  assert.match(sortie.reason, /^Contrôle de la scène « intro » \(01-intro\.html\) :\n/);
  assert.match(sortie.reason, /- Erreur \(son-inconnu\) : Scène « intro » : le son « clochette-magique » n'existe pas/);
  assert.match(sortie.reason, /- Alerte \(effet-export\) :/);
  assert.match(sortie.reason, /Corriger la scène maintenant\.$/);
  // Chemin relatif au dossier de travail, et casse différente sous Windows.
  const relatif = repondre({ tool_input: { file_path: path.join('scenes', '01-intro.html') }, cwd: dir });
  assert.equal(relatif.decision, 'block');
  if (process.platform === 'win32') assert.equal(repondre({ tool_input: { file_path: fichier.toUpperCase() }, cwd: dir }).decision, 'block');
  const juste = copierProjet('projet-simple');
  const debut = Date.now();
  const r2 = lancer({ tool_name: 'Edit', tool_input: { file_path: path.join(juste, 'scenes', '02-chiffre.html') }, cwd: juste });
  assert.ok(Date.now() - debut < 1000 || process.env.PM_CHARGE, `${Date.now() - debut} ms`);
  assert.equal(r2.status, 0);
  assert.equal(r2.stdout, '');
});

test('hooks-posttooluse-declare : crochet PostToolUse du plugin sur Write et Edit, par node', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
  assert.ok(hooks.hooks.SessionStart, 'le rappel de démarrage reste');
  const groupes = hooks.hooks.PostToolUse;
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].matcher, 'Write|Edit');
  const h = groupes[0].hooks[0];
  assert.deepEqual({ type: h.type, command: h.command, args: h.args, timeout: h.timeout }, { type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/controle-scene.js'], timeout: 10 });
  assert.ok(fs.existsSync(CROCHET));
  // Le crochet n'est pas déclaré dans l'agent (un agent de plugin l'ignorerait).
  assert.equal(/hooks\s*:/.test(fs.readFileSync(path.join(__dirname, '..', 'agents', 'animateur.md'), 'utf8').split('---')[1]), false);
});
