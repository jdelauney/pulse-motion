'use strict';
/* Spec Retouches et ergonomie (S4) 5.6 : installation en moins d'étapes. Python trouvé hors du PATH, plan d'installation en
 * un accord, consignes des compétences (le relais de Node est vérifié par enveloppes.test.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { emplacementsPython, candidatsPython } = require('../scripts/lib/whisper.js');
const { planOutils } = require('../scripts/outils.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');

test('whisper : Python trouvé dans les emplacements connus sans PATH', () => {
  // Windows : AppData (le plus récent d'abord), puis le lanceur py de l'utilisateur, puis celui du système.
  const env = { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local', SystemRoot: 'C:\\Windows' };
  const existants = new Set([
    'C:\\Users\\a\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
    'C:\\Users\\a\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
    'C:\\Users\\a\\AppData\\Local\\Programs\\Python\\Launcher\\py.exe',
    'C:\\Windows\\py.exe',
  ]);
  const lister = () => ['Launcher', 'Python39', 'Python312', 'Python311-32x'];
  const w = emplacementsPython({ env, plateforme: 'win32', existe: (f) => existants.has(f), lister });
  assert.deepEqual(w, [
    ['C:\\Users\\a\\AppData\\Local\\Programs\\Python\\Python312\\python.exe'],
    ['C:\\Users\\a\\AppData\\Local\\Programs\\Python\\Python39\\python.exe'],
    ['C:\\Users\\a\\AppData\\Local\\Programs\\Python\\Launcher\\py.exe', '-3'],
    ['C:\\Windows\\py.exe', '-3'],
  ]);
  // macOS et Linux : Homebrew, puis /usr/local.
  assert.deepEqual(emplacementsPython({ env: {}, plateforme: 'darwin', existe: () => true }), [['/opt/homebrew/bin/python3'], ['/usr/local/bin/python3']]);
  assert.deepEqual(emplacementsPython({ env: {}, plateforme: 'linux', existe: (f) => f === '/usr/local/bin/python3' }), [['/usr/local/bin/python3']]);
  // Les commandes du PATH d'abord, les emplacements connus ensuite ; un dossier illisible ne fait rien échouer.
  const c = candidatsPython({ env, plateforme: 'win32', existe: (f) => existants.has(f), lister: () => { throw new Error('illisible'); } });
  assert.deepEqual(c.slice(0, 2), [['py', '-3'], ['python']]);
  assert.deepEqual(c.slice(2), [['C:\\Users\\a\\AppData\\Local\\Programs\\Python\\Launcher\\py.exe', '-3'], ['C:\\Windows\\py.exe', '-3']]);
});

test('outils --plan : ordre, tailles et commandes sûres', () => {
  const manque = { ok: false };
  const etat = {
    navigateur: { ok: false }, ffmpeg: manque, transcription: manque,
    python: { ok: false, commandeSysteme: { commande: 'winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements', message: '' } },
  };
  const p = planOutils(etat, { plateforme: 'win32' });
  assert.deepEqual(p.map((x) => x.outil), ['ffmpeg', 'python', 'transcription', 'navigateur']);
  for (const x of p) assert.ok(x.pourquoi && x.taille && x.duree, x.outil);
  assert.equal(p[0].commande, 'winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements');
  assert.equal(p[2].commande, 'pulse-motion whisper installer');
  assert.equal(p[2].taille, '≈ 800 Mo');
  assert.equal(p[2].leger, '≈ 250 Mo');
  assert.equal(p[3].commande, null);
  // Jamais de sudo : sous Linux, le texte à taper à la place.
  const linux = planOutils({ ...etat, python: { ok: false, commandeSysteme: { commande: null, message: 'Dans un terminal : sudo apt install python3 python3-venv' } } },
    { plateforme: 'linux', commandeFfmpeg: 'sudo apt install ffmpeg' });
  for (const x of linux) assert.doesNotMatch(String(x.commande), /sudo/, x.outil);
  assert.equal(linux[0].commande, null);
  assert.match(linux[0].texte, /ffmpeg/);
  assert.match(linux[1].texte, /sudo apt install python3/);
  // Tout est prêt : rien à installer ; Python n'est proposé que pour la transcription.
  assert.deepEqual(planOutils({ navigateur: { ok: true }, ffmpeg: { ok: true }, transcription: { ok: true }, python: { ok: false } }), []);
  assert.deepEqual(planOutils({ navigateur: { ok: true }, ffmpeg: { ok: true }, transcription: { ok: true }, python: { ok: false } }, { plateforme: 'win32' }).map((x) => x.outil), []);
});

test('plugin : outils propose tout installer en une question', () => {
  const t = lire('skills', 'outils', 'SKILL.md');
  assert.match(t, /`pulse-motion outils --plan`/);
  assert.match(t, /« Tout installer \(Recommandé\) » · « Choisir » · « Pas maintenant »/);
  assert.match(t, /un accord pour une liste montrée/);
  assert.match(t, /une à la fois/);
  for (const c of ['winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements', 'brew install node']) {
    assert.ok(t.includes(c), c);
    assert.ok(t.split('\n---')[0].includes(`Bash(${c})`), `allowed-tools : ${c}`);
  }
  assert.match(t, /## 6\. Installer Node\.js/);
});

test('plugin : creer propose de préparer l\'ordinateur à la ronde 2 seulement si un outil manque', () => {
  const creer = lire('skills', 'creer', 'SKILL.md');
  const son = creer.slice(creer.indexOf('**Le son**'), creer.indexOf('## 2.'));
  assert.match(son, /seulement si `pulse-motion outils --plan` liste un outil utile[^\n]*« Préparer l'ordinateur pendant que je travaille : <liste> \(Recommandé\) » · « Plus tard »/);
  assert.match(creer, /installée pendant la ronde 2 : attendre sa fin si besoin/);
});

test('plugin : la consigne « relancer Claude Code » n\'apparaît qu\'en dernier recours', () => {
  for (const s of fs.readdirSync(path.join(RACINE, 'skills'))) {
    const t = lire('skills', s, 'SKILL.md');
    assert.doesNotMatch(t, /nodejs\.org, puis relancer/, s);
    for (const l of t.split('\n').filter((x) => /relancer Claude Code/.test(x))) {
      assert.match(l, /dernier recours[^\n]*relancer Claude Code|relancer Claude Code[^\n]*dernier recours/, `${s} : « ${l.slice(0, 120)}… »`);
    }
  }
});
