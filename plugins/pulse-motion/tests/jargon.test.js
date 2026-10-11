'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { jargon } = require('./aide/jargon.js');

const SKILLS = path.join(__dirname, '..', 'skills');

test('jargon : rien de technique dans ce que la personne lit (description, indice d\'argument, bloc de fin)', () => {
  for (const s of fs.readdirSync(SKILLS)) {
    const lignes = fs.readFileSync(path.join(SKILLS, s, 'SKILL.md'), 'utf8').split(/\r?\n/);
    const vues = lignes.filter((l) => /^(description|argument-hint):/.test(l) || /^(✅|📄|➡️)/.test(l));
    assert.ok(vues.length > 0, `${s} : rien à contrôler`);
    for (const l of vues) assert.equal(jargon(l.replace(/`sortie\/[^`]*`/g, '')), null, `${s} : « ${l} »`);
  }
});

test('jargon : le contrôle repère bien les mots interdits', () => {
  assert.ok(jargon('le fichier JSON'));
  assert.ok(jargon('un tween de 2 s'));
  assert.equal(jargon('la vidéo animée (page .html)'), null);
});
