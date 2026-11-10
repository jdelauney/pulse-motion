'use strict';
/* Spec Rendu et export, 5.1, 5.3, 5.6 : usages d'export (scripts/usages.json, scripts/lib/usages.js). Fonctions pures. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const U = require('../scripts/lib/usages.js');

const SIX = ['web', 'reseaux', 'presentation', 'master', 'courriel', 'brouillon'];
const MOTS_INTERDITS = /\b(CRF|codec|BT\.?709|ProRes)\b|débit/i;

test('usages.test.js › chaque usage a un nom français, ses réglages des deux voies et sa liste de fichiers joints', () => {
  const u = U.lireUsages();
  assert.equal(u.version, 1);
  assert.equal(u.defaut, 'web');
  assert.deepEqual(Object.keys(u.usages), SIX);
  for (const [nom, x] of Object.entries(u.usages)) {
    assert.match(x.nom, /^(Pour|Version) /, nom);
    for (const champ of ['pourQuoi', 'image']) {
      assert.ok(typeof x[champ] === 'string' && x[champ].length > 10, `${nom}.${champ}`);
      assert.doesNotMatch(x[champ], MOTS_INTERDITS, `${nom}.${champ} : mot technique`);
    }
    assert.doesNotMatch(x.nom, MOTS_INTERDITS, nom);
    assert.ok(['1080p', '720p', '540p', 'auto'].includes(x.definition), nom);
    assert.ok(x.ipsMax === 30 || x.ipsMax === 60, nom);
    assert.ok(x.fidele && typeof x.fidele.audio === 'number' && x.fidele.gop > 0, `${nom} : voie fidèle`);
    assert.ok(x.fidele.crf !== undefined || x.fidele.passes === 2, `${nom} : qualité ou deux passes`);
    assert.ok(x.navigateur && x.navigateur.gop > 0 && (x.navigateur.debit > 0 || x.navigateur.mode === 'constant'), `${nom} : voie navigateur`);
    assert.ok(Array.isArray(x.fichiers), `${nom} : fichiers joints`);
    assert.deepEqual(Object.keys(x.mesures).sort(), ['date', 'moParMinute', 'secondesParSeconde'], nom);
  }
  // Valeurs de départ (5.1, point 2) : le web garde la qualité d'aujourd'hui, le master celle de take-one.
  assert.equal(u.usages.web.fidele.crf, 18);
  assert.equal(u.usages.master.fidele.crf, 14);
  assert.equal(u.usages.master.fidele.preset, 'slow');
  assert.equal(u.usages.courriel.tailleMaxMo, 10);
  assert.deepEqual(SIX.filter((n) => u.usages[n].grainHz === 12), ['courriel', 'brouillon']);
});

test('usages.test.js › usage inconnu : message français qui liste les six usages', () => {
  const r = U.resoudreUsage({ pour: 'tele', deroule: {}, duree: 10 });
  assert.equal(r.erreur, 'Usage « tele » inconnu : web, reseaux, presentation, master, courriel ou brouillon.');
  assert.match(U.resoudreUsage({ qualite: '4k', duree: 10 }).erreur, /^Qualité « 4k » inconnue : 1080p, 720p ou 540p\.$/);
  assert.match(U.resoudreUsage({ ips: 200, duree: 10 }).erreur, /de 1 à 60/);
});

test('usages.test.js › sans usage : web ; --qualite et --ips priment sur l\'usage, l\'usage sur format.ips', () => {
  const deroule = { format: { ratio: '16:9', ips: 60 } };
  const web = U.resoudreUsage({ deroule, duree: 10 });
  assert.equal(web.usage, 'web');
  assert.deepEqual([web.definition, web.ips], ['1080p', 60]);
  // La présentation est à 30 images par seconde, sauf --ips 60 ; --qualite change la définition.
  assert.equal(U.resoudreUsage({ pour: 'presentation', deroule, duree: 10 }).ips, 30);
  const p = U.resoudreUsage({ pour: 'presentation', qualite: '720p', ips: 60, deroule, duree: 10 });
  assert.deepEqual([p.definition, p.ips, p.fidele.niveau, p.navigateur.codec], ['720p', 60, '4.2', 'avc1.640032']);
  assert.equal(U.resoudreUsage({ pour: 'presentation', deroule: { format: { ips: 30 } }, duree: 10 }).fidele.niveau, '4.1');
  assert.deepEqual([U.resoudreUsage({ pour: 'brouillon', deroule, duree: 10 }).definition, U.resoudreUsage({ pour: 'brouillon', deroule, duree: 10 }).ips], ['540p', 30]);
});

test('usages.test.js › débits mis à l\'échelle de la définition et des images par seconde ; tune selon le grain', () => {
  const d30 = { format: { ips: 30 } };
  const web = U.resoudreUsage({ deroule: d30, duree: 10 });
  assert.deepEqual([web.fidele.crf, web.fidele.debitMax, web.fidele.tampon, web.navigateur.debit, web.fidele.audio], [18, 8000, 16000, 6000, 160]);
  const web720 = U.resoudreUsage({ qualite: '720p', deroule: d30, duree: 10 });
  assert.deepEqual([web720.fidele.debitMax, web720.navigateur.debit], [4000, 3000]);
  const web60 = U.resoudreUsage({ deroule: { format: { ips: 60 } }, duree: 10 });
  assert.deepEqual([web60.fidele.debitMax, web60.navigateur.debit], [12000, 9000]);
  assert.equal(web.fidele.tune, 'animation');
  assert.equal(U.resoudreUsage({ deroule: { format: { ips: 30 }, post: [{ shader: 'grain' }] }, duree: 10 }).fidele.tune, 'film');
  assert.equal(U.resoudreUsage({ deroule: { format: { ips: 30 }, scenes: [{ post: [{ shader: 'grain' }] }] }, duree: 10 }).fidele.tune, 'film');
  const b = U.resoudreUsage({ pour: 'brouillon', deroule: d30, duree: 10 });
  assert.deepEqual([b.fidele.encodeur, b.fidele.preset, b.fidele.crf, b.navigateur.debit, b.navigateur.acceleration, b.navigateur.latence], ['materiel', 'veryfast', 26, 2500, 'prefer-hardware', 'realtime']);
});

test('taille-cible.test.js › calcul avant capture : V = C × 8 × 0,96 / D − A, définition selon les seuils', () => {
  // chaine-du-froid (62,5 s) en 10 Mo : 1 228,8 − 96 ≈ 1 132 kbit/s, donc 720p.
  assert.deepEqual(U.planTaille({ cible: 10e6, duree: 62.5, audio: 96 }), { definition: '720p', debitVideo: 1132 });
  assert.equal(U.planTaille({ cible: 25e6, duree: 62.5 }).definition, '1080p');
  assert.equal(U.planTaille({ cible: 10e6, duree: 180 }).definition, '540p');
  const c = U.resoudreUsage({ pour: 'courriel', deroule: { format: { ips: 60 } }, duree: 62.5 });
  assert.deepEqual([c.definition, c.ips, c.fidele.passes, c.fidele.debit, c.navigateur.mode, c.tailleMax, c.grainMax], ['720p', 30, 2, 1132, 'constant', 10e6, 12]);
  // --taille-max marche avec tout usage ; le débit reste plafonné par celui de l'usage.
  const w = U.resoudreUsage({ pour: 'web', tailleMax: 25, deroule: { format: { ips: 30 } }, duree: 7.25 });
  assert.deepEqual([w.definition, w.tailleMax, w.fidele.passes, w.fidele.debit], ['1080p', 25e6, 2, 8000]);
});

test('taille-cible.test.js › vidéo trop longue : refus avant capture, message avec la taille nécessaire et deux propositions', () => {
  const r = U.resoudreUsage({ pour: 'courriel', deroule: { format: { ips: 30 } }, duree: 370 });
  assert.match(r.erreur, /^La vidéo dure 6 min 10 s : même en petite définition, elle ne tient pas en 10 Mo \(il faudrait environ (\d+) Mo\)\. Je peux faire une version de (\d+) Mo, ou une vidéo d'une seule scène\.$/);
  const [, necessaire, proposition] = /environ (\d+) Mo\)\. Je peux faire une version de (\d+) Mo/.exec(r.erreur).map(Number);
  assert.ok(proposition >= necessaire && proposition % 5 === 0, r.erreur);
  assert.equal(r.propositionMo, proposition);
  assert.doesNotMatch(r.erreur, MOTS_INTERDITS);
});

test('usages.test.js › noms des fichiers et tailles à la française (5.6)', () => {
  assert.equal(U.nomFichier('la-chaine-du-froid', 'web'), 'la-chaine-du-froid.mp4');
  for (const u of SIX.slice(1)) assert.equal(U.nomFichier('la-chaine-du-froid', u), `la-chaine-du-froid-${u}.mp4`);
  assert.equal(U.tailleFrancaise(8.42e6), '8,4 Mo');
  assert.equal(U.tailleFrancaise(850e3), '850 Ko');
  assert.equal(U.tailleFrancaise(1.25e9), '1,3 Go');
  assert.equal(U.dureeFrancaise(370), '6 min 10 s');
  assert.equal(U.dureeFrancaise(45), '45 s');
});

test('usages.test.js › pulse-motion reference usages : une ligne par usage, les mots de la personne, sans mot technique', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'pm.js'), 'reference', 'usages'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const u of SIX) assert.match(r.stdout, new RegExp(`^\\| \`${u}\` \\(`, 'm'), u);
  assert.match(r.stdout, /LinkedIn/);
  assert.match(r.stdout, /`courriel`, avec la taille dite/);
  const lignes = r.stdout.split('\n').filter((l) => /^\| `/.test(l));
  for (const l of lignes) assert.doesNotMatch(l, MOTS_INTERDITS, l);
});
