#!/usr/bin/env node
'use strict';
/* Pulse Motion – lance toute la suite de tests en deux phases (npm test).
 *
 *   1. tests unitaires, en parallèle (node --test) ;
 *   2. tests qui ouvrent Chrome ou Edge (WebGPU, captures, exports), deux fichiers à la fois (--test-concurrency=2) :
 *      lancés tous ensemble, ils se disputent le GPU et dépassent leurs délais. Un fichier qui a encore dépassé un délai
 *      (sous charge, deux fichiers GPU lourds en même temps) est relancé une fois, seul, à la fin de la phase (rapporteur
 *      scripts/lib/rapport-tests.js) ; la relance est signalée dans le résumé, et la phase réussit si la relance réussit.
 *
 * Un fichier est « navigateur » s'il charge une aide qui pilote le navigateur (voir NAVIGATEUR). La sonde WebGPU
 * est faite une seule fois ici et transmise aux processus enfants (PM_OPTIONS_WEBGPU, ou PM_SANS_WEBGPU=1).
 * Un fichier seul reste lançable : node --test tests/<fichier>.
 * Arguments : --unitaires ou --navigateur pour une seule phase.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { dossierTemporaire } = require('../tests/aide/temporaire.js');

const TESTS = path.join(__dirname, '..', 'tests');
const NAVIGATEUR = /require\(\s*['"](?:\.\/aide\/(?:gpu|navigateur|page-son)|\.\.\/scripts\/lib\/(?:cdp|navigateur|page-mesures|capture-fidele)|\.\.\/scripts\/exporter)(?:\.js)?['"]\s*\)/;

/** { unitaires, navigateur } : chemins des fichiers *.test.js de tests/, triés. */
function repartir(dossier = TESTS) {
  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.test.js')).sort();
  const r = { unitaires: [], navigateur: [] };
  for (const f of fichiers) {
    const chemin = path.join(dossier, f);
    (NAVIGATEUR.test(fs.readFileSync(chemin, 'utf8')) ? r.navigateur : r.unitaires).push(chemin);
  }
  return r;
}

function phase(titre, fichiers, options, env) {
  if (!fichiers.length) return 0;
  console.log(`\n== ${titre} : ${fichiers.length} fichiers ==`);
  const r = spawnSync(process.execPath, ['--test', ...options, ...fichiers], { stdio: 'inherit', env });
  return r.status === null ? 1 : r.status;
}

const RAPPORTEUR = path.join(__dirname, 'lib', 'rapport-tests.js');

/** Lignes du rapporteur (JSON par échec) -> { relancer: fichiers qui ont dépassé un délai, autres: fichiers en échec
 *  sans délai dépassé, inconnu: un échec sans fichier }. */
function aRelancer(texte) {
  const relancer = new Set();
  const echecs = new Set();
  let inconnu = false;
  for (const ligne of String(texte).split('\n')) {
    if (!ligne.trim()) continue;
    let e;
    try { e = JSON.parse(ligne); } catch { inconnu = true; continue; }
    if (!e.fichier) { inconnu = true; continue; }
    echecs.add(e.fichier);
    if (e.delai) relancer.add(e.fichier);
  }
  return { relancer: [...relancer].sort(), autres: [...echecs].filter((f) => !relancer.has(f)).sort(), inconnu };
}

/** Phase navigateur : deux fichiers à la fois, puis relance seule, une fois, de chaque fichier qui a dépassé un délai.
 *  -> { code, relances: [{ fichier, ok, duree }] } */
function phaseNavigateur(fichiers, env) {
  const dossier = dossierTemporaire('pm-rapport-');
  const rapport = path.join(dossier, 'echecs.jsonl');
  const options = ['--test-concurrency=2', '--test-reporter=spec', '--test-reporter-destination=stdout',
    `--test-reporter=${pathToFileURL(RAPPORTEUR).href}`, `--test-reporter-destination=${rapport}`];
  const code = phase('Tests navigateur / WebGPU', fichiers, options, env);
  if (!code) return { code, relances: [] };
  const lu = aRelancer(fs.existsSync(rapport) ? fs.readFileSync(rapport, 'utf8') : '');
  const relances = [];
  for (const fichier of lu.relancer) {
    console.log(`\n== Relance seule (délai dépassé sous charge) : ${path.basename(fichier)} ==`);
    const debut = Date.now();
    const r = spawnSync(process.execPath, ['--test', fichier], { stdio: 'inherit', env });
    relances.push({ fichier, ok: r.status === 0, duree: (Date.now() - debut) / 1000 });
  }
  const resolu = !lu.inconnu && lu.autres.length === 0 && lu.relancer.length > 0 && relances.every((x) => x.ok);
  return { code: resolu ? 0 : code, relances };
}

async function principal(args) {
  const seule = args.includes('--unitaires') ? 'unitaires' : args.includes('--navigateur') ? 'navigateur' : null;
  const { unitaires, navigateur } = repartir();
  const debut = Date.now();
  let echec = 0;
  let relances = [];
  if (seule !== 'navigateur') echec |= phase('Tests unitaires', unitaires, [], process.env);
  if (seule !== 'unitaires' && navigateur.length) {
    const env = { ...process.env };
    if (env.PM_OPTIONS_WEBGPU === undefined && env.PM_SANS_WEBGPU === undefined) {
      const options = await require('../tests/aide/gpu.js').optionsWebGPU();
      if (options) env.PM_OPTIONS_WEBGPU = options.join(' '); else env.PM_SANS_WEBGPU = '1';
      console.log(`\nSonde WebGPU (une fois) : ${options ? options.join(' ') : 'indisponible, les tests WebGPU seront ignorés'}`);
    }
    const r = phaseNavigateur(navigateur, env);
    echec |= r.code;
    relances = r.relances;
  }
  if (relances.length) {
    console.log('\nFichiers relancés seuls après un délai dépassé pendant la suite :');
    relances.forEach((x) => console.log(`  ${path.basename(x.fichier)} : ${x.ok ? 'réussi' : 'ÉCHEC'} seul (${x.duree.toFixed(1)} s)`));
  }
  console.log(`\nDurée totale : ${((Date.now() - debut) / 1000).toFixed(1)} s`);
  return echec;
}

if (require.main === module) {
  principal(process.argv.slice(2)).then((code) => process.exit(code ? 1 : 0), (e) => { console.error(e); process.exit(1); });
}

module.exports = { repartir, aRelancer, NAVIGATEUR };
