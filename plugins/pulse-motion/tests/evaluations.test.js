'use strict';
/* Évaluations de déclenchement et par cas (spec S2, 5.16) : forme des fichiers ; le lancement (claude plugin eval) se fait
 * en fin de plan, hors de npm test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('./evaluations/evaluer.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const SKILLS = path.join(__dirname, '..', 'skills');
const CAS = path.join(__dirname, 'evaluations', 'cas');
const bloquees = E.COMPETENCES.filter((c) => /^disable-model-invocation:\s*true\s*$/m.test(fs.readFileSync(path.join(SKILLS, c, 'SKILL.md'), 'utf8')));

test('evaluations.test.js › declenchement.json : 3 phrases par compétence déclenchable, 12 contre-exemples, compétences existantes', () => {
  const { phrases } = E.lireDeclenchement();
  const connues = new Set([...E.COMPETENCES, 'aucune']);
  for (const p of phrases) {
    assert.ok(typeof p.phrase === 'string' && p.phrase.length > 3, JSON.stringify(p));
    assert.ok(connues.has(p.attendu), `attendu inconnu : ${p.attendu}`);
    if (p.pasAttendu) assert.ok(E.COMPETENCES.includes(p.pasAttendu) && p.pasAttendu !== p.attendu, `pasAttendu : ${p.pasAttendu}`);
    if (p.apresR1) assert.ok(bloquees.includes(p.apresR1) && p.attendu === 'aucune', `apresR1 : ${p.apresR1}`);
  }
  // Une compétence à disable-model-invocation n'est jamais attendue tant qu'elle le garde (S4 R1 relance après son retrait).
  assert.deepEqual(bloquees, ['creer', 'style']);
  for (const b of bloquees) {
    assert.equal(phrases.filter((p) => p.attendu === b).length, 0, b);
    assert.ok(phrases.filter((p) => p.apresR1 === b).length >= 3, `${b} : 3 phrases prêtes pour R1`);
  }
  for (const c of E.COMPETENCES.filter((x) => !bloquees.includes(x))) {
    assert.ok(phrases.filter((p) => p.attendu === c).length >= 3, `${c} : au moins 3 phrases`);
  }
  assert.ok(phrases.filter((p) => p.pasAttendu).length >= 12, 'au moins 12 contre-exemples');
  assert.equal(new Set(phrases.map((p) => p.phrase)).size, phrases.length, 'phrases uniques');
});

test('evaluations.test.js › les cas de claude plugin eval sont écrits avec leurs correcteurs', () => {
  const dir = dossierTemporaire('pm-evals-');
  const cas = E.preparer({ dossier: dir });
  assert.equal(cas.length, E.lireDeclenchement().phrases.length);
  const un = cas.find((c) => c.fichiers['graders/pas-retoucher.md']);
  assert.match(un.fichiers['prompt.md'], /^---\nname: .*\ntags: \[declenchement\]\nruns: 1\nmax_turns: 2\n/);
  assert.match(un.fichiers[`graders/${un.attendu}.md`], /type: tool_used\ntool: Skill\ninput_match: '.*\)\?\w[\w-]*"'\nmin: 1/);
  assert.match(un.fichiers['graders/pas-retoucher.md'], /min: 0\nmax: 0/);
  const aucune = cas.find((c) => c.attendu === 'aucune');
  assert.match(aucune.fichiers['graders/aucune.md'], /creer\|.*style.*\nmin: 0\nmax: 0/);
  // Après R1 : creer et style deviennent attendus.
  assert.ok(E.preparer({ dossier: dir, apresR1: true }).some((c) => c.attendu === 'creer'));
  assert.ok(fs.existsSync(path.join(dir, cas[0].nom.replace('aucune', 'creer'), 'prompt.md')));
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
  // Le cas HACCP porte le critère reporté de S2-4 : la critique sous 15 000 jetons d'entrée.
  const haccp = JSON.parse(fs.readFileSync(path.join(CAS, 'formation-haccp', 'cas.json'), 'utf8'));
  assert.ok(haccp.correcteurs.some((x) => x.verifie === 'jetons-critique' && x.valeur.max === 15000));
});

test('evaluations.test.js › taux : un cas est juste si tous ses correcteurs passent', () => {
  const r = E.taux({ cases: [
    { name: 'a', arms: { with: [{ graders: [{ passed: true }, { passed: true }] }] } },
    { name: 'b', arms: { with: [{ graders: [{ passed: true }, { passed: false }] }] } },
  ] });
  assert.deepEqual([r.total, r.justes, r.parCas], [2, 1, { a: true, b: false }]);
});
