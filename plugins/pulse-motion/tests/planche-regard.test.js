'use strict';
/* Spec « Regard et réalisation » (S2), plan S2-2, exigence 5.4 : les planches que Claude regarde avant de montrer
 * (pulse-motion planche --regard). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const R = require('../scripts/regard.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { optionsWebGPU } = require('./aide/gpu.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const SEUILS = JSON.parse(fs.readFileSync(path.join(RACINE, 'scripts', 'seuils.json'), 'utf8'));
const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable', timeout: 180000 };

/** Copie de chaine-du-froid, l'exemple livré. */
function chaineDuFroid() {
  const dir = dossierTemporaire('pm-regard-');
  fs.cpSync(path.join(RACINE, 'exemples', 'chaine-du-froid'), dir, { recursive: true });
  return dir;
}

/** Largeur et hauteur d'un PNG (en-tête IHDR). */
function taillePng(fichier) {
  const b = fs.readFileSync(fichier);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** Doctrine d'essai (la vraie, realisation.md, arrive avec le plan S2-3). */
function doctrineEssai(dir) {
  const f = path.join(dir, 'realisation-essai.md');
  fs.writeFileSync(f, '# Réalisation\n\n## L\'essentiel\n\n- x\n\n## 8. La vérité à l\'écran\n\nsecret-huit\n\n## 9. Les erreurs les plus vues\n\nerreur-neuf\n\n## 10. Clichés à éviter\n\ncliche-dix\n\n## 11. Symptôme\n\nsecret-onze\n');
  return f;
}

let premier = null;
/** Une seule passe complète sur chaine-du-froid, partagée par plusieurs tests (WebGPU si la machine l'a). */
async function passeComplete() {
  if (!premier) {
    premier = (async () => {
      const options = await optionsWebGPU();
      if (options) process.env.PM_OPTIONS_WEBGPU = options.join(' ');
      const dir = chaineDuFroid();
      const garder = path.join(dir, '..', `${path.basename(dir)}-vignettes`);
      const r = await R.planchesRegard({ dossier: dir, navigateur, doctrine: doctrineEssai(dir), garder });
      return { dir, r, garder, webgpu: Boolean(options) };
    })();
  }
  return premier;
}

test('planche-regard.test.js › chaine-du-froid : ouverture, temps forts, téléphone et bandes écrits dans sortie/regard', sans, async () => {
  const { dir, r } = await passeComplete();
  assert.equal(r.ok, true, r.message);
  assert.equal(r.capture, 'fidele');
  const fichiers = fs.readdirSync(path.join(dir, 'sortie', 'regard')).sort();
  assert.ok(fichiers.includes('ouverture.png'));
  assert.ok(fichiers.includes('bandes.png'));
  assert.ok(fichiers.some((f) => /^temps-forts-\d+\.png$/.test(f)));
  assert.ok(fichiers.some((f) => /^telephone-\d+\.png$/.test(f)));
  assert.ok(fichiers.includes('fiche.md'));
  assert.deepEqual(r.planches.map((p) => path.basename(p)).sort(), fichiers.filter((f) => f.endsWith('.png')).sort());
  assert.equal(r.fiche, 'sortie/regard/fiche.md');
  // Chaque planche tient dans ce que Claude lit sans réduire l'image.
  for (const p of r.planches) {
    const [l, h] = taillePng(path.join(dir, p));
    assert.ok(l <= 1568 && h <= 1568 && l * h <= 1150000, `${p} : ${l} × ${h}`);
  }
  // Jetons : planches lues par Claude principal (sans les bandes), au plus 10 000 pour 15 scènes (spec 5.21).
  assert.ok(r.jetonsEstimes > 0 && r.jetonsEstimes <= 10000, `${r.jetonsEstimes} jetons`);
  // Ouverture : de 0 à 3 s, toutes les 0,5 s : 7 vignettes.
  const fiche = fs.readFileSync(path.join(dir, r.fiche), 'utf8');
  assert.equal((fiche.match(/^\| ouverture\.png \|/gm) || []).length, 7);
});

test('planche-regard.test.js › une vignette 0,3 s après la fin de chaque entrée retenue, jamais après la fin stable de la scène', async () => {
  const scenes = [
    { id: 'a', stable: 4.9, entrees: [{ debut: 0.4, fin: 1.0 }, { debut: 1.2, fin: 2.0 }, { debut: 1.5, fin: 2.5 }] },
    { id: 'b', stable: 9.9, entrees: [{ debut: 5.2, fin: 9.8 }] },
    { id: 'c', stable: 12, entrees: [] },
  ];
  assert.deepEqual(R.instantsTempsForts(scenes), [
    { scene: 'a', t: 1.3 }, { scene: 'a', t: 2.8 },
    { scene: 'b', t: 9.9 },
    { scene: 'c', t: 12 },
  ]);
  assert.equal(SEUILS.regardDecalage, 0.3);
  // Sur la vraie vidéo : chaque vignette de temps fort tombe dans sa scène, avant son instant stable.
  if (!navigateur) return;
  const { garder } = await passeComplete();
  const index = JSON.parse(fs.readFileSync(path.join(garder, 'index.json'), 'utf8'));
  const temps = index.find((g) => g.nom === 'temps-forts').vignettes;
  const telephone = index.find((g) => g.nom === 'telephone').vignettes;
  for (const v of temps) {
    const stable = telephone.find((x) => x.scene === v.scene).t;
    assert.ok(v.t <= stable + 1e-9, `${v.scene} : ${v.t} après ${stable}`);
  }
});

test('planche-regard.test.js › 24 vignettes de temps forts au plus, une par scène au moins', async () => {
  const quinze = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, stable: i * 10 + 9.9, entrees: [{ debut: i * 10, fin: i * 10 + 1 }, { debut: i * 10 + 2, fin: i * 10 + 3 }] }));
  const v = R.instantsTempsForts(quinze);
  assert.equal(v.length, SEUILS.regardVignettesMax);
  assert.equal(SEUILS.regardVignettesMax, 24);
  for (const s of quinze) assert.ok(v.some((x) => x.scene === s.id), s.id);
  // Dans l'ordre de la vidéo.
  assert.deepEqual(v.map((x) => x.t), [...v.map((x) => x.t)].sort((a, b) => a - b));
  if (!navigateur) return;
  const { garder } = await passeComplete();
  const temps = JSON.parse(fs.readFileSync(path.join(garder, 'index.json'), 'utf8')).find((g) => g.nom === 'temps-forts').vignettes;
  assert.ok(temps.length <= 24);
  for (const id of ['intro', 'seuil', 'maillons', 'reflexes', 'recongeler', 'fin']) assert.ok(temps.some((x) => x.scene === id), id);
});

test('planche-regard.test.js › planche téléphone rendue à 360 px de large', sans, async () => {
  assert.equal(SEUILS.telephoneLargeur, 360);
  const m = R.miseEnPage({ ratio: '16:9', colonnes: 4, rangees: 4, largeurFixe: 360 });
  assert.equal(m.largeur, 360);
  assert.equal(m.hauteur, 203);
  const vertical = R.miseEnPage({ ratio: '9:16', colonnes: 4, rangees: 4, largeurFixe: 360 });
  assert.equal(vertical.largeur, 360);
  const { dir, r } = await passeComplete();
  const p = r.planches.find((x) => /telephone-1\.png$/.test(x));
  const [l] = taillePng(path.join(dir, p));
  const colonnes = Math.min(m.colonnes, 6);
  assert.equal(l, colonnes * 360 + (colonnes + 1) * 12, 'vignettes de 360 px, sans réduction');
});

test('planche-regard.test.js › --scenes : seules les scènes demandées', sans, async () => {
  const dir = chaineDuFroid();
  const r = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'planche', dir, '--regard', '--scenes', 'seuil,fin'], { encoding: 'utf8', timeout: 170000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const res = JSON.parse(r.stdout);
  assert.equal(res.ok, true);
  const fiche = fs.readFileSync(path.join(dir, res.fiche), 'utf8');
  const scenes = new Set([...fiche.matchAll(/^\| [a-z-]+(?:-\d+)?\.png \| \d+ \| ([a-z-]+) \|/gm)].map((m) => m[1]));
  assert.deepEqual([...scenes].sort(), ['fin', 'seuil']);
  assert.ok(!fs.existsSync(path.join(dir, 'sortie', 'regard', 'ouverture.png')), 'pas d\'ouverture sans la première scène');
  assert.doesNotMatch(fiche, /### \d+\. maillons/);
  // Scène inconnue : refusée.
  const inconnue = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'planche', dir, '--regard', '--scenes', 'nulle'], { encoding: 'utf8' });
  assert.equal(inconnue.status, 1);
  assert.match(JSON.parse(inconnue.stdout).message, /Scène inconnue : nulle/);
});

test('planche-regard.test.js › les particules apparaissent sur la planche (capture fidèle avec WebGPU)', sans, async (t) => {
  const { r, webgpu } = await passeComplete();
  if (!webgpu) return t.skip('WebGPU indisponible sans fenêtre');
  assert.equal(r.capture, 'fidele');
  assert.equal(r.particules, 'dessinees');
});

test('planche-regard.test.js › fiche : sans code ni contrôle, avec les §§ 9 et 10 de realisation.md', sans, async () => {
  const { dir, r } = await passeComplete();
  const fiche = fs.readFileSync(path.join(dir, r.fiche), 'utf8');
  assert.match(fiche, /^# Fiche de regard : « .+ »/);
  assert.match(fiche, /Genre : formation ; format : 16:9/);
  assert.match(fiche, /### 2\. seuil \(/);
  assert.match(fiche, /- Effets : etincelles/);
  assert.match(fiche, /## Index des vignettes/);
  assert.match(fiche, /## Ce qui est verrouillé/);
  assert.match(fiche, /## 9\. Les erreurs les plus vues\n\nerreur-neuf/);
  assert.match(fiche, /## 10\. Clichés à éviter\n\ncliche-dix/);
  for (const absent of [/secret-huit/, /secret-onze/, /<section|<div|data-start|@scope|```/, /controle\.json|problemes|regle/]) assert.doesNotMatch(fiche, absent);
  // Sans doctrine (avant le plan S2-3) : aucune section recopiée, la fiche reste complète.
  assert.equal(R.sectionsDoctrine(path.join(dir, 'absente.md')), '');
});

test('planche-regard.test.js › deux planches du même projet sont identiques à l\'octet', sans, async () => {
  const { dir, r } = await passeComplete();
  const avant = new Map(r.planches.map((p) => [p, fs.readFileSync(path.join(dir, p))]));
  const ficheAvant = fs.readFileSync(path.join(dir, r.fiche), 'utf8');
  const r2 = await R.planchesRegard({ dossier: dir, navigateur, doctrine: path.join(dir, 'realisation-essai.md') });
  assert.equal(r2.ok, true, r2.message);
  assert.deepEqual(r2.planches, r.planches);
  for (const p of r2.planches) assert.ok(fs.readFileSync(path.join(dir, p)).equals(avant.get(p)), p);
  assert.equal(fs.readFileSync(path.join(dir, r2.fiche), 'utf8'), ficheAvant);
});

test('planche-regard.test.js › la relecture du critique est gardée, et dite à jour tant que la page ne change pas (spec 5.5)', sans, async () => {
  const { dir, r } = await passeComplete();
  const { AXES, empreintePage } = require('../scripts/lib/relecture.js');
  const { assembler } = require('../scripts/assembler.js');
  assert.match(r.empreinte, /^[0-9a-f]{16}$/);
  assert.equal(r.empreinte, empreintePage(assembler({ dossier: dir, ecrire: false }).html));
  assert.match(fs.readFileSync(path.join(dir, r.fiche), 'utf8'), new RegExp(`- Empreinte de la page : ${r.empreinte} \\(à recopier dans critique\\.json\\)\\.`));
  const critique = {
    version: 1, empreinte: r.empreinte, message: 'm', messagePrevu: 'm', ecart: '',
    axes: Object.fromEntries(AXES.map((a) => [a, { note: 8, preuve: 'scène intro, 1 s : …' }])),
    scenes: [{ id: 'seuil', note: 7, raison: 'r' }], defauts: [], verdict: 'prete', plusFaible: 'seuil', inverifiable: [],
  };
  fs.writeFileSync(path.join(dir, 'sortie', 'regard', 'critique.json'), JSON.stringify(critique));
  const r3 = await R.planchesRegard({ dossier: dir, navigateur, scenes: ['seuil'] });
  assert.equal(r3.ok, true, r3.message);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'regard', 'critique.json')), 'critique.json gardé');
  assert.equal(r3.empreinte, r.empreinte);
  assert.deepEqual({ ...r3.relecture, erreurs: undefined }, { verdict: 'prete', plusFaible: 'seuil', aJour: true, empreinte: r.empreinte, erreurs: undefined });
  // La page change : la relecture reste, mais n'est plus à jour.
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  d.scenes[1].textes.titre = `${d.scenes[1].textes.titre || 'Titre'} !`;
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d, null, 2));
  const r4 = await R.planchesRegard({ dossier: dir, navigateur, scenes: ['seuil'] });
  assert.notEqual(r4.empreinte, r.empreinte);
  assert.equal(r4.relecture.aJour, false);
});

test('planche-regard : sans capture fidèle, repli sur la planche du navigateur (signalé)', async () => {
  const dir = chaineDuFroid();
  let demande = null;
  const r = await R.planchesRegard({
    dossier: dir, navigateur: path.join(dir, 'pas-de-navigateur.exe'),
    replier: async (o) => {
      demande = o;
      fs.mkdirSync(path.join(dir, 'sortie', 'planche'), { recursive: true });
      for (const f of ['intro-1.png', 'intro-2.png']) fs.writeFileSync(path.join(dir, 'sortie', 'planche', f), 'x');
      return { ok: true };
    },
  });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.capture, 'navigateur');
  assert.deepEqual(r.planches, ['sortie/planche/intro-1.png', 'sortie/planche/intro-2.png']);
  assert.deepEqual(demande.planche, ['intro', 'seuil', 'maillons', 'reflexes', 'recongeler', 'fin']);
});
