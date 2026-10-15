'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../scripts/lib/personnages.js');
const S = require('../moteur/squelette.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const ctx = (extra = {}) => Object.assign({ nom: 'x', poses: ['debout'], osEnPlus: ['queue'], gabarits: ['standard', 'avec-queue'], osParGabarit: { standard: [], 'avec-queue': ['queue'] }, expressions: ['joie'] }, extra);
const CUISSE = { profil: "<rect x='-7' y='-7' width='14' height='82' rx='7' fill='var(--corps)'/>" };
const VISAGE = {
  oeil: { blanc: "<ellipse rx='13' ry='15' fill='#fff'/>", pupille: "<circle r='6'/>" },
  bouches: { neutre: { profil: "<path d='M -8 0 L 8 0' stroke='var(--trait)'/>" } },
  vues: { profil: { yeux: [[16, -6]], bouche: [24, 22] } },
};
const dessin = (extra = {}) => Object.assign({ nom: 'x', gabarit: 'standard', couleurs: { corps: '#F5F5F5' }, pieces: { cuisseAvant: CUISSE }, visage: VISAGE }, extra);

test('squelette : clés de sourcils au repos', () => {
  assert.equal(S.REPOS.sourcilsY, 0);
  assert.equal(S.REPOS.sourcilsAngle, 0);
  assert.ok(S.NOMS.expression.includes('sourcilsY') && S.NOMS.expression.includes('sourcilsAngle'));
});

test('dessin : valide, avec gabarit nommé ou en ligne, os en plus du gabarit', () => {
  assert.deepEqual(P.valider('dessin', dessin(), ctx()), []);
  assert.deepEqual(P.valider('dessin', dessin({ gabarit: { cuisse: 55, tete: { rx: 42 } } }), ctx()), []);
  assert.deepEqual(P.valider('dessin', dessin({ gabarit: 'avec-queue', pieces: { cuisseAvant: CUISSE, queue: CUISSE } }), ctx()), []);
  assert.deepEqual(P.valider('dessin', dessin({ visage: undefined }), ctx()), [], 'visage facultatif');
});

test('dessin : gabarit et os', () => {
  const e = P.valider('dessin', dessin({ gabarit: 'geant', pieces: { cuisseAvent: CUISSE, queue: CUISSE } }), ctx());
  assert.ok(e.some((m) => /gabarit « geant » introuvable.*standard/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /pièce « cuisseAvent » : os inconnu ; voulais-tu « cuisseAvant » \?/.test(m)));
  assert.ok(P.valider('dessin', dessin({ gabarit: { cuisse: 0 } }), ctx()).some((m) => /gabarit : « cuisse » doit être un nombre positif/.test(m)));
  assert.ok(P.valider('dessin', dessin({ pieces: {} }), ctx()).some((m) => /au moins une pièce/.test(m)));
});

test('dessin : vues, couleurs, accessoires', () => {
  const e = P.valider('dessin', dessin({
    couleurs: { corps: 'rouge', 'Mauvais': '#fff' },
    pieces: { cuisseAvant: { face: CUISSE.profil, cote: CUISSE.profil } },
    accessoires: [{ nom: 'toque', os: 'chapeau', dessins: { face: '<rect/>' } }],
  }), ctx());
  assert.ok(e.some((m) => /couleur « corps » : « rouge » n'est pas une couleur/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /couleur « Mauvais » : nom invalide/.test(m)));
  assert.ok(e.some((m) => /pièce « cuisseAvant » : vue « profil » obligatoire/.test(m)));
  assert.ok(e.some((m) => /pièce « cuisseAvant » : vue « cote » inconnue \(profil, troisQuarts, face, dos\)/.test(m)));
  assert.ok(e.some((m) => /accessoire 1 « toque » : os « chapeau » inconnu/.test(m)));
  assert.ok(e.some((m) => /accessoire 1 « toque » : vue « profil » obligatoire/.test(m)));
});

test('dessin : SVG filtré', () => {
  const e = P.valider('dessin', dessin({ pieces: { cuisseAvant: { profil: '<rect width="1" height="1" onclick="x()"/><script>1</script>' } } }), ctx());
  assert.ok(e.some((m) => /pièce « cuisseAvant », vue « profil » : attribut « onclick » interdit/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /pièce « cuisseAvant », vue « profil » : élément « script » interdit/.test(m)));
  assert.ok(P.valider('dessin', dessin({ visage: Object.assign({}, VISAGE, { sourcil: '<image href="x"/>' }) }), ctx()).some((m) => /sourcil : élément « image » interdit/.test(m)));
  const piege = Object.assign({}, VISAGE, { oeil: Object.assign({}, VISAGE.oeil, { pupille: ['<img src=x onerror=alert(1)>'] }) });
  assert.ok(P.valider('dessin', dessin({ visage: piege }), ctx()).some((m) => /« oeil\.pupille » : SVG attendu/.test(m)));
  const groupe = Object.assign({}, VISAGE, { oeil: Object.assign({}, VISAGE.oeil, { blanc: "<g><ellipse rx='9' ry='9'/></g>" }) });
  assert.ok(P.valider('dessin', dessin({ visage: groupe }), ctx()).some((m) => /« oeil\.blanc » : formes simples sans « g »/.test(m)));
});

test('dessin : visage', () => {
  const sansNeutre = Object.assign({}, VISAGE, { bouches: { sourire: VISAGE.bouches.neutre } });
  assert.ok(P.valider('dessin', dessin({ visage: sansNeutre }), ctx()).some((m) => /bouche « neutre » obligatoire/.test(m)));
  const sansBlanc = Object.assign({}, VISAGE, { oeil: { pupille: '<circle r="2"/>' } });
  assert.ok(P.valider('dessin', dessin({ visage: sansBlanc }), ctx()).some((m) => /« oeil\.blanc » obligatoire/.test(m)));
  const vues = Object.assign({}, VISAGE, { vues: { face: { yeux: [[0, 0]], bouche: [0, 1] } } });
  assert.ok(P.valider('dessin', dessin({ visage: vues }), ctx()).some((m) => /visage : vue « profil » obligatoire/.test(m)));
  const pos = Object.assign({}, VISAGE, { vues: { profil: { yeux: [[1]], bouche: 'bas' } } });
  const e = P.valider('dessin', dessin({ visage: pos }), ctx());
  assert.ok(e.some((m) => /« yeux » : liste de positions \[x, y\]/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /« bouche » : position \[x, y\]/.test(m)));
});

test('expression : valide et invalide', () => {
  assert.deepEqual(P.valider('expression', { nom: 'x', bouche: 'sourire', angles: { sourcilsY: 4, paupieres: 0.8 } }, ctx()), []);
  const e = P.valider('expression', { nom: 'x', angles: { brasAvant: -90, sourcilY: 2 } }, ctx());
  assert.ok(e.some((m) => /« brasAvant » : une expression ne règle que le visage/.test(m)), e.join('\n'));
  assert.ok(e.some((m) => /« sourcilY » .*voulais-tu « sourcilsY »/.test(m)));
});

test('pose et clip : bouche et expression ; clé avec seulement une bouche', () => {
  assert.deepEqual(P.valider('pose', { nom: 'x', expression: 'joie', bouche: 'O', angles: { sourcilsAngle: 10 } }, ctx()), []);
  assert.ok(P.valider('pose', { nom: 'x', expression: 'rage', angles: {} }, ctx()).some((m) => /expression « rage » introuvable.*joie/.test(m)));
  assert.ok(P.valider('pose', { nom: 'x', bouche: '', angles: {} }, ctx()).some((m) => /« bouche » : nom de bouche/.test(m)));
  assert.deepEqual(P.valider('clip', { nom: 'x', boucle: false, cles: [{ t: 0, pose: 'debout' }, { t: 0.4, bouche: 'O' }, { t: 0.8, expression: 'joie' }] }, ctx()), []);
  assert.ok(P.valider('clip', { nom: 'x', boucle: true, duree: 1, additif: true, cles: [{ t: 0, bouche: 'O' }] }, ctx()).some((m) => /calque additif.*bouche/.test(m)));
  assert.ok(P.valider('clip', { nom: 'x', boucle: false, cles: [{ t: 0, pose: 'debout' }, { t: 1 }] }, ctx()).some((m) => /clé 2 : il faut une « pose », des « angles », une « bouche » ou une « expression »/.test(m)));
});

test('lire : dessins et expressions, contexte, gabaritDe ; écriture stable', () => {
  const bib = dossierTemporaire();
  const ecrire = (type, nom, o) => { const f = path.join(bib, P.TYPES[type], `${nom}.json`); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
  ecrire('gabarit', 'standard', { nom: 'standard' });
  ecrire('expression', 'joie', { nom: 'joie', bouche: 'sourire', angles: { sourcilsY: 4 } });
  ecrire('pose', 'debout', { nom: 'debout', angles: {} });
  ecrire('pose', 'content', { nom: 'content', expression: 'joie', angles: {} });
  ecrire('dessin', 'bonhomme', dessin({ nom: 'bonhomme' }));
  const lu = P.lire(null, { bibliotheque: bib });
  assert.deepEqual(lu.erreurs.map((e) => e.message), []);
  assert.ok(lu.dessins.bonhomme && lu.expressions.joie);
  const c = P.contexteDe(lu);
  assert.deepEqual(c.expressions, ['joie']);
  assert.deepEqual(c.gabarits, ['standard']);
  assert.deepEqual(P.gabaritDe(lu.dessins.bonhomme, lu), lu.gabarits.standard);
  assert.deepEqual(P.gabaritDe({ gabarit: { cuisse: 50 } }, lu), { cuisse: 50 });
  assert.deepEqual(P.gabaritDe({}, lu), lu.gabarits.standard);
  for (const [type, o] of [['dessin', lu.dessins.bonhomme], ['expression', lu.expressions.joie], ['pose', lu.poses.content]]) {
    const texte = P.serialiser(type, o);
    assert.equal(P.serialiser(type, JSON.parse(texte)), texte, type);
  }
  const d = P.serialiser('dessin', { visage: VISAGE, pieces: { tete: CUISSE, cuisseAvant: { face: 'b', profil: 'a' } }, couleurs: { b: '#000', a: '#fff' }, nom: 'z' });
  assert.ok(d.indexOf('"tete"') < d.indexOf('"cuisseAvant"'), "pièces dans l'ordre du squelette (tronc, tête, puis membres)");
  assert.ok(d.indexOf('"profil"') < d.indexOf('"face"'));
  assert.ok(d.indexOf('"a": "#fff"') < d.indexOf('"b": "#000"'));
  assert.ok(d.indexOf('"nom"') < d.indexOf('"couleurs"') && d.indexOf('"couleurs"') < d.indexOf('"pieces"') && d.indexOf('"pieces"') < d.indexOf('"visage"'));
});
