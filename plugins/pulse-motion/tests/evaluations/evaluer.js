#!/usr/bin/env node
'use strict';
/* Pulse Motion – évaluations de déclenchement (spec S2, 5.16), lancées en fin de plan (pas dans npm test : coût).
 *
 *   node tests/evaluations/evaluer.js preparer [--apres-r1] [--copie <dossier>]
 *     écrit tests/evaluations/claude/<cas>/ (prompt.md et correcteurs tool_used) depuis declenchement.json ; dossier ignoré
 *     par git. Une compétence qui garde disable-model-invocation (sa description n'est pas dans le contexte de Claude) n'est
 *     jamais attendue : ses phrases attendent « aucune » (retour au blocage, spec S4 5.5 point 5). --apres-r1 : accepté, sans
 *     effet depuis S4 R1 (creer et style n'ont plus le champ). Chaque phrase qui n'attend ni creer ni style a les correcteurs
 *     pas-creer et pas-style : les déclenchements erronés se comptent par compétence (seuil de 5 %). --copie : une copie
 *     allégée du plugin (manifeste, compétences, agents : ce qui décide du choix) avec ses cas, dans <dossier>/pulse-motion ;
 *     sous Windows, le plugin entier fait échouer le lancement des séances (ENAMETOOLONG, constaté avec Claude Code 2.1.310).
 *   claude plugin eval <copie> --eval-dir tests/evaluations/claude --ablation none --runs 1 --model <modèle> -j 4
 *     --json <résultat.json> --no-publish --trust-plugin
 *   node tests/evaluations/evaluer.js taux <résultat.json> [...]   taux de compétences justes, par modèle et par compétence ;
 *     déclenchements erronés de creer et de style sur les contre-exemples.
 *   node tests/evaluations/evaluer.js jetons-critique <session.jsonl | agent-*.jsonl>   jetons lus par l'agent critique avant
 *     d'écrire critique.json (décision 9 de l'auteur, 2026-11-10 : le budget de 15 000 jetons compte ce qu'elle lit avant
 *     d'écrire, pas son dernier appel, qui contient sa propre sortie).
 *
 * Une phrase est juste si la compétence attendue se déclenche (ou aucune, pour « aucune ») et qu'aucune compétence d'un
 * correcteur pas-* ne se déclenche. Idées de skills-main (« Build evaluations first »), video-director (evals) et argo.
 */
const fs = require('node:fs');
const path = require('node:path');

const ICI = __dirname;
const SORTIE = path.join(ICI, 'claude');
const PLUGIN = 'pulse-motion';
const SKILLS = path.join(ICI, '..', '..', 'skills');

const COMPETENCES = fs.readdirSync(SKILLS).filter((d) => fs.existsSync(path.join(SKILLS, d, 'SKILL.md'))).sort();
/** Compétences dont on compte les déclenchements erronés (S4 5.5 : retour au blocage au-delà de 5 %). */
const SURVEILLEES = ['creer', 'style'];
/** Seuil de retour au blocage, en pour cent des contre-exemples. */
const SEUIL_ERREURS = 5;
/** Budget de la critique, en jetons lus avant d'écrire (cas HACCP, correcteur 6 ; décision 9). */
const BUDGET_CRITIQUE = 15000;

const lireDeclenchement = () => JSON.parse(fs.readFileSync(path.join(ICI, 'declenchement.json'), 'utf8'));
const motif = (nom) => `"skill"\\s*:\\s*"(?:${PLUGIN}:)?${nom}"`;
const correcteur = ({ input, min, max }) => ['---', 'type: tool_used', 'tool: Skill', `input_match: '${input}'`, `min: ${min}`, ...(max !== undefined ? [`max: ${max}`] : []), '---', ''].join('\n');

/** Compétences qui gardent disable-model-invocation : jamais attendues (Claude ne voit pas leur description). */
function bloquees(dossier = SKILLS) {
  return COMPETENCES.filter((c) => /^disable-model-invocation:\s*true\s*$/m.test(fs.readFileSync(path.join(dossier, c, 'SKILL.md'), 'utf8')));
}

/** Cas de claude plugin eval pour une phrase. -> { nom, attendu, fichiers: { chemin: contenu } } ; bloquees : compétences
 *  qui gardent disable-model-invocation (leurs phrases attendent « aucune »). */
function casDe(p, k, { bloquees: bloq = bloquees() } = {}) {
  const attendu = bloq.includes(p.attendu) ? 'aucune' : p.attendu;
  const nom = `${String(k + 1).padStart(2, '0')}-${attendu}`;
  const fichiers = {
    'prompt.md': ['---', `name: ${nom}`, 'tags: [declenchement]', 'runs: 1', 'max_turns: 2', 'timeout_seconds: 180',
      'allowed_tools: [Skill, Read, Glob]', 'disallowed_tools: [Bash, Write, Edit, Agent, AskUserQuestion]', '---', '', p.phrase, ''].join('\n'),
  };
  if (attendu === 'aucune') fichiers['graders/aucune.md'] = correcteur({ input: motif(`(?:${COMPETENCES.join('|')})`), min: 0, max: 0 });
  else fichiers[`graders/${attendu}.md`] = correcteur({ input: motif(attendu), min: 1 });
  const pas = new Set(p.pasAttendu ? [p.pasAttendu] : []);
  // Déclenchement erroné de creer ou de style : vérifié sur chaque phrase qui ne les attend pas.
  for (const c of SURVEILLEES) if (c !== p.attendu && COMPETENCES.includes(c) && !bloq.includes(c)) pas.add(c);
  for (const c of pas) fichiers[`graders/pas-${c}.md`] = correcteur({ input: motif(c), min: 0, max: 0 });
  return { nom, attendu, fichiers };
}

function preparer({ dossier = SORTIE, bloquees: bloq = bloquees() } = {}) {
  fs.rmSync(dossier, { recursive: true, force: true });
  const cas = lireDeclenchement().phrases.map((p, k) => casDe(p, k, { bloquees: bloq }));
  for (const c of cas) {
    for (const [f, contenu] of Object.entries(c.fichiers)) {
      const chemin = path.join(dossier, c.nom, f);
      fs.mkdirSync(path.dirname(chemin), { recursive: true });
      fs.writeFileSync(chemin, contenu, 'utf8');
    }
  }
  return cas;
}

/** Nom d'un correcteur dans un résultat (« pas-creer »), quelle que soit la clé que donne claude plugin eval. */
const nomCorrecteur = (g) => String(g.name || g.grader || g.file || g.id || g.path || '').replace(/\.md$/, '').split(/[\\/]/).pop();

/** Cas réussis d'un résultat de claude plugin eval (aggregate-result.json ou --json) : { total, justes, parCas, erreurs }.
 *  erreurs : { creer: { faux, sur, taux }, style: … } : correcteurs pas-<compétence> en échec, sur les cas qui en ont un. */
function taux(resultat) {
  const parCas = {};
  const erreurs = Object.fromEntries(SURVEILLEES.map((c) => [c, { faux: 0, sur: 0, taux: 0 }]));
  for (const c of resultat.cases || []) {
    const runs = (c.arms && (c.arms.with || c.arms.plugin)) || c.runs || [];
    const ok = runs.length > 0 && runs.every((r) => (typeof r.passed === 'boolean' ? r.passed : (r.graders || []).length > 0 && r.graders.every((g) => g.passed === true)));
    parCas[c.name || c.case || c.id] = ok;
    for (const comp of SURVEILLEES) {
      const g = runs.flatMap((r) => r.graders || []).filter((x) => nomCorrecteur(x) === `pas-${comp}`);
      if (!g.length) continue;
      erreurs[comp].sur++;
      if (g.some((x) => x.passed !== true)) erreurs[comp].faux++;
    }
  }
  for (const e of Object.values(erreurs)) e.taux = e.sur ? Math.round((1000 * e.faux) / e.sur) / 10 : 0;
  const noms = Object.keys(parCas);
  return { total: noms.length, justes: noms.filter((n) => parCas[n]).length, parCas, erreurs };
}

/** Lignes JSON d'une transcription (lignes coupées ignorées). */
function lignesJsonl(fichier) {
  return fs.readFileSync(fichier, 'utf8').split(/\r?\n/).filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

/** Transcription de l'agent critique : le fichier lui-même, ou, pour une séance, l'agent de type « pulse-motion:critique »
 *  de <session>/subagents/ (type lu dans agent-*.meta.json). -> chemin | null */
function transcriptionCritique(fichier) {
  const dossier = path.join(fichier.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(dossier)) return fichier;
  const trouve = fs.readdirSync(dossier).filter((f) => f.endsWith('.jsonl')).find((f) => {
    try { return /(^|:)critique$/.test(JSON.parse(fs.readFileSync(path.join(dossier, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')).agentType || ''); } catch { return false; }
  });
  return trouve ? path.join(dossier, trouve) : null;
}

/**
 * Jetons lus par l'agent critique avant d'écrire critique.json (décision 9, 2026-11-10) : le contexte de l'appel du modèle qui
 * contient l'écriture (input_tokens + cache_creation_input_tokens + cache_read_input_tokens), sans sa sortie. Une réponse
 * écrite sur plusieurs lignes (même message.id) compte une fois.
 * -> { avantEcriture, dernierAppel, appels, ok } | null (aucune écriture de critique.json)
 */
function jetonsCritique(fichier, { budget = BUDGET_CRITIQUE } = {}) {
  const agent = transcriptionCritique(fichier);
  if (!agent) return null;
  const appels = new Map();
  let ecriture = null;
  for (const l of lignesJsonl(agent)) {
    if (l.type !== 'assistant' || !l.message) continue;
    const id = l.message.id || l.uuid;
    const u = l.message.usage;
    if (u) appels.set(id, (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0));
    const ecrit = (Array.isArray(l.message.content) ? l.message.content : [])
      .some((b) => b && b.type === 'tool_use' && /^(Write|Edit)$/.test(b.name) && /critique\.json$/.test(String((b.input || {}).file_path || '')));
    if (ecrit && ecriture === null) ecriture = id;
  }
  if (ecriture === null || !appels.has(ecriture)) return null;
  const valeurs = [...appels.values()];
  const avantEcriture = appels.get(ecriture);
  return { avantEcriture, dernierAppel: valeurs[valeurs.length - 1], appels: valeurs.length, ok: avantEcriture <= budget };
}

if (require.main === module) {
  const [commande, ...args] = process.argv.slice(2);
  if (commande === 'preparer') {
    const i = args.indexOf('--copie');
    let dossier = SORTIE;
    if (i >= 0) {
      const racine = path.join(path.resolve(args[i + 1]), 'pulse-motion');
      fs.rmSync(racine, { recursive: true, force: true });
      for (const d of ['.claude-plugin', 'skills', 'agents']) fs.cpSync(path.join(ICI, '..', '..', d), path.join(racine, d), { recursive: true });
      dossier = path.join(racine, 'tests', 'evaluations', 'claude');
    }
    const cas = preparer({ dossier });
    console.log(`${cas.length} cas écrits dans ${dossier}`);
  } else if (commande === 'taux') {
    for (const f of args) {
      const t = taux(JSON.parse(fs.readFileSync(f, 'utf8')));
      console.log(`${path.basename(f)} : ${t.justes}/${t.total} (${Math.round((100 * t.justes) / Math.max(1, t.total))} %)`);
      for (const [n, ok] of Object.entries(t.parCas)) if (!ok) console.log(`  faux : ${n}`);
      for (const [c, e] of Object.entries(t.erreurs)) {
        console.log(`  déclenchements erronés de ${c} : ${e.faux}/${e.sur} (${String(e.taux).replace('.', ',')} %)${e.taux > SEUIL_ERREURS ? ' : au-delà de 5 %, retour au blocage' : ''}`);
      }
    }
  } else if (commande === 'jetons-critique') {
    const r = jetonsCritique(path.resolve(args[0] || ''));
    console.log(JSON.stringify(r ? { ...r, budget: BUDGET_CRITIQUE } : { ok: false, message: 'aucune écriture de critique.json dans cette transcription' }, null, 2));
    process.exit(r && r.ok ? 0 : 1);
  } else {
    console.error('Usage : node tests/evaluations/evaluer.js preparer [--apres-r1] [--copie <dossier>] | taux <résultat.json>… | jetons-critique <transcription.jsonl>');
    process.exit(2);
  }
}

module.exports = { COMPETENCES, SURVEILLEES, SEUIL_ERREURS, BUDGET_CRITIQUE, bloquees, lireDeclenchement, casDe, preparer, taux, jetonsCritique, transcriptionCritique };
