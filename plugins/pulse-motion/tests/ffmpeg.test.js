'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const F = require('../scripts/lib/ffmpeg.js');

const VERSION = (v) => `ffmpeg version ${v} Copyright (c) 2000-2024 the FFmpeg developers\nbuilt with gcc`;
/** Système simulé : fichiers présents et sortie de « -version » par chemin. */
function systeme(fichiers, versions = {}) {
  const existe = (f) => fichiers.includes(path.normalize(f));
  const executer = (chemin) => { if (!existe(chemin)) throw Object.assign(new Error('introuvable'), { code: 'ENOENT' }); return VERSION(versions[path.normalize(chemin)] || '7.1-full_build-www.gyan.dev'); };
  return { existe, executer };
}

test('version : publiée, distribution, git', () => {
  assert.deepEqual(F.lireVersion(VERSION('7.1-full_build-www.gyan.dev')), { majeure: 7, mineure: 1 });
  assert.deepEqual(F.lireVersion(VERSION('4.4.2-0ubuntu0.22.04.1')), { majeure: 4, mineure: 4 });
  assert.deepEqual(F.lireVersion(VERSION('n6.0')), { majeure: 6, mineure: 0 });
  assert.deepEqual(F.lireVersion(VERSION('N-112233-g1234abcd')), { majeure: 99, mineure: 0 });
  assert.equal(F.lireVersion('autre chose'), null);
});

test('commande d\'installation selon le système', () => {
  assert.equal(F.commandeInstallation({ plateforme: 'win32', existe: () => false }), 'winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements');
  assert.equal(F.commandeInstallation({ plateforme: 'darwin', existe: () => false }), 'brew install ffmpeg');
  assert.equal(F.commandeInstallation({ plateforme: 'linux', existe: (f) => f === '/usr/bin/apt' }), 'sudo apt install ffmpeg');
  assert.equal(F.commandeInstallation({ plateforme: 'linux', existe: (f) => f === '/usr/bin/dnf' }), 'sudo dnf install ffmpeg');
  assert.match(F.commandeInstallation({ plateforme: 'linux', existe: () => false }), /gestionnaire de paquets/);
});

test('recherche : PM_FFMPEG (fichier ou dossier), PATH, puis emplacements connus', () => {
  const win = 'C:\\outils\\ffmpeg\\bin';
  const s1 = systeme([path.normalize(`${win}\\ffmpeg.exe`), path.normalize(`${win}\\ffprobe.exe`)]);
  const r1 = F.trouverFfmpeg({ env: { PM_FFMPEG: win }, plateforme: 'win32', ...s1 });
  assert.equal(r1.present, true);
  assert.equal(r1.chemin, path.normalize(`${win}\\ffmpeg.exe`));
  assert.equal(r1.cheminProbe, path.normalize(`${win}\\ffprobe.exe`));
  const r2 = F.trouverFfmpeg({ env: { PM_FFMPEG: `${win}\\ffmpeg.exe` }, plateforme: 'win32', ...s1 });
  assert.equal(r2.chemin, path.normalize(`${win}\\ffmpeg.exe`));
  const scoop = 'C:\\Users\\a\\scoop\\shims';
  const s3 = systeme([path.normalize(`${scoop}\\ffmpeg.exe`), path.normalize(`${scoop}\\ffprobe.exe`)]);
  const r3 = F.trouverFfmpeg({ env: { USERPROFILE: 'C:\\Users\\a', PATH: '' }, plateforme: 'win32', ...s3 });
  assert.equal(r3.chemin, path.normalize(`${scoop}\\ffmpeg.exe`));
  const s4 = systeme(['/usr/local/bin/ffmpeg', '/usr/local/bin/ffprobe'].map(path.normalize));
  const r4 = F.trouverFfmpeg({ env: { PATH: '/usr/local/bin:/usr/bin' }, plateforme: 'linux', ...s4 });
  assert.equal(r4.chemin, path.normalize('/usr/local/bin/ffmpeg'));
});

test('absent : present false, commande d\'installation et message', () => {
  const r = F.trouverFfmpeg({ env: { PATH: '' }, plateforme: 'darwin', existe: () => false, executer: () => { throw new Error('non'); } });
  assert.equal(r.present, false);
  assert.equal(r.installer, 'brew install ffmpeg');
  assert.match(r.message, /ffmpeg n'est pas installé.*brew install ffmpeg/);
});

test('trop ancien : present true, versionOk false, message qui le dit', () => {
  const p = path.normalize('/usr/bin/ffmpeg');
  const s = systeme([p, path.normalize('/usr/bin/ffprobe')], { [p]: '3.4.8' });
  const r = F.trouverFfmpeg({ env: { PATH: '/usr/bin' }, plateforme: 'linux', ...s });
  assert.equal(r.present, true);
  assert.equal(r.versionOk, false);
  assert.match(r.message, /ffmpeg 3\.4 est trop ancien : il faut la version 4\.4 ou plus récente/);
});

test('ffprobe absent à côté de ffmpeg : pas utilisable, message', () => {
  const p = path.normalize('/usr/bin/ffmpeg');
  const r = F.trouverFfmpeg({ env: { PATH: '/usr/bin' }, plateforme: 'linux', ...systeme([p]) });
  assert.equal(r.present, false);
  assert.match(r.message, /ffprobe/);
});

const reel = F.trouverFfmpeg();
test('ligne de commande : pulse-motion ffmpeg (ffmpeg de cette machine)', { skip: !reel.present && 'ffmpeg absent' }, () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), 'ffmpeg'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.present, true);
  assert.equal(j.versionOk, true);
  assert.match(j.version, /^(\d+\.\d+|récente|inconnue)$/);
});

test('revue : versions git de Gyan et « git-… » reconnues ; version illisible gardée comme récente', () => {
  assert.deepEqual(F.lireVersion(VERSION('2024-03-04-git-e30369bc1c-full_build-www.gyan.dev')), { majeure: 99, mineure: 0 });
  assert.deepEqual(F.lireVersion(VERSION('git-2024-01-02-abcdef')), { majeure: 99, mineure: 0 });
  const p = path.normalize('/usr/bin/ffmpeg');
  const s = { existe: (f) => [p, path.normalize('/usr/bin/ffprobe')].includes(path.normalize(f)), executer: () => 'ffmpeg version étrange-build\n' };
  const r = F.trouverFfmpeg({ env: { PATH: '/usr/bin' }, plateforme: 'linux', ...s });
  assert.equal(r.present, true);
  assert.equal(r.versionOk, true);
  assert.equal(r.version, 'inconnue');
});

test('revue : un ffmpeg trop ancien en tête du PATH n\'empêche pas d\'en trouver un récent plus loin', () => {
  const vieux = path.normalize('/opt/vieux/ffmpeg');
  const neuf = path.normalize('/usr/local/bin/ffmpeg');
  const s = systeme([vieux, path.normalize('/opt/vieux/ffprobe'), neuf, path.normalize('/usr/local/bin/ffprobe')], { [vieux]: '3.4.8', [neuf]: '6.1.1' });
  const r = F.trouverFfmpeg({ env: { PATH: '/opt/vieux:/usr/local/bin' }, plateforme: 'linux', ...s });
  assert.equal(r.chemin, neuf);
  assert.equal(r.versionOk, true);
});

test('revue : commande à exécuter séparée du texte ; null quand il n\'y a pas de commande sûre', () => {
  const linux = F.trouverFfmpeg({ env: { PATH: '' }, plateforme: 'linux', existe: () => false, executer: () => { throw new Error('non'); } });
  assert.equal(linux.commande, null);
  assert.match(linux.installer, /gestionnaire de paquets/);
  const apt = F.trouverFfmpeg({ env: { PATH: '' }, plateforme: 'linux', existe: (x) => x === '/usr/bin/apt', executer: () => { throw new Error('non'); } });
  assert.equal(apt.commande, null, 'sudo : la personne lance la commande elle-même');
  assert.equal(apt.installer, 'sudo apt install ffmpeg');
  const win = F.trouverFfmpeg({ env: { PATH: '' }, plateforme: 'win32', existe: () => false, executer: () => { throw new Error('non'); } });
  assert.equal(win.commande, 'winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements');
});

test('revue : dossiers relatifs du PATH ignorés (un dossier de projet ne fournit pas ffmpeg), guillemets retirés', () => {
  const local = path.normalize(path.join('.', 'ffmpeg'));
  const s1 = systeme([local, path.normalize(path.join('.', 'ffprobe'))]);
  assert.equal(F.trouverFfmpeg({ env: { PATH: '.' }, plateforme: 'linux', ...s1 }).present, false);
  const dossier = 'C:\\Program Files\\ffmpeg\\bin';
  const s2 = systeme([path.normalize(`${dossier}\\ffmpeg.exe`), path.normalize(`${dossier}\\ffprobe.exe`)]);
  assert.equal(F.trouverFfmpeg({ env: { PATH: `"${dossier}"` }, plateforme: 'win32', ...s2 }).chemin, path.normalize(`${dossier}\\ffmpeg.exe`));
});
