'use strict';
/* Spec Retouches et ergonomie (S4) 5.2 : avancement visible des travaux longs (fichier commun, commande, aperçu, bandeau,
 * consignes des compétences). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const A = require('../scripts/lib/avancement.js');
const { suivreAvancement } = require('../scripts/avancement.js');
const { surveillerAvancement } = require('../scripts/apercu.js');
const { controlerComplet } = require('../scripts/controler.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const navigateur = trouverNavigateur();
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

test('avancement : écrit de façon atomique et relu', () => {
  const dir = dossierTemporaire('pm-avancement-');
  const e = A.annoncer(dir, { travail: 'controle', libelle: 'Contrôle de la lisibilité', detail: 'scène 3 sur 6', fait: 3, total: 6 }, { maintenant: Date.parse('2026-11-10T10:00:00Z') });
  assert.deepEqual(A.lire(dir), e);
  assert.deepEqual(Object.keys(e).sort(), ['debut', 'detail', 'fait', 'fini', 'libelle', 'maj', 'ok', 'restant', 'total', 'travail']);
  assert.equal(e.fini, false);
  assert.equal(e.ok, null);
  // Aucun fichier temporaire laissé à côté (écriture par renommage).
  assert.deepEqual(fs.readdirSync(path.join(dir, '.pulse-motion')), ['avancement.json']);
  // Même travail : le début est gardé ; fin : fini, ok.
  const e2 = A.annoncer(dir, { travail: 'controle', libelle: 'Contrôle de la lisibilité', detail: 'scène 4 sur 6', fait: 4, total: 6 }, { maintenant: Date.parse('2026-11-10T10:00:20Z') });
  assert.equal(e2.debut, e.debut);
  const f = A.terminer(dir, { ok: true }, { maintenant: Date.parse('2026-11-10T10:00:40Z') });
  assert.equal(f.fini, true);
  assert.equal(f.ok, true);
  assert.equal(A.ligne(f), 'Contrôle de la lisibilité : terminé.');
  assert.throws(() => A.annoncer(dir, { travail: 'inconnu' }), /travail inconnu/);
  assert.deepEqual(A.TRAVAUX, ['fabrication', 'ebauche', 'assemblage', 'controle', 'comparaison', 'export', 'installation', 'transcription', 'voix']);
});

test('avancement : aucun fichier dans un dossier sans deroule.json, même quand la commande échoue', () => {
  const dir = dossierTemporaire('pm-avancement-hors-video-');
  const lignes = [];
  const s = A.suivre(dir, { travail: 'controle', libelle: 'Contrôle de la vidéo', ecrire: (l) => lignes.push(l) });
  s(1, 2, 'scène 1 sur 2');
  s.terminer(false, 'Le déroulé contient des erreurs : Fichier introuvable');
  assert.equal(fs.existsSync(path.join(dir, '.pulse-motion')), false, 'aucun dossier .pulse-motion hors d\'une vidéo');
  assert.match(lignes.at(-1), /échec \(Le déroulé contient des erreurs/);
  // Dans une vidéo, le fichier est écrit.
  fs.writeFileSync(path.join(dir, 'deroule.json'), '{}\n', 'utf8');
  const s2 = A.suivre(dir, { travail: 'controle', libelle: 'Contrôle de la vidéo', ecrire: () => {} });
  s2(1, 2);
  assert.equal(A.lire(dir).travail, 'controle');
});

test('avancement : restant absent avant 10 % puis calculé', () => {
  const dir = dossierTemporaire('pm-avancement-');
  const t0 = Date.parse('2026-11-10T10:00:00Z');
  A.annoncer(dir, { travail: 'export', libelle: 'Export de la vidéo', fait: 0, total: 100 }, { maintenant: t0 });
  assert.equal(A.annoncer(dir, { travail: 'export', libelle: 'Export', fait: 5, total: 100 }, { maintenant: t0 + 2000 }).restant, null);
  // 10 % en 4 s : 36 s restantes.
  assert.equal(A.annoncer(dir, { travail: 'export', libelle: 'Export', fait: 10, total: 100 }, { maintenant: t0 + 4000 }).restant, 36);
  // Après 5 s, même sous 10 % : 5 % en 6 s, 114 s restantes.
  const dir2 = dossierTemporaire('pm-avancement-');
  A.annoncer(dir2, { travail: 'controle', fait: 0, total: 100 }, { maintenant: t0 });
  assert.equal(A.annoncer(dir2, { travail: 'controle', fait: 5, total: 100 }, { maintenant: t0 + 6000 }).restant, 114);
  // L'export donne le sien (estimation sur ses mesures) : il est gardé tel quel.
  assert.equal(A.annoncer(dir, { travail: 'export', fait: 11, total: 100, restant: 72.4 }, { maintenant: t0 + 5000 }).restant, 72);
  assert.equal(A.ligne(A.lire(dir)), 'export : 11 %, encore environ 1 min 12 s.');
  assert.equal(A.estimerRestant({ fait: 1, total: 100, ecoule: 1 }), null);
});

test('controler : avancement par scène pendant le rendu', async () => {
  const dir = copierProjet('projet-simple');
  const appels = [];
  const avancement = (fait, total, detail) => appels.push({ fait, total, detail });
  let fini = null;
  avancement.terminer = (ok) => { fini = ok; };
  const mesurer = async (opts) => {
    // Le rendu annonce chaque scène dont il relève les images.
    opts.surScene(1, 2, 'intro');
    opts.surScene(2, 2, 'chiffre');
    return { renduVerifie: true, ajustements: [], problemes: [] };
  };
  const prouver = async () => ({ determinisme: null, lancee: false, scenes: [], duree: 0, problemes: [] });
  await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false, complet: true, mesurer, prouver, avancement });
  const details = appels.map((a) => a.detail);
  assert.deepEqual(details.filter((d) => /^scène \d sur \d$/.test(d)), ['scène 1 sur 2', 'scène 2 sur 2']);
  assert.ok(details.indexOf('scène 1 sur 2') > details.findIndex((d) => /vidéo rendue dans le navigateur/.test(d)));
  for (let k = 1; k < appels.length; k++) assert.ok(appels[k].fait >= appels[k - 1].fait, 'toujours en avant');
  assert.equal(fini, true);
});

test('exporter : une ligne en français par palier de 10 % avec le temps restant (voie fidèle)', () => {
  const { suiviProgression } = require('../scripts/exporter.js');
  const lignes = [];
  const etats = [];
  let t = 0;
  const suivre = suiviProgression({ ecrire: (l) => lignes.push(l), maintenant: () => t, surEtat: (f, total, restant) => etats.push({ f, total, restant }) });
  for (let n = 1; n <= 100; n++) { t = n / 10; suivre(n, 100, {}); }
  assert.equal(lignes.length, 11);
  for (const l of lignes.slice(1, -1)) assert.match(l, /^Export : \d+ % \(image \d+ \/ 100\) – encore environ \d/);
  // Chaque appel nourrit aussi le fichier d'avancement, avec le temps restant de l'estimation.
  assert.equal(etats.length, 100);
  assert.ok(etats.slice(20).every((e) => e.restant !== null && e.restant >= 0));
});

test('avancement --suivre : une ligne par changement et fin avec le travail', async () => {
  const dir = dossierTemporaire('pm-avancement-');
  // Un travail fini avant le lancement est ignoré.
  A.terminer(dir, { ok: true }, { maintenant: Date.now() - 60000 });
  const lignes = [];
  const suivi = suivreAvancement({ projet: dir, ecrire: (l) => lignes.push(l), intervalle: 20, max: 20 });
  await attendre(60);
  A.annoncer(dir, { travail: 'controle', libelle: 'Contrôle de la vidéo', detail: 'scène 1 sur 2', fait: 1, total: 4 });
  await attendre(80);
  A.annoncer(dir, { travail: 'controle', libelle: 'Contrôle de la vidéo', detail: 'scène 1 sur 2', fait: 1, total: 4 });
  await attendre(80);
  A.annoncer(dir, { travail: 'controle', libelle: 'Contrôle de la vidéo', detail: 'scène 2 sur 2', fait: 3, total: 4 });
  await attendre(80);
  A.terminer(dir, { ok: true });
  const r = await suivi;
  assert.equal(r.ok, true);
  assert.deepEqual(lignes.map((l) => l.replace(/, encore environ [^.]*/, '')), ['Contrôle de la vidéo : scène 1 sur 2.', 'Contrôle de la vidéo : scène 2 sur 2.', 'Contrôle de la vidéo : terminé.']);
  // La commande : sans option, une ligne de résumé.
  const s = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'avancement', dir], { encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  assert.equal(s.stdout.trim(), 'Contrôle de la vidéo : terminé.');
});

test('apercu : événement avancement diffusé quand le fichier change', async () => {
  const dir = dossierTemporaire('pm-avancement-');
  const recus = [];
  const arreter = surveillerAvancement(dir, (evenement, donnees) => recus.push([evenement, donnees]), { intervalle: 30 });
  try {
    await attendre(80);
    A.annoncer(dir, { travail: 'export', libelle: 'Export de la vidéo', detail: 'image 10 sur 100', fait: 10, total: 100 });
    for (let k = 0; k < 40 && !recus.length; k++) await attendre(50);
    assert.equal(recus[0][0], 'avancement');
    assert.equal(recus[0][1].detail, 'image 10 sur 100');
  } finally { arreter(); }
  // La surveillance du réassemblage ignore .pulse-motion : seul l'événement « avancement » part.
  assert.match(lire('scripts', 'apercu.js'), /const IGNORES = \/\^\(sortie\|\\\.pulse-motion/);
});

test('lecteur : bandeau d\'avancement affiché puis retiré après la fin', { skip: !navigateur && 'Chrome ou Edge introuvable', timeout: 60000 }, async () => {
  const dir = copierProjet('projet-simple');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(a.ok, true);
  const fichier = path.join(dir, 'sortie', 'page-avancement.html');
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  // Aperçu simulé (sans serveur : pas d'EventSource) ; le bandeau reçoit les états comme l'événement « avancement ».
  fs.writeFileSync(fichier, a.html.replace('</head>', '<script>window.__PM_APERCU__ = true; window.EventSource = undefined;</script>\n</head>'));
  const page = await ouvrirPage({ navigateur, largeur: 960, hauteur: 600 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    await page.evaluer('M.pret.then(function () { return true; })');
    const etat = () => page.evaluer("(function () { var b = document.getElementById('pm-avancement'); return b ? { visible: !b.hidden, texte: b.textContent, dansScene: !!b.closest('#pm-scene') } : null; })()");
    await page.evaluer("M.afficherAvancement({ travail: 'controle', libelle: 'Contrôle de la lisibilité', detail: 'scène 3 sur 6', fait: 3, total: 6, restant: 40, fini: false, ok: null }), true");
    const e1 = await etat();
    assert.deepEqual(e1, { visible: true, texte: 'Pulse Motion travaille : contrôle de la lisibilité, scène 3 sur 6, encore environ 40 s', dansScene: false });
    await page.evaluer("M.afficherAvancement({ travail: 'controle', libelle: 'Contrôle de la lisibilité', fait: 6, total: 6, restant: 0, fini: true, ok: true }), true");
    assert.equal((await etat()).visible, true);
    await attendre(3400);
    assert.equal((await etat()).visible, false, 'retiré 3 s après la fin');
    // Un échec reste affiché, avec son message.
    await page.evaluer("M.afficherAvancement({ travail: 'export', libelle: 'Export de la vidéo', fini: true, ok: false, message: 'le navigateur s’est fermé' }), true");
    await attendre(3400);
    const e3 = await etat();
    assert.equal(e3.visible, true);
    assert.match(e3.texte, /n'a pas pu finir : export de la vidéo \(le navigateur s’est fermé\)/);
  } finally { await page.fermer(); }
});

test('plugin : creer, retoucher et exporter annoncent chaque étape longue et citent pulse-motion avancement', () => {
  for (const s of ['creer', 'retoucher', 'exporter', 'voix', 'outils']) {
    const t = lire('skills', s, 'SKILL.md');
    assert.match(t, /`pulse-motion avancement \. --suivre`/, s);
    assert.match(t.split('\n---')[0], /allowed-tools:.*\bMonitor\b/, `${s} : Monitor dans allowed-tools`);
    assert.match(t, /annonc/, `${s} : étape longue annoncée`);
  }
  assert.match(lire('skills', 'creer', 'SKILL.md'), /« J'écris les 6 scènes en parallèle, comptez environ 2 minutes\. Vous les verrez apparaître dans l'aperçu\. »|l'annoncer en une phrase avec sa durée/);
  // Les blocs injectés restent en « 2>&1 || true » (une commande injectée qui échoue annule la compétence).
  for (const s of ['reprendre', 'retoucher', 'exporter']) {
    for (const m of lire('skills', s, 'SKILL.md').matchAll(/^!`([^`]+)`$/gm)) assert.match(m[1], / 2>&1 \|\| true$/, s);
  }
});
