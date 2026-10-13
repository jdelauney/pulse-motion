#!/usr/bin/env node
'use strict';
/* Pulse Motion – lance toute la suite de tests en deux phases (npm test).
 *
 *   1. tests unitaires, en parallèle (node --test) ;
 *   2. tests qui ouvrent Chrome ou Edge (WebGPU, captures, exports), deux fichiers à la fois (--test-concurrency=2) :
 *      lancés tous ensemble, ils se disputent le GPU et dépassent leurs délais.
 *
 * Un fichier est « navigateur » s'il charge une aide qui pilote le navigateur (voir NAVIGATEUR). La sonde WebGPU
 * est faite une seule fois ici et transmise aux processus enfants (PM_OPTIONS_WEBGPU, ou PM_SANS_WEBGPU=1).
 * Un fichier seul reste lançable : node --test tests/<fichier>.
 * Arguments : --unitaires ou --navigateur pour une seule phase.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TESTS = path.join(__dirname, '..', 'tests');
const NAVIGATEUR = /require\(\s*'(?:\.\/aide\/(?:gpu|navigateur|page-son)|\.\.\/scripts\/lib\/(?:cdp|navigateur|page-mesures|capture-fidele)|\.\.\/scripts\/exporter)(?:\.js)?'\s*\)/;

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

async function principal(args) {
  const seule = args.includes('--unitaires') ? 'unitaires' : args.includes('--navigateur') ? 'navigateur' : null;
  const { unitaires, navigateur } = repartir();
  const debut = Date.now();
  let echec = 0;
  if (seule !== 'navigateur') echec |= phase('Tests unitaires', unitaires, [], process.env);
  if (seule !== 'unitaires' && navigateur.length) {
    const env = { ...process.env };
    if (env.PM_OPTIONS_WEBGPU === undefined && env.PM_SANS_WEBGPU === undefined) {
      const options = await require('../tests/aide/gpu.js').optionsWebGPU();
      if (options) env.PM_OPTIONS_WEBGPU = options.join(' '); else env.PM_SANS_WEBGPU = '1';
      console.log(`\nSonde WebGPU (une fois) : ${options ? options.join(' ') : 'indisponible, les tests WebGPU seront ignorés'}`);
    }
    echec |= phase('Tests navigateur / WebGPU', navigateur, ['--test-concurrency=2'], env);
  }
  console.log(`\nDurée totale : ${((Date.now() - debut) / 1000).toFixed(1)} s`);
  return echec;
}

if (require.main === module) {
  principal(process.argv.slice(2)).then((code) => process.exit(code ? 1 : 0), (e) => { console.error(e); process.exit(1); });
}

module.exports = { repartir, NAVIGATEUR };
