'use strict';
/* Évaluations de déclenchement et par cas (spec S2, 5.16 ; S4 5.5) : forme des fichiers ; le lancement (claude plugin eval)
 * se fait en fin de plan, hors de npm test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('./evaluations/evaluer.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const CAS = path.join(__dirname, 'evaluations', 'cas');

test('evaluations.test.js › declenchement.json : 3 phrases par compétence, 8 pour creer et style, 12 contre-exemples, compétences existantes', () => {
  const { phrases } = E.lireDeclenchement();
  const connues = new Set([...E.COMPETENCES, 'aucune']);
  for (const p of phrases) {
    assert.ok(typeof p.phrase === 'string' && p.phrase.length > 3, JSON.stringify(p));
    assert.ok(connues.has(p.attendu), `attendu inconnu : ${p.attendu}`);
    assert.equal(p.apresR1, undefined, `apresR1 retiré depuis S4 R1 : ${p.phrase}`);
    if (p.pasAttendu) assert.ok(E.COMPETENCES.includes(p.pasAttendu) && p.pasAttendu !== p.attendu, `pasAttendu : ${p.pasAttendu}`);
  }
  for (const c of E.COMPETENCES) assert.ok(phrases.filter((p) => p.attendu === c).length >= 3, `${c} : au moins 3 phrases`);
  // S4 5.5 point 3 : au moins 8 phrases qui déclenchent creer ou style, au moins 8 qui ne le doivent pas (pasAttendu).
  assert.ok(phrases.filter((p) => E.SURVEILLEES.includes(p.attendu)).length >= 8, 'au moins 8 phrases pour creer et style');
  assert.ok(phrases.filter((p) => E.SURVEILLEES.includes(p.pasAttendu)).length >= 8, 'au moins 8 contre-exemples de creer et style');
  assert.ok(phrases.some((p) => p.attendu === 'creer' && /que sait faire Pulse Motion/i.test(p.phrase)), '« que sait faire Pulse Motion ? » déclenche creer');
  assert.ok(phrases.filter((p) => p.pasAttendu).length >= 12, 'au moins 12 contre-exemples');
  assert.equal(new Set(phrases.map((p) => p.phrase)).size, phrases.length, 'phrases uniques');
});

test('evaluations.test.js › les cas de claude plugin eval sont écrits avec leurs correcteurs ; pas-creer et pas-style sur les contre-exemples', () => {
  const dir = dossierTemporaire('pm-evals-');
  const cas = E.preparer({ dossier: dir });
  assert.equal(cas.length, E.lireDeclenchement().phrases.length);
  assert.deepEqual(E.bloquees(), [], 'creer et style sans disable-model-invocation (S4 R1)');
  const un = cas.find((c) => c.fichiers['graders/pas-retoucher.md']);
  assert.match(un.fichiers['prompt.md'], /^---\nname: .*\ntags: \[declenchement\]\nruns: 1\nmax_turns: 2\n/);
  assert.match(un.fichiers[`graders/${un.attendu}.md`], /type: tool_used\ntool: Skill\ninput_match: '.*\)\?\w[\w-]*"'\nmin: 1/);
  assert.match(un.fichiers['graders/pas-retoucher.md'], /min: 0\nmax: 0/);
  const aucune = cas.find((c) => c.attendu === 'aucune');
  assert.match(aucune.fichiers['graders/aucune.md'], /creer\|.*style.*\nmin: 0\nmax: 0/);
  // creer et style attendus ; toute autre phrase vérifie qu'elles ne se déclenchent pas.
  assert.ok(cas.some((c) => c.attendu === 'creer') && cas.some((c) => c.attendu === 'style'));
  for (const c of cas) {
    for (const s of E.SURVEILLEES) {
      if (c.attendu === s) assert.equal(c.fichiers[`graders/pas-${s}.md`], undefined, c.nom);
      else assert.match(c.fichiers[`graders/pas-${s}.md`] || '', /min: 0\nmax: 0/, `${c.nom} : pas-${s}`);
    }
  }
  // Retour au blocage (S4 5.5 point 5) : une compétence qui garde le champ n'est jamais attendue.
  const bloque = E.preparer({ dossier: dir, bloquees: ['style'] });
  assert.equal(bloque.filter((c) => c.attendu === 'style').length, 0);
  assert.ok(bloque.every((c) => !c.fichiers['graders/pas-style.md']));
});

test('evaluations.test.js › chaque cas a une demande, ses fichiers et des correcteurs numérotés sans trou', () => {
  const noms = fs.readdirSync(CAS).sort();
  assert.deepEqual(noms, ['formation-haccp', 'produit-pme', 'social-chiffres']);
  for (const nom of noms) {
    const c = JSON.parse(fs.readFileSync(path.join(CAS, nom, 'cas.json'), 'utf8'));
    assert.equal(c.nom, nom);
    assert.ok(c.demande.length > 40, `${nom} : demande`);
    assert.ok(c.fichiers.length >= 1, `${nom} : fichiers`);
    for (const f of c.fichiers) assert.ok(fs.existsSync(path.join(CAS, nom, f)), `${nom} : ${f} manque`);
    assert.deepEqual(c.correcteurs.map((x) => x.n), c.correcteurs.map((_, k) => k + 1), `${nom} : numéros sans trou`);
    for (const x of c.correcteurs) assert.ok(x.quoi && x.verifie, `${nom} : correcteur ${x.n}`);
  }
  // Le cas HACCP porte le critère reporté de S2-4 : la critique lit moins de 15 000 jetons avant d'écrire (décision 9).
  const haccp = JSON.parse(fs.readFileSync(path.join(CAS, 'formation-haccp', 'cas.json'), 'utf8'));
  const c6 = haccp.correcteurs.find((x) => x.verifie === 'jetons-critique');
  assert.ok(c6 && c6.valeur.max === E.BUDGET_CRITIQUE && c6.valeur.mesure === 'avant-ecriture', JSON.stringify(c6));
  assert.match(c6.quoi, /avant d'écrire/);
  assert.doesNotMatch(c6.quoi, /jetons d'entrée\.$/);
});

test('evaluations.test.js › taux : un cas est juste si tous ses correcteurs passent ; déclenchements erronés comptés par compétence', () => {
  const r = E.taux({ cases: [
    { name: 'a', arms: { with: [{ graders: [{ name: 'retoucher', passed: true }, { name: 'pas-creer', passed: true }] }] } },
    { name: 'b', arms: { with: [{ graders: [{ name: 'retoucher', passed: true }, { name: 'pas-creer', passed: false }] }] } },
    { name: 'c', arms: { with: [{ graders: [{ name: 'creer', passed: true }, { name: 'pas-style', passed: true }] }] } },
  ] });
  assert.deepEqual([r.total, r.justes, r.parCas], [3, 2, { a: true, b: false, c: true }]);
  assert.deepEqual(r.erreurs.creer, { faux: 1, sur: 2, taux: 50 });
  assert.deepEqual(r.erreurs.style, { faux: 0, sur: 1, taux: 0 });
});

/** Transcription d'un agent critique : lecture (4 250 jetons), planches (9 889), écriture de critique.json (13 115),
 *  résumé final (20 465 : il contient sa propre sortie). Une réponse sur deux lignes (même id) compte une fois. */
function transcription(dossier) {
  const ligne = (id, usage, contenu) => JSON.stringify({ type: 'assistant', message: { id, model: 'claude-sonnet', usage, content: contenu } });
  const u = (lus) => ({ input_tokens: 10, cache_creation_input_tokens: lus - 1010, cache_read_input_tokens: 1000, output_tokens: 500 });
  const lignes = [
    JSON.stringify({ type: 'user', message: { content: 'Relis la vidéo.' } }),
    ligne('m1', u(4250), [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'sortie/regard/fiche.md' } }]),
    ligne('m2', u(9889), [{ type: 'text', text: 'Je regarde les planches.' }]),
    ligne('m2', u(9889), [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: 'sortie/regard/ouverture.png' } }]),
    ligne('m3', u(13115), [{ type: 'tool_use', id: 't3', name: 'Write', input: { file_path: 'C:/video/sortie/regard/critique.json', content: '{}' } }]),
    ligne('m4', u(20465), [{ type: 'text', text: 'Relecture faite.' }]),
  ];
  const session = path.join(dossier, 'session.jsonl');
  fs.writeFileSync(session, `${JSON.stringify({ type: 'user', message: { content: 'note ma vidéo' } })}\n`);
  const agents = path.join(dossier, 'session', 'subagents');
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, 'agent-1.jsonl'), `${lignes.join('\n')}\n`);
  fs.writeFileSync(path.join(agents, 'agent-1.meta.json'), JSON.stringify({ agentType: 'pulse-motion:critique' }));
  fs.writeFileSync(path.join(agents, 'agent-2.jsonl'), `${ligne('x', u(50000), [])}\n`);
  fs.writeFileSync(path.join(agents, 'agent-2.meta.json'), JSON.stringify({ agentType: 'pulse-motion:animateur' }));
  return { session, agent: path.join(agents, 'agent-1.jsonl') };
}

test('evaluations.test.js › jetons de la critique : ce qu\'elle lit avant d\'écrire critique.json, pas son dernier appel (décision 9)', () => {
  const dir = dossierTemporaire('pm-evals-critique-');
  const { session, agent } = transcription(dir);
  for (const f of [session, agent]) {
    const r = E.jetonsCritique(f);
    assert.deepEqual(r, { avantEcriture: 13115, dernierAppel: 20465, appels: 4, ok: true }, f);
  }
  assert.equal(E.jetonsCritique(agent, { budget: 13000 }).ok, false);
  // Aucune écriture de critique.json : rien à mesurer.
  const vide = path.join(dir, 'vide.jsonl');
  fs.writeFileSync(vide, `${JSON.stringify({ type: 'assistant', message: { id: 'a', usage: { input_tokens: 5 }, content: [] } })}\n`);
  assert.equal(E.jetonsCritique(vide), null);
});
