#!/usr/bin/env node
'use strict';
/* Pulse Motion – évaluations de déclenchement (spec S2, 5.16), lancées en fin de plan (pas dans npm test : coût).
 *
 *   node tests/evaluations/evaluer.js preparer [--apres-r1]
 *     écrit tests/evaluations/claude/<cas>/ (prompt.md et correcteurs tool_used) depuis declenchement.json ; dossier ignoré
 *     par git. --apres-r1 : attendus de creer et style une fois disable-model-invocation retiré (S4 R1).
 *   claude plugin eval plugins/pulse-motion --eval-dir tests/evaluations/claude --ablation none --runs 1 --model <modèle>
 *     --json <résultat.json> --no-publish
 *   node tests/evaluations/evaluer.js taux <résultat.json> [...]   taux de compétences justes, par modèle et par compétence.
 *
 * Une phrase est juste si la compétence attendue se déclenche (ou aucune, pour « aucune ») et que la compétence de
 * pasAttendu ne se déclenche pas. Idées de skills-main (« Build evaluations first »), video-director (evals) et argo.
 */
const fs = require('node:fs');
const path = require('node:path');

const ICI = __dirname;
const SORTIE = path.join(ICI, 'claude');
const PLUGIN = 'pulse-motion';

const COMPETENCES = fs.readdirSync(path.join(ICI, '..', '..', 'skills')).filter((d) => fs.existsSync(path.join(ICI, '..', '..', 'skills', d, 'SKILL.md'))).sort();
const lireDeclenchement = () => JSON.parse(fs.readFileSync(path.join(ICI, 'declenchement.json'), 'utf8'));
const motif = (nom) => `"skill"\\s*:\\s*"(?:${PLUGIN}:)?${nom}"`;
const correcteur = ({ input, min, max }) => ['---', 'type: tool_used', 'tool: Skill', `input_match: '${input}'`, `min: ${min}`, ...(max !== undefined ? [`max: ${max}`] : []), '---', ''].join('\n');

/** Cas de claude plugin eval pour une phrase. -> { nom, fichiers: { chemin: contenu } } */
function casDe(p, k, { apresR1 = false } = {}) {
  const attendu = apresR1 && p.apresR1 ? p.apresR1 : p.attendu;
  const nom = `${String(k + 1).padStart(2, '0')}-${attendu}`;
  const fichiers = {
    'prompt.md': ['---', `name: ${nom}`, 'tags: [declenchement]', 'runs: 1', 'max_turns: 2', 'timeout_seconds: 180',
      'allowed_tools: [Skill, Read, Glob]', 'disallowed_tools: [Bash, Write, Edit, Agent, AskUserQuestion]', '---', '', p.phrase, ''].join('\n'),
  };
  if (attendu === 'aucune') fichiers['graders/aucune.md'] = correcteur({ input: motif(`(?:${COMPETENCES.join('|')})`), min: 0, max: 0 });
  else fichiers[`graders/${attendu}.md`] = correcteur({ input: motif(attendu), min: 1 });
  if (p.pasAttendu) fichiers[`graders/pas-${p.pasAttendu}.md`] = correcteur({ input: motif(p.pasAttendu), min: 0, max: 0 });
  return { nom, attendu, fichiers };
}

function preparer({ apresR1 = false, dossier = SORTIE } = {}) {
  fs.rmSync(dossier, { recursive: true, force: true });
  const cas = lireDeclenchement().phrases.map((p, k) => casDe(p, k, { apresR1 }));
  for (const c of cas) {
    for (const [f, contenu] of Object.entries(c.fichiers)) {
      const chemin = path.join(dossier, c.nom, f);
      fs.mkdirSync(path.dirname(chemin), { recursive: true });
      fs.writeFileSync(chemin, contenu, 'utf8');
    }
  }
  return cas;
}

/** Cas réussis d'un résultat de claude plugin eval (aggregate-result.json ou --json) : { total, justes, parCas }. */
function taux(resultat) {
  const parCas = {};
  for (const c of resultat.cases || []) {
    const runs = (c.arms && (c.arms.with || c.arms.plugin)) || c.runs || [];
    const ok = runs.length > 0 && runs.every((r) => (r.graders || []).every((g) => g.passed === true || g.pass === true || g.score === 1));
    parCas[c.name || c.case || c.id] = ok;
  }
  const noms = Object.keys(parCas);
  return { total: noms.length, justes: noms.filter((n) => parCas[n]).length, parCas };
}

if (require.main === module) {
  const [commande, ...args] = process.argv.slice(2);
  if (commande === 'preparer') {
    const cas = preparer({ apresR1: args.includes('--apres-r1') });
    console.log(`${cas.length} cas écrits dans ${path.relative(process.cwd(), SORTIE)}`);
  } else if (commande === 'taux') {
    for (const f of args) {
      const t = taux(JSON.parse(fs.readFileSync(f, 'utf8')));
      console.log(`${path.basename(f)} : ${t.justes}/${t.total} (${Math.round((100 * t.justes) / Math.max(1, t.total))} %)`);
      for (const [n, ok] of Object.entries(t.parCas)) if (!ok) console.log(`  faux : ${n}`);
    }
  } else {
    console.error('Usage : node tests/evaluations/evaluer.js preparer [--apres-r1] | taux <résultat.json>…');
    process.exit(2);
  }
}

module.exports = { COMPETENCES, lireDeclenchement, casDe, preparer, taux };
