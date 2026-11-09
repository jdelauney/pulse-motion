'use strict';
/* Preuve du déterminisme (spec S2, 5.13) : scripts/lib/determinisme.js, et son appel par controlerComplet. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { calculerMinutage } = require('../moteur/minutage.js');
const D = require('../scripts/lib/determinisme.js');
const { controlerComplet } = require('../scripts/controler.js');
const { encoderPng } = require('../scripts/lib/vignette.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const SEUILS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seuils.json'), 'utf8'));

/** projet-simple dont la scène « chiffre » a le code donné (remplace son M.chaqueImage). */
function projet(code) {
  const dir = copierProjet('projet-simple');
  const f = path.join(dir, 'scenes', '02-chiffre.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/<script>[\s\S]*<\/script>/, `<script>${code}</script>`), 'utf8');
  return dir;
}
const assembler2 = (dir) => assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
const minutage = (a) => calculerMinutage(a.donnees.scenes, {}, {});

/** Page factice : chaque capture vaut image(page, t) ; ouvertures comptées. */
function fausseOuverture(image) {
  const o = { pages: 0 };
  o.ouvrir = async () => {
    const n = o.pages++;
    return { capturer: async (t) => image(n, t), fermer: async () => {} };
  };
  return o;
}
function png(t, bruit = 0) {
  const L = 64, H = 36;
  const px = new Uint8Array(L * H * 3);
  for (let i = 0; i < L * H; i++) {
    const v = (i * 7 + Math.round(t * 30) * 13) % 200 + 20;
    const b = bruit && i % 10 === 0 ? bruit : 0;
    px[i * 3] = v + b; px[i * 3 + 1] = v; px[i * 3 + 2] = v;
  }
  return encoderPng(L, H, px);
}

test('determinisme.test.js › une scène avec Math.random hors graine au chargement : rendu-hasard', sans, async () => {
  // Math.random est déjà semé par le moteur dès le chargement de la page : un hasard sans graine passe par crypto.
  const dir = projet(`var decalage = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
M.chaqueImage('chiffre', function (p) { document.querySelector('[data-scene="chiffre"] .grand').style.marginLeft = (decalage * 30) + 'cqh'; });`);
  const a = assembler2(dir);
  const r = await D.verifierDeterminisme({ assemblage: a, minutage: minutage(a), seuils: SEUILS, navigateur, ratio: '16:9', ouvrir: ouvrirCapture });
  assert.equal(r.lancee, true);
  assert.deepEqual(r.scenes, ['chiffre']);
  assert.deepEqual(r.problemes.map((p) => [p.regle, p.gravite, p.scene]), [['rendu-hasard', 'erreur', 'chiffre']]);
  assert.match(r.problemes[0].message, /ne se dessine pas deux fois pareil \(vers [\d,]+ s\)/);
  assert.ok(r.pages <= 12, `${r.pages} pages`);
});

test('determinisme.test.js › une scène qui garde une variable d\'une image à l\'autre : rendu-ordre, avec l\'instant fautif et celui qui le change', sans, async () => {
  const dir = projet(`var vues = 0;
M.chaqueImage('chiffre', function (p) { vues++; document.querySelector('[data-scene="chiffre"] .grand').style.marginLeft = (vues * 3) + 'cqh'; });`);
  const a = assembler2(dir);
  const r = await D.verifierDeterminisme({ assemblage: a, minutage: minutage(a), seuils: SEUILS, navigateur, ratio: '16:9', ouvrir: ouvrirCapture });
  assert.equal(r.problemes.length, 1);
  const p = r.problemes[0];
  assert.equal(p.regle, 'rendu-ordre');
  assert.equal(p.scene, 'chiffre');
  assert.ok(Number.isFinite(p.instant));
  assert.match(p.message, /l'image à [\d,]+ s change selon qu'on a d'abord montré l'image à [\d,]+ s/);
  const [, t, u] = p.message.match(/l'image à ([\d,]+) s change selon qu'on a d'abord montré l'image à ([\d,]+) s/);
  assert.notEqual(t, u);
});

test('determinisme.test.js › une scène qui se dessine toujours pareil : aucun problème, empreinte gardée', sans, async () => {
  const dir = projet(`M.chaqueImage('chiffre', function (p) { document.querySelector('[data-scene="chiffre"] .grand').style.marginLeft = (p * 10) + 'cqh'; });`);
  const a = assembler2(dir);
  const r = await D.verifierDeterminisme({ assemblage: a, minutage: minutage(a), seuils: SEUILS, navigateur, ratio: '16:9', ouvrir: ouvrirCapture });
  assert.deepEqual(r.problemes, []);
  assert.equal(r.pages, 2, 'une page froide, une page chauffée');
  assert.deepEqual(Object.keys(r.determinisme.empreintes), ['chiffre']);
});

test('determinisme.test.js › chaine-du-froid : aucune scène concernée, rien n\'est lancé', async () => {
  // Écart avec la spec : la scène « seuil » de chaine-du-froid a un effet d'étincelles ; elle est la seule concernée.
  const dir = dossierTemporaire('pm-preuve-cdf-');
  fs.cpSync(path.join(__dirname, '..', 'exemples', 'chaine-du-froid'), dir, { recursive: true });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(D.concernees(a), [{ id: 'seuil', raisons: ['particules'], gpu: true }]);
  // Sans son effet : aucune scène concernée, aucune page ouverte.
  const seuil = path.join(dir, 'scenes', '02-seuil.html');
  fs.writeFileSync(seuil, fs.readFileSync(seuil, 'utf8').replace(/<div data-effet=[^\n]*<\/div>\n/, ''), 'utf8');
  const b = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(D.concernees(b), []);
  const f = fausseOuverture((n, t) => png(t));
  const r = await D.verifierDeterminisme({ assemblage: b, minutage: minutage(b), seuils: SEUILS, navigateur: 'chrome', ouvrir: f.ouvrir });
  assert.deepEqual([r.lancee, r.duree, f.pages], [false, 0, 0]);
});

test('determinisme.test.js › empreinte inchangée : la preuve n\'est pas refaite', async () => {
  const dir = projet(`M.chaqueImage('chiffre', function (p) { document.body.dataset.p = String(p); });`);
  const a = assembler2(dir);
  const f = fausseOuverture((n, t) => png(t));
  const r1 = await D.verifierDeterminisme({ assemblage: a, minutage: minutage(a), seuils: SEUILS, navigateur: 'chrome', ouvrir: f.ouvrir });
  assert.equal(r1.lancee, true);
  assert.equal(f.pages, 2);
  const r2 = await D.verifierDeterminisme({ assemblage: a, precedent: r1.determinisme, minutage: minutage(a), seuils: SEUILS, navigateur: 'chrome', ouvrir: f.ouvrir });
  assert.deepEqual([r2.lancee, r2.duree, f.pages], [false, 0, 2]);
  // Le code de la scène change : la preuve est refaite, pour elle seule.
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), fs.readFileSync(path.join(dir, 'scenes', '02-chiffre.html'), 'utf8').replace('String(p)', 'String(p * 2)'), 'utf8');
  const b = assembler2(dir);
  const r3 = await D.verifierDeterminisme({ assemblage: b, precedent: r2.determinisme, minutage: minutage(b), seuils: SEUILS, navigateur: 'chrome', ouvrir: f.ouvrir });
  assert.deepEqual([r3.lancee, r3.scenes], [true, ['chiffre']]);
  // Un problème trouvé est repris tel quel tant que la scène ne change pas.
  const avecProbleme = { empreintes: r3.determinisme.empreintes, problemes: [{ regle: 'rendu-ordre', gravite: 'erreur', scene: 'chiffre', instant: 5, message: 'm' }] };
  const r4 = await D.verifierDeterminisme({ assemblage: b, precedent: avecProbleme, minutage: minutage(b), seuils: SEUILS, navigateur: 'chrome', ouvrir: f.ouvrir });
  assert.deepEqual([r4.lancee, r4.problemes.map((p) => p.regle)], [false, ['rendu-ordre']]);
});

test('determinisme.test.js › controlerComplet garde l\'empreinte dans controle.json et la repasse au contrôle suivant', async () => {
  const dir = projet(`M.chaqueImage('chiffre', function (p) { document.body.dataset.p = String(p); });`);
  const appels = [];
  const prouver = async (o) => { appels.push(o.precedent); return { determinisme: { empreintes: { chiffre: 'e1' }, problemes: [] }, problemes: [], lancee: !o.precedent, scenes: [], duree: 0 }; };
  const mesurer = async () => ({ renduVerifie: true, problemes: [], ajustements: [] });
  const r = await controlerComplet({ dossier: dir, dossierStyles: STYLES, mesurer, prouver, corriger: false });
  assert.equal(r.determinisme.lancee, true);
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'controle.json'), 'utf8'));
  assert.deepEqual(c.determinisme, { empreintes: { chiffre: 'e1' }, problemes: [] });
  await controlerComplet({ dossier: dir, dossierStyles: STYLES, mesurer, prouver, corriger: false });
  assert.deepEqual(appels, [null, { empreintes: { chiffre: 'e1' }, problemes: [] }]);
});

test('determinisme.test.js › une différence au-dessus de 45 dB n\'est pas un problème', async () => {
  const instants = [{ scene: 's', t: 1 }, { scene: 's', t: 2 }, { scene: 's', t: 3 }];
  // Page B (la deuxième) : un pixel sur dix décalé d'un niveau (≈ 58 dB) : tremblement du rendu, sans problème.
  const leger = fausseOuverture((n, t) => png(t, n === 1 ? 1 : 0));
  const r1 = await D.prouver({ fichierHtml: 'x', instants, ouvrir: leger.ouvrir, psnrMin: 45 });
  assert.deepEqual([r1.problemes, leger.pages], [[], 2]);
  // Décalé de 40 niveaux (≈ 28 dB) : une vraie différence, diagnostiquée (deux pages froides identiques, aucun ordre
  // qui la change : hasard tiré au chargement).
  const fort = fausseOuverture((n, t) => png(t, n === 1 ? 40 : 0));
  const r2 = await D.prouver({ fichierHtml: 'x', instants, ouvrir: fort.ouvrir, psnrMin: 45 });
  assert.deepEqual(r2.problemes.map((p) => [p.regle, p.instant]), [['rendu-hasard', 1]]);
  assert.ok(fort.pages <= 12);
});

test('determinisme.test.js › instants : 10, 50 et 90 % hors transitions, 12 au plus, milieu de chaque scène d\'abord', () => {
  const m = { scenes: [{ id: 'a', debut: 0, fin: 10, entree: 0 }, { id: 'b', debut: 9.5, fin: 20, entree: 0.5 }] };
  const attendu = [['a', 0.95], ['a', 4.75], ['a', 8.55], ['b', 11], ['b', 15], ['b', 19]];
  const obtenu = D.instantsPreuve(m, ['a', 'b'], { n: 12, ips: 30 });
  assert.deepEqual(obtenu.map((x) => x.scene), attendu.map((x) => x[0]));
  obtenu.forEach((x, k) => assert.ok(Math.abs(x.t - attendu[k][1]) <= 1 / 30 + 1e-9, `${x.t} pour ${attendu[k][1]}`));
  assert.ok(obtenu.every((x) => Number.isInteger(Math.round(x.t * 30 * 1e6) / 1e6)), 'calés sur les images');
  const six = { scenes: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, debut: i * 10, fin: i * 10 + 10, entree: 0 })) };
  const x = D.instantsPreuve(six, six.scenes.map((s) => s.id), { n: 8, ips: 30 });
  assert.equal(x.length, 8);
  assert.deepEqual([...new Set(x.map((y) => y.scene))].length, 6, 'chaque scène a au moins son milieu');
});
