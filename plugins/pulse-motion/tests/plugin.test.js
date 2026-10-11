'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');

function enTete(texte) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(texte.replace(/\r\n/g, '\n'));
  assert.ok(m, 'en-tête --- absent');
  const champs = {};
  for (const ligne of m[1].split('\n')) {
    const i = ligne.indexOf(':');
    if (i > 0) champs[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim();
  }
  return champs;
}

const SKILLS = fs.readdirSync(path.join(RACINE, 'skills'));
const COMMANDES = ['etat', 'assembler', 'controler', 'apercu', 'historique', 'reference', 'scene', 'styles', 'consignes', 'exporter', 'planche', 'effet'];
const fichiersGuides = () => [
  ...SKILLS.map((s) => path.join('skills', s, 'SKILL.md')),
  ...fs.readdirSync(path.join(RACINE, 'agents')).map((a) => path.join('agents', a)),
];

test('skills : creer, exporter, retoucher, reprendre, lancés par la personne, outils limités', () => {
  assert.deepEqual(SKILLS.sort(), ['creer', 'exporter', 'reprendre', 'retoucher']);
  for (const s of SKILLS) {
    const e = enTete(lire('skills', s, 'SKILL.md'));
    assert.ok(e.description && e.description.length > 20, `${s} : description`);
    assert.equal(e['disable-model-invocation'], 'true', `${s} : lancé par la personne seulement`);
    assert.match(e['allowed-tools'], /Bash\(pulse-motion \*\)/, `${s} : outil pulse-motion autorisé`);
  }
});

test('agent animateur : nom, description, outils', () => {
  const e = enTete(lire('agents', 'animateur.md'));
  assert.equal(e.name, 'animateur');
  assert.match(e.description, /une seule scène/);
  assert.match(e.tools, /Write/);
});

test('les commandes pulse-motion citées existent, avec les références et scènes citées', () => {
  for (const f of fichiersGuides()) {
    const texte = lire(f);
    for (const m of texte.matchAll(/pulse-motion ([a-z]+)/g)) {
      if (m[1] === 'reference' || COMMANDES.includes(m[1])) continue;
      assert.fail(`${f} : commande inconnue « pulse-motion ${m[1]} »`);
    }
    for (const m of texte.matchAll(/pulse-motion reference ([a-z0-9/<>-]+)/g)) {
      if (m[1].includes('<')) continue;
      assert.ok(fs.existsSync(path.join(RACINE, 'references', `${m[1]}.md`)), `${f} : référence « ${m[1]} » absente`);
    }
    for (const m of texte.matchAll(/pulse-motion consignes ([a-z0-9-]+)/g)) {
      assert.ok(SKILLS.includes(m[1]), `${f} : consignes « ${m[1]} » absentes`);
    }
  }
});

test('guidage : Node absent, police non fournie, décor de la dernière scène', () => {
  for (const s of SKILLS) {
    assert.match(lire('skills', s, 'SKILL.md'), /Node\.js.*introuvable|introuvable.*Node\.js/, `${s} : cas « Node absent »`);
  }
  assert.match(lire('skills', 'creer', 'SKILL.md'), /police.*sans fichier.*(Figtree|Inter)/i);
  for (const f of [path.join('agents', 'animateur.md'), path.join('references', 'styles', 'clair-pedagogique.md')]) {
    assert.match(lire(f), /dernière scène.*0,5 s/, `${f} : pause finale de la dernière scène`);
  }
});

test('export : proposé à la fin de creer et de retoucher, planche dans le parcours accompagné', () => {
  for (const s of ['creer', 'retoucher']) assert.match(lire('skills', s, 'SKILL.md'), /\/pulse-motion:exporter/, s);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /pulse-motion planche \. <id1>,<id2> --ouvrir/);
  assert.match(lire('skills', 'exporter', 'SKILL.md'), /`pulse-motion exporter \.` en arrière-plan/);
});

test('références : bloc « L\'essentiel » en tête, styles du catalogue documentés', () => {
  for (const f of ['moteur.md', 'rythme.md', path.join('styles', 'clair-pedagogique.md')]) {
    assert.match(lire('references', f), /^# .+\n\n## L'essentiel\n/, f);
  }
  const catalogue = JSON.parse(lire('styles', 'clair-pedagogique', 'catalogue.json'));
  const doc = lire('references', 'styles', 'clair-pedagogique.md');
  for (const s of catalogue.scenes) {
    assert.match(doc, new RegExp(`\\| \`${s.nom}\` \\|.*\\| ${s.duree} s \\|`), `scène ${s.nom} documentée avec sa durée`);
  }
});

test('consignes : les effets de particules sont guidés', () => {
  const animateur = lire('agents', 'animateur.md');
  assert.match(animateur, /pulse-motion reference particules/);
  assert.match(animateur, /effets\/<nom>\.json/);
  assert.match(animateur, /etend/);
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  assert.match(retoucher, /\| Effet de particules \|/);
  assert.match(retoucher, /data-graine/);
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.match(creer, /effet de particules/);
  assert.match(creer, /au plus deux effets simultanés/);
  assert.match(animateur, /seulement si votre consigne le demande/);
  assert.match(animateur, /effet-sur-texte/);
});
