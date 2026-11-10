'use strict';
/* Spec Rendu et export, 5.16 : PDF des planches par l'impression du navigateur (A4 paysage, deux scènes par page), sans ffmpeg. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { planchePdf, pageHTML } = require('../scripts/planche-pdf.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { partieVisible } = require('../moteur/minutage.js');
const F = require('../scripts/lib/ffmpeg.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const outil = F.trouverFfmpeg();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;

test('planche-pdf.test.js › PDF : commence par %PDF, une page pour deux scènes, en-tête avec titre et durée', sans, async () => {
  const dir = copierProjet('projet-simple');
  // Trois scènes : deux pages.
  modifierDeroule(dir, (d) => { d.scenes.push({ ...d.scenes[0], id: 'fin', transition: 'coupe' }); d.scenes[1].chapitre = 'Le chiffre'; });
  const r = await planchePdf({ dossier: dir, dossierStyles: STYLES, navigateur });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'sortie/la-chaine-du-froid-planches.pdf');
  const pdf = fs.readFileSync(path.join(dir, r.fichier));
  assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
  assert.equal(r.pages, 2);
  assert.equal(pages(pdf), 2);
  // A4 paysage : 842 × 595 points.
  assert.match(pdf.toString('latin1'), /\/MediaBox\s*\[\s*0 0 841\.9\d* 595\.\d+\s*\]|\/MediaBox\s*\[\s*0 0 842 595\s*\]/);
  // Neuf images (trois par scène), en JPEG dans le PDF et dans sortie/planche/.
  assert.equal(r.images.length, 9);
  assert.ok((pdf.toString('latin1').match(/\/DCTDecode/g) || []).length >= 9);
  for (const f of r.images) assert.ok(fs.existsSync(path.join(dir, f)), f);
  // En-tête : titre, durée, style, date ; par scène : numéro, chapitre ou identifiant, texte.
  const html = pageHTML({ deroule: { titre: 'La chaîne du froid', style: 'test' }, duree: 61, date: '10 novembre 2026',
    scenes: [{ numero: 1, nom: 'intro', duree: 4, texte: 'Pourquoi 4 °C ?', images: ['a.jpg', 'b.jpg', 'c.jpg'] }, { numero: 2, nom: 'Le chiffre', duree: 3, texte: 'bactéries', images: [] }, { numero: 3, nom: 'fin', duree: 4, texte: '', images: [] }] });
  assert.equal((html.match(/<div class="page">/g) || []).length, 2);
  assert.match(html, /<header><h1>La chaîne du froid<\/h1><p>1 min 1 s · style test · 10 novembre 2026<\/p><\/header>/);
  assert.match(html, /<h2><span>2<\/span> Le chiffre/);
  assert.match(html, /size: 297mm 210mm/);
  assert.doesNotMatch(html, /https?:\/\//, 'aucune ressource internet');
});

test('planche-pdf.test.js › images du PDF à ≤ 2 % d\'écart des captures fidèles', { skip: sans.skip || (!(outil.present && outil.versionOk) && 'ffmpeg absent (décodage des JPEG du test)') }, async () => {
  const dir = copierProjet('projet-simple');
  const r = await planchePdf({ dossier: dir, dossierStyles: STYLES, navigateur, scenes: ['chiffre'] });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.pages, 1);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const page = path.join(dir, 'video.html');
  fs.writeFileSync(page, a.html);
  const c = await ouvrirCapture({ fichierHtml: page, largeur: 1280, hauteur: 720, navigateur });
  try {
    const i = c.minutage.scenes.findIndex((s) => s.id === 'chiffre');
    const v = partieVisible(c.minutage, i);
    for (const [k, part] of [0.35, 0.65, 0.95].entries()) {
      const t = v.debut + (v.fin - v.debut) * part;
      await c.capturer(t);
      const capture = await c.capturer(t);
      const jpeg = await F.extraireImage({ ffmpeg: outil.chemin, fichier: path.join(dir, 'sortie', 'planche', `chiffre-${k + 1}.jpg`), t: null });
      const e = F.ecartImages(jpeg, capture);
      assert.ok(e <= 0.02, `image ${k + 1} : écart ${e}`);
    }
  } finally { await c.fermer(); }
});

test('planche-pdf.test.js › fonctionne sans ffmpeg (et par pulse-motion planche --pdf)', sans, () => {
  const dir = copierProjet('projet-simple');
  // Le style de test est dans les fixtures : copié dans les styles personnels d'un dossier personnel temporaire.
  const perso = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pm-perso-'));
  fs.mkdirSync(path.join(perso, 'styles'), { recursive: true });
  fs.cpSync(path.join(STYLES, 'test'), path.join(perso, 'styles', 'test'), { recursive: true });
  // Tout lancement de ffmpeg ou de ffprobe échoue dans le processus du PDF (et ceux qu'il lance).
  const garde = path.join(perso, 'sans-ffmpeg.js');
  fs.writeFileSync(garde, `const cp = require('node:child_process');
for (const nom of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const vrai = cp[nom];
  cp[nom] = function (commande, ...reste) {
    if (/ff(mpeg|probe)/i.test(String(commande))) throw new Error('ffmpeg appelé : ' + commande);
    if (String(commande) === process.execPath) { const a = reste[0]; if (Array.isArray(a)) reste[0] = ['-r', __filename, ...a]; }
    return vrai.call(this, commande, ...reste);
  };
}`);
  const env = { ...process.env, PM_NAVIGATEUR: navigateur, PULSE_MOTION_DOSSIER: perso };
  const r = spawnSync(process.execPath, ['-r', garde, path.join(__dirname, '..', 'scripts', 'pm.js'), 'planche', dir, '--pdf'], { env, encoding: 'utf8', timeout: 120000 });
  const res = JSON.parse(r.stdout);
  assert.equal(res.ok, true, res.message || r.stderr);
  assert.equal(res.pages, 1);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid-planches.pdf')));
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'planche-pdf.js'), 'utf8'), /trouverFfmpeg|lib\/ffmpeg/);
});
