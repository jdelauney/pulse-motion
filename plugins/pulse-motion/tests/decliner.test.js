'use strict';
/* Spec S9 (lacunes créatives), 5.2 : décliner une vidéo dans un autre format ou une autre langue, sans toucher l'original. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { decliner, listerDeclinaisons } = require('../scripts/decliner.js');
const { validerDeroule, lireDeroule } = require('../scripts/lib/deroule.js');
const { adapterScene } = require('../scripts/lib/adapter.js');
const { etatProjet } = require('../scripts/etat.js');
const { resoudreUsage } = require('../scripts/lib/usages.js');
const { miniProjet, poserVoix } = require('./aide/mini-projet.js');
const { wavSinus } = require('./aide/son.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const STYLE = path.join(RACINE, 'styles', 'clair-pedagogique');
// Scène toute faite telle que l'animateur la copie (sans le commentaire d'en-tête du style).
const toute = (type, id, textes, duree = 6) => adapterScene(fs.readFileSync(path.join(STYLE, 'scenes', `${type}.html`), 'utf8'), { type, id, duree, textes }).replace(/^\s*<!--[\s\S]*?-->\s*/, '');
const TEXTES = { etiquette: 'Hygiène', titre: 'La chaîne du froid', sous: 'En trois minutes' };

/** Projet : une scène toute faite telle quelle, une scène composée, une scène toute faite avec une caméra. */
function projet() {
  return miniProjet({ scenes: [
    { id: 'intro', type: 'titre', textes: TEXTES, html: toute('titre', 'intro', TEXTES) },
    { id: 'compo', textes: { titre: 'Les maillons' }, html: '<h2 class="titre" data-texte="titre" data-start="0.3" data-dur="0.6"></h2>' },
    { id: 'cam', type: 'titre', textes: TEXTES, html: toute('titre', 'cam', TEXTES).replace('<section data-scene="cam"', '<section data-scene="cam" data-camera="0 zoom 1→1.2 2"') },
  ] });
}

/** Empreinte de tous les fichiers d'un dossier (hors declinaisons/). */
function empreinte(dir) {
  const h = crypto.createHash('sha256');
  const visiter = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = path.join(rel, e.name);
      if (r === 'declinaisons') continue;
      if (e.isDirectory()) visiter(r);
      else h.update(`${r}\n`).update(fs.readFileSync(path.join(dir, r)));
    }
  };
  visiter('');
  return h.digest('hex');
}

test('décliner : crée declinaisons/9x16 sans toucher l\'original (empreinte des fichiers de l\'original inchangée)', () => {
  const dir = projet();
  const avant = empreinte(dir);
  const r = decliner({ dossier: dir, format: '9:16', plateforme: 'tiktok', le: '2026-11-12' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.dossier, 'declinaisons/9x16');
  assert.equal(empreinte(dir), avant);
  const cible = path.join(dir, 'declinaisons', '9x16');
  const { deroule, erreurs } = lireDeroule(cible);
  assert.deepEqual(erreurs, []);
  assert.equal(deroule.format.ratio, '9:16');
  assert.equal(deroule.format.plateforme, 'tiktok');
  assert.deepEqual(deroule.declinaison, { origine: '../..', format: '16:9', le: '2026-11-12', usage: 'reseaux' });
  assert.ok(!fs.existsSync(path.join(cible, 'sortie')) && !fs.existsSync(path.join(cible, '.historique')));
  // L'export de la déclinaison part vers les réseaux sans qu'on le dise.
  assert.equal(resoudreUsage({ deroule, duree: 10 }).usage, 'reseaux');
});

test('décliner : refuse un nom déjà pris et une commande sans option', () => {
  const dir = projet();
  assert.equal(decliner({ dossier: dir, format: '1:1' }).ok, true);
  const deja = decliner({ dossier: dir, format: '1:1' });
  assert.equal(deja.ok, false);
  assert.equal(deja.message, 'Une déclinaison « 1x1 » existe déjà : la retoucher, ou la supprimer d\'abord.');
  assert.equal(decliner({ dossier: dir }).ok, false);
  assert.match(decliner({ dossier: dir }).message, /format, la langue, ou les deux/);
  assert.match(decliner({ dossier: dir, format: '16:9' }).message, /déjà en 16:9 : rien à décliner/);
  assert.match(decliner({ dossier: dir, langue: 'fr' }).message, /déjà en français/);
  assert.match(decliner({ dossier: dir, format: '1:1', plateforme: 'tiktok' }).message, /version verticale/);
  // Une déclinaison ne se décline pas : on décline l'originale.
  assert.match(decliner({ dossier: path.join(dir, 'declinaisons', '1x1'), langue: 'en' }).message, /déjà une déclinaison/);
  assert.ok(!fs.readdirSync(path.join(dir, 'declinaisons')).some((n) => n.startsWith('.')), 'aucun dossier provisoire laissé');
});

test('décliner : scènes toutes faites recopiées, scènes composées et scènes à caméra listées dans aReecrire', () => {
  const dir = projet();
  const r = decliner({ dossier: dir, format: '9:16' });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.recopiees, ['intro', 'cam']);
  assert.deepEqual(r.aReecrire, ['compo', 'cam']);
  assert.match(r.motifs.compo, /scène composée : mise en page à revoir en 9:16/);
  assert.match(r.motifs.cam, /caméra à revoir/);
  assert.equal(r.motifs.intro, undefined, 'scène toute faite intacte : rien à réécrire');
  assert.equal(r.usage, 'reseaux');
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'declinaisons', '9x16', 'deroule.json'), 'utf8'));
  assert.equal(d.format.plateforme, 'toutes', 'sans plateforme demandée : les zones de toutes');
  // Scène toute faite retouchée : listée.
  const dir2 = projet();
  fs.writeFileSync(path.join(dir2, 'scenes', '01-intro.html'), fs.readFileSync(path.join(dir2, 'scenes', '01-intro.html'), 'utf8').replace('</section>', '<span class="trait" data-start="2"></span>\n</section>'));
  assert.match(decliner({ dossier: dir2, format: '9:16' }).motifs.intro, /retouchée à la main/);
});

test('décliner : en langue, voix retirées et textes listés dans aTraduire', async () => {
  const dir = projet();
  const d0 = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  d0.scenes[0].voix = { texte: 'Pourquoi garder le froid ?' };
  d0.voix = { provisoire: true };
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d0, null, 2));
  await poserVoix(dir, 'intro', wavSinus({ secondes: 1 }), 'Pourquoi garder le froid ?');
  const avant = empreinte(dir);
  const r = decliner({ dossier: dir, langue: 'en' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.dossier, 'declinaisons/en');
  assert.equal(empreinte(dir), avant);
  assert.deepEqual(r.voixRetirees, ['intro']);
  assert.deepEqual(r.aReecrire, []);
  assert.deepEqual(r.recopiees, []);
  const champs = r.aTraduire.map((x) => `${x.scene || ''}:${x.champ}`);
  assert.ok(champs.includes(':titre') && champs.includes('intro:textes.titre') && champs.includes('intro:voix.texte') && champs.includes('compo:textes.titre'), champs.join(' '));
  const cible = path.join(dir, 'declinaisons', 'en');
  const { deroule, erreurs } = lireDeroule(cible);
  assert.deepEqual(erreurs, []);
  assert.equal(deroule.langue, 'en');
  assert.equal(deroule.scenes[0].voix.fichier, undefined);
  assert.equal(deroule.voix.provisoire, false);
  assert.deepEqual(deroule.declinaison, { origine: '../..', langue: 'fr', le: deroule.declinaison.le });
  assert.ok(!fs.existsSync(path.join(cible, 'assets', 'voix')), 'aucune prise française copiée');
  // Format et langue ensemble : « en-9x16 ».
  assert.equal(decliner({ dossier: dir, langue: 'en-US', format: '9:16' }).dossier, 'declinaisons/en-us-9x16');
});

test('déroulé : declinaison validée, origine relative', () => {
  const base = { version: 1, titre: 't', genre: 'formation', parcours: 'rapide', format: { ratio: '9:16' }, style: 'minimal', scenes: [{ id: 'a', fichier: 'scenes/a.html', duree: 3, textes: {} }] };
  assert.deepEqual(validerDeroule({ ...base, declinaison: { origine: '../..', format: '16:9', le: '2026-11-08' } }), []);
  assert.deepEqual(validerDeroule({ ...base, declinaison: { origine: '../..', langue: 'fr', le: '2026-11-08', usage: 'reseaux' } }), []);
  const fautes = validerDeroule({ ...base, declinaison: { origine: 'D:/Atelier/video', format: '3:2', le: 'hier', usage: 'cinema', autre: 1 } });
  assert.ok(fautes.some((m) => /« declinaison\.origine » doit être le chemin relatif/.test(m)), fautes.join(' | '));
  assert.ok(fautes.some((m) => /« declinaison\.format »/.test(m)));
  assert.ok(fautes.some((m) => /« declinaison\.le »/.test(m)));
  assert.ok(fautes.some((m) => /« declinaison\.usage »/.test(m)));
  assert.ok(fautes.some((m) => /champ « autre » inconnu/.test(m)));
  assert.ok(validerDeroule({ ...base, declinaison: { origine: '../..', le: '2026-11-08' } }).some((m) => /ce qui a changé/.test(m)));
  assert.ok(validerDeroule({ ...base, declinaison: '../..' }).some((m) => /doit être un objet/.test(m)));
});

test('état : les déclinaisons d\'un projet sont listées avec format et langue', () => {
  const dir = projet();
  assert.equal(etatProjet(dir).declinaisons, undefined);
  decliner({ dossier: dir, format: '9:16' });
  decliner({ dossier: dir, langue: 'es' });
  const e = etatProjet(dir);
  assert.deepEqual(e.declinaisons.map((x) => [x.nom, x.dossier, x.format, x.langue, x.mp4]), [
    ['9x16', 'declinaisons/9x16', '9:16', 'français', null],
    ['es', 'declinaisons/es', '16:9', 'espagnol', null],
  ]);
  assert.deepEqual(listerDeclinaisons(dir).map((x) => x.nom), ['9x16', 'es']);
  // Dans une déclinaison : son origine ; accords du déroulé et du style repris.
  const dedans = etatProjet(path.join(dir, 'declinaisons', 'es'));
  assert.deepEqual(dedans.origine, { dossier: '../..', titre: 'Essai', langue: 'français' });
  assert.equal(dedans.accords.deroule, true);
  assert.equal(dedans.accords.style, true);
});

test('décliner : la déclinaison 9:16 de chaine-du-froid passe controler sans erreur après réécriture (s\'assemble et passe le contrôle sans rendu ; rendu : essai réel)', () => {
  const { controler } = require('../scripts/controler.js');
  const dir = dossierTemporaire('pm-declinaison-');
  fs.cpSync(path.join(RACINE, 'exemples', 'chaine-du-froid'), dir, { recursive: true, filter: (s) => !/[\\/](sortie|\.historique|\.pulse-motion)([\\/]|$)/.test(s) });
  const r = decliner({ dossier: dir, format: '9:16', plateforme: 'tiktok' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.aReecrire.length, 6, 'les six scènes composées sont à recomposer en vertical');
  const c = controler({ dossier: path.join(dir, r.dossier), ecrire: false });
  assert.deepEqual(c.problemes.filter((p) => p.gravite === 'erreur').map((p) => p.message), []);
});
