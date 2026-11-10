'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const F = require('../scripts/lib/ffmpeg.js');

/** Chemin normalisé selon le système qu'il désigne (C:\… : Windows ; /… : macOS, Linux), quel que soit celui qui lance. */
const N = (p) => (/^[A-Za-z]:|\\/.test(p) ? path.win32.normalize(p) : path.posix.normalize(p));
const VERSION = (v) => `ffmpeg version ${v} Copyright (c) 2000-2024 the FFmpeg developers\nbuilt with gcc`;
/** Système simulé : fichiers présents et sortie de « -version » par chemin. */
function systeme(fichiers, versions = {}) {
  const existe = (f) => fichiers.includes(N(f));
  const executer = (chemin) => { if (!existe(chemin)) throw Object.assign(new Error('introuvable'), { code: 'ENOENT' }); return VERSION(versions[N(chemin)] || '7.1-full_build-www.gyan.dev'); };
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
  const s1 = systeme([N(`${win}\\ffmpeg.exe`), N(`${win}\\ffprobe.exe`)]);
  const r1 = F.trouverFfmpeg({ env: { PM_FFMPEG: win }, plateforme: 'win32', ...s1 });
  assert.equal(r1.present, true);
  assert.equal(r1.chemin, N(`${win}\\ffmpeg.exe`));
  assert.equal(r1.cheminProbe, N(`${win}\\ffprobe.exe`));
  const r2 = F.trouverFfmpeg({ env: { PM_FFMPEG: `${win}\\ffmpeg.exe` }, plateforme: 'win32', ...s1 });
  assert.equal(r2.chemin, N(`${win}\\ffmpeg.exe`));
  const scoop = 'C:\\Users\\a\\scoop\\shims';
  const s3 = systeme([N(`${scoop}\\ffmpeg.exe`), N(`${scoop}\\ffprobe.exe`)]);
  const r3 = F.trouverFfmpeg({ env: { USERPROFILE: 'C:\\Users\\a', PATH: '' }, plateforme: 'win32', ...s3 });
  assert.equal(r3.chemin, N(`${scoop}\\ffmpeg.exe`));
  const s4 = systeme(['/usr/local/bin/ffmpeg', '/usr/local/bin/ffprobe'].map((p) => N(p)));
  const r4 = F.trouverFfmpeg({ env: { PATH: '/usr/local/bin:/usr/bin' }, plateforme: 'linux', ...s4 });
  assert.equal(r4.chemin, N('/usr/local/bin/ffmpeg'));
});

test('absent : present false, commande d\'installation et message', () => {
  const r = F.trouverFfmpeg({ env: { PATH: '' }, plateforme: 'darwin', existe: () => false, executer: () => { throw new Error('non'); } });
  assert.equal(r.present, false);
  assert.equal(r.installer, 'brew install ffmpeg');
  assert.match(r.message, /ffmpeg n'est pas installé.*brew install ffmpeg/);
});

test('trop ancien : present true, versionOk false, message qui le dit', () => {
  const p = N('/usr/bin/ffmpeg');
  const s = systeme([p, N('/usr/bin/ffprobe')], { [p]: '3.4.8' });
  const r = F.trouverFfmpeg({ env: { PATH: '/usr/bin' }, plateforme: 'linux', ...s });
  assert.equal(r.present, true);
  assert.equal(r.versionOk, false);
  assert.match(r.message, /ffmpeg 3\.4 est trop ancien : il faut la version 4\.4 ou plus récente/);
});

test('ffprobe absent à côté de ffmpeg : pas utilisable, message', () => {
  const p = N('/usr/bin/ffmpeg');
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
  const p = N('/usr/bin/ffmpeg');
  const s = { existe: (f) => [p, N('/usr/bin/ffprobe')].includes(N(f)), executer: () => 'ffmpeg version étrange-build\n' };
  const r = F.trouverFfmpeg({ env: { PATH: '/usr/bin' }, plateforme: 'linux', ...s });
  assert.equal(r.present, true);
  assert.equal(r.versionOk, true);
  assert.equal(r.version, 'inconnue');
});

test('revue : un ffmpeg trop ancien en tête du PATH n\'empêche pas d\'en trouver un récent plus loin', () => {
  const vieux = N('/opt/vieux/ffmpeg');
  const neuf = N('/usr/local/bin/ffmpeg');
  const s = systeme([vieux, N('/opt/vieux/ffprobe'), neuf, N('/usr/local/bin/ffprobe')], { [vieux]: '3.4.8', [neuf]: '6.1.1' });
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
  const local = N(path.join('.', 'ffmpeg'));
  const s1 = systeme([local, N(path.join('.', 'ffprobe'))]);
  assert.equal(F.trouverFfmpeg({ env: { PATH: '.' }, plateforme: 'linux', ...s1 }).present, false);
  const dossier = 'C:\\Program Files\\ffmpeg\\bin';
  const s2 = systeme([N(`${dossier}\\ffmpeg.exe`), N(`${dossier}\\ffprobe.exe`)]);
  assert.equal(F.trouverFfmpeg({ env: { PATH: `"${dossier}"` }, plateforme: 'win32', ...s2 }).chemin, N(`${dossier}\\ffmpeg.exe`));
});

// --- Spec Rendu et export (S5), 5.2 et 5.7 : arguments par usage, encodeur de la carte graphique du brouillon -------------

const { dossierTemporaire } = require('./aide/temporaire.js');
const U = require('../scripts/lib/usages.js');

/** ffmpeg simulé : liste d'encodeurs et résultat de l'essai d'une image par encodeur. */
function ffmpegSimule(liste, essais) {
  const appels = [];
  const executer = async (programme, args) => {
    appels.push(args);
    if (args.includes('-encoders')) return { code: 0, sortie: Buffer.from(liste.map((n) => ` V....D ${n}              encodeur`).join('\n')), erreurs: '' };
    const nom = args[args.indexOf('-c:v') + 1];
    return { code: essais[nom] ? 0 : 1, sortie: Buffer.alloc(0), erreurs: essais[nom] ? '' : 'No capable devices found' };
  };
  return { executer, appels };
}

test('ffmpeg.test.js › brouillon : encodeur matériel s\'il passe l\'essai, sinon libx264 veryfast', async () => {
  const dossier = dossierTemporaire('pm-enc-');
  const f = ffmpegSimule(['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'], { h264_nvenc: true });
  const r = await F.detecterEncodeurs({ ffmpeg: 'ffmpeg', version: '7.1', dossier, executer: f.executer, plateforme: 'win32' });
  assert.equal(r.encodeur, 'h264_nvenc');
  assert.deepEqual(r.essayes, [{ nom: 'h264_nvenc', ok: true }]);
  // Essai d'une image : une image grise, encodée puis jetée.
  const essai = f.appels.find((a) => a.includes('h264_nvenc'));
  assert.deepEqual([essai[essai.indexOf('-frames:v') + 1], essai[essai.indexOf('-f', essai.indexOf('-c:v')) + 1]], ['1', 'null']);
  // Gardé par version de ffmpeg : le second appel n'essaie plus rien.
  const f2 = ffmpegSimule([], {});
  assert.equal((await F.detecterEncodeurs({ ffmpeg: 'ffmpeg', version: '7.1', dossier, executer: f2.executer })).encodeur, 'h264_nvenc');
  assert.equal(f2.appels.length, 0);
  // Arguments : ceux de l'encodeur, étiquettes BT.709 comprises ; sans encodeur, libx264 veryfast CRF 26.
  const a = F.argsVideo({ encodeur: 'h264_nvenc', gop: 2 }, 30);
  assert.deepEqual(a.slice(0, 2), ['-c:v', 'h264_nvenc']);
  assert.ok(a.includes('-cq') && a.includes('bt709'));
  const b = U.resoudreUsage({ pour: 'brouillon', duree: 10 });
  const logiciel = F.argsVideo({ ...b.fidele, encodeur: null }, 30);
  assert.deepEqual([logiciel[1], logiciel[logiciel.indexOf('-preset') + 1], logiciel[logiciel.indexOf('-crf') + 1]], ['libx264', 'veryfast', '26']);
});

test('ffmpeg.test.js › encodeur en échec à l\'essai : jamais utilisé, aucun message à la personne', async () => {
  const dossier = dossierTemporaire('pm-enc-');
  const f = ffmpegSimule(['h264_nvenc', 'h264_qsv', 'h264_amf'], { h264_amf: true });
  const r = await F.detecterEncodeurs({ ffmpeg: 'ffmpeg', version: '6.0', dossier, executer: f.executer, plateforme: 'win32' });
  assert.equal(r.encodeur, 'h264_amf');
  assert.deepEqual(r.essayes, [{ nom: 'h264_nvenc', ok: false }, { nom: 'h264_qsv', ok: false }, { nom: 'h264_amf', ok: true }]);
  assert.equal(r.message, undefined);
  // Aucun ne passe : aucun encodeur, et rien à dire (le brouillon passe par libx264).
  const aucun = await F.detecterEncodeurs({ ffmpeg: 'ffmpeg', version: '5.0', dossier, executer: ffmpegSimule(['h264_nvenc'], {}).executer });
  assert.deepEqual([aucun.encodeur, aucun.message], [null, undefined]);
  // VideoToolbox n'est essayé que sur macOS.
  const mac = ffmpegSimule(['h264_videotoolbox'], { h264_videotoolbox: true });
  assert.equal((await F.detecterEncodeurs({ ffmpeg: 'ffmpeg', version: 'x', executer: mac.executer, plateforme: 'linux' })).encodeur, null);
  assert.equal((await F.detecterEncodeurs({ ffmpeg: 'ffmpeg', version: 'x', executer: mac.executer, plateforme: 'darwin' })).encodeur, 'h264_videotoolbox');
});

test('ffmpeg.test.js › master : jamais d\'encodeur matériel', () => {
  for (const pour of ['web', 'reseaux', 'presentation', 'master', 'courriel']) {
    const u = U.resoudreUsage({ pour, duree: 10 });
    assert.equal(u.fidele.encodeur, null, pour);
    assert.equal(F.argsVideo(u.fidele, 30)[1], 'libx264', pour);
    assert.notEqual(u.navigateur.acceleration, 'prefer-hardware', pour);
  }
  assert.equal(U.resoudreUsage({ pour: 'brouillon', duree: 10 }).fidele.encodeur, 'materiel');
});

test('ffmpeg.test.js › brouillon : même nombre d\'images avec l\'encodeur de la carte graphique et avec libx264', { skip: !(F.trouverFfmpeg().present) && 'ffmpeg absent' }, async () => {
  const o = F.trouverFfmpeg();
  const d = await F.detecterEncodeurs({ ffmpeg: o.chemin, version: o.version, dossier: dossierTemporaire('pm-enc-') });
  const { pngRGBA } = require('./aide/png.js');
  const dir = dossierTemporaire('pm-enc-');
  const compter = async (encodeur) => {
    const sortie = path.join(dir, `${encodeur || 'libx264'}.mp4`);
    async function* images() { for (let k = 0; k < 24; k++) yield pngRGBA(256, 144, (x) => [k * 10, x, 128, 255]); }
    await F.encoderSegment({ ffmpeg: o.chemin, sortie, ips: 12, reglages: { encodeur, crf: 26, preset: encodeur ? null : 'veryfast', gop: 2 }, images: images() });
    return (await F.sonder({ ffprobe: o.cheminProbe, fichier: sortie })).images;
  };
  assert.equal(await compter(null), 24);
  if (d.encodeur) assert.equal(await compter(d.encodeur), 24, d.encodeur);
});
