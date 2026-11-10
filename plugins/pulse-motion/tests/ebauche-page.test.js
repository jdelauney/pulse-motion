'use strict';
/* Spec Retouches et ergonomie (S4), plan R2 : l'ébauche dans la page (pastille « Ébauche » de l'aperçu) et l'export dans le
 * navigateur refusé tant qu'il en reste une (5.3). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ecrireEbauche } = require('../scripts/lib/ebauche.js');
const { copierExemple } = require('../scripts/modeles.js');
const { assembler } = require('../scripts/assembler.js');
const { exporterVideo } = require('../scripts/exporter.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();

/** Chaîne du froid dont seules les scènes 2 et 3 sont des ébauches. */
function projet() {
  const dir = dossierTemporaire('pm-ebauche-page-');
  assert.equal(copierExemple('formation-courte', dir).ok, true);
  for (const f of ['02-seuil.html', '03-maillons.html']) fs.rmSync(path.join(dir, 'scenes', f));
  assert.deepEqual(ecrireEbauche({ dossier: dir }).ecrites, ['seuil', 'maillons']);
  return dir;
}

test('exporter : refusé tant qu\'il reste une ébauche (export dans le navigateur, avant tout navigateur)', async () => {
  const dir = projet();
  const r = await exporterVideo({ dossier: dir, navigateur: null });
  assert.equal(r.ok, false);
  assert.match(r.message, /les scènes « seuil », « maillons » ne sont encore que des ébauches/);
  assert.deepEqual(r.ebauches, ['seuil', 'maillons']);
});

test('lecteur : pastille « Ébauche » sur les scènes en ébauche, aperçu seulement, hors de l\'image', { skip: !navigateur && 'Chrome ou Edge introuvable', timeout: 90000 }, async () => {
  const dir = projet();
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true);
  const debut = (id) => a.minutage.scenes.find((s) => s.id === id).debut + 0.5;
  fs.mkdirSync(path.join(dir, 'sortie'), { recursive: true });
  const apercu = path.join(dir, 'sortie', 'page-apercu.html');
  fs.writeFileSync(apercu, a.html.replace('</head>', '<script>window.__PM_APERCU__ = true; window.EventSource = undefined;</script>\n</head>'));
  const livree = path.join(dir, 'sortie', 'page-livree.html');
  fs.writeFileSync(livree, a.html);
  const page = await ouvrirPage({ navigateur, largeur: 960, hauteur: 600 });
  const etat = () => page.evaluer("(function () { var p = document.getElementById('pm-pastille-ebauche'); return p ? { visible: !p.hidden, texte: p.textContent, dansScene: !!p.closest('#pm-scene') } : null; })()");
  try {
    await page.aller(pathToFileURL(apercu).href);
    await page.evaluer('M.pret.then(function () { return true; })');
    await page.evaluer(`M.rendre(${debut('seuil')}), true`);
    assert.deepEqual(await etat(), { visible: true, texte: 'Ébauche', dansScene: false });
    await page.evaluer(`M.rendre(${debut('fin')}), true`);
    assert.equal((await etat()).visible, false, 'retirée sur une scène écrite');
    await page.evaluer(`M.rendre(${debut('maillons')}), true`);
    assert.equal((await etat()).visible, true);
    // La page livrée ne la montre jamais.
    await page.aller(pathToFileURL(livree).href);
    await page.evaluer('M.pret.then(function () { return true; })');
    await page.evaluer(`M.rendre(${debut('seuil')}), true`);
    assert.equal(await etat(), null);
  } finally { await page.fermer(); }
});
