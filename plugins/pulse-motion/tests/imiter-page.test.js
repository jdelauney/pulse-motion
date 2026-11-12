'use strict';
/* Spec S9, 5.15 (imiter une animation ou une vidéo fournie) dans Chrome sans fenêtre : GIF de test (carré qui entre en 0,5 s
 * ease-out à 1 s), MP4 décodé sans ffmpeg et deux analyses identiques, prise importée (S6), comparaison de la scène d'essai.
 * Les fichiers sont fabriqués par les tests (GIF écrit à la main, MP4 par Mediabunny) : aucun fichier livré, aucun réseau. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../scripts/lib/imiter.js');
const I = require('../scripts/lib/import.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { gifAnime } = require('./aide/gif.js');
const { fabriquerVideo } = require('./aide/video.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const cubicOut = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/** GIF 160 × 90 à 20 images par seconde (5 centièmes), 2 s : carré rouge de 30 px qui glisse de x = 10 à x = 110 en 0,5 s
 *  (cubic-out) à partir de 1 s, sur fond blanc. Palette : rouge, blanc, bleu, gris. */
function gifCarre() {
  const L = 160, H = 90, images = [];
  for (let k = 0; k < 40; k++) {
    const x0 = Math.round(10 + 100 * cubicOut((k / 20 - 1) / 0.5));
    const indices = new Array(L * H).fill(1);
    for (let y = 30; y < 60; y++) for (let x = x0; x < x0 + 30; x++) indices[y * L + x] = 0;
    images.push({ indices, centiemes: 5 });
  }
  return gifAnime({ largeur: L, hauteur: H, images, palette: [[225, 29, 72], [255, 255, 255], [29, 78, 216], [120, 120, 120]] });
}

test('imiter : GIF de test (carré qui entre en 0,5 s ease-out à 1 s) → fenêtre 1,0–1,5 s à une image près, courbe out', { ...SANS, timeout: 240000 }, async () => {
  const dir = dossierTemporaire('pm-imiter-gif-');
  fs.writeFileSync(path.join(dir, 'Carré qui entre.gif'), gifCarre());
  const r = await M.analyser({ projet: dir, source: 'Carré qui entre.gif', couleurs: '#e11d48', navigateur });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.nom, 'carre-qui-entre');
  assert.equal(r.source.fichier, 'assets/references/carre-qui-entre.gif', 'copiée dans assets/references');
  assert.ok(fs.existsSync(path.join(dir, 'assets', 'references', 'carre-qui-entre.gif')));
  assert.equal(r.source.images, 40);
  assert.equal(r.source.cadence, 20);
  assert.equal(r.fenetres.length, 1, JSON.stringify(r.fenetres));
  const f = r.fenetres[0];
  assert.ok(Math.abs(f.debut - 1) <= 0.05 + 1e-9 && Math.abs(f.fin - 1.5) <= 0.05 + 1e-9, `fenêtre ${f.debut}–${f.fin}`);
  assert.equal(r.parActivite[1].mode, 'out');
  assert.equal(r.suivi.length, 1);
  assert.match(r.suivi[0].courbe, /-out$/, JSON.stringify(r.suivi[0]));
  assert.equal(r.suivi[0].propriete, 'x');
  // Sorties : planches de 24 images (40 images : 2 planches), activité, fenêtres, suivi, couleurs, main, fiche, vignettes.
  const d = path.join(dir, r.dossier);
  assert.deepEqual(r.planches, ['sortie/imiter/carre-qui-entre/planche-01.png', 'sortie/imiter/carre-qui-entre/planche-02.png']);
  for (const x of ['activite.png', 'activite.json', 'fenetres.json', 'suivi.json', 'couleurs.json', 'main.json', 'analyse.json', 'fiche.md', 'images/0040.jpg']) assert.ok(fs.existsSync(path.join(d, x)), x);
  assert.ok(r.jetonsEstimes > 0);
  const couleurs = JSON.parse(fs.readFileSync(path.join(d, 'couleurs.json'), 'utf8'));
  assert.equal(couleurs.fond, '#ffffff');
  assert.equal(couleurs.cle, 'claire');
  assert.equal(r.styles.length, 3);
  assert.match(r.main, /bords/);
  assert.equal(M.verifierFicheImitation({ projet: dir, nom: r.nom }).ok, false, 'fiche à compléter');
});

test('imiter : vidéo MP4 décodée sans ffmpeg, mêmes résultats sur deux analyses', { ...SANS, timeout: 300000 }, async () => {
  const v = await fabriquerVideo({ navigateur, duree: 3, ips: 30, largeur: 320, hauteur: 180,
    dessin: "x.fillStyle = '#f5f0e6'; x.fillRect(0, 0, L, H); const u = Math.min(1, Math.max(0, (t - 1) / 0.6)); const p = 1 - Math.pow(1 - u, 3); x.fillStyle = '#1d3a6e'; x.fillRect(20 + 200 * p, 60, 60, 60);" });
  const dir = dossierTemporaire('pm-imiter-mp4-');
  fs.writeFileSync(path.join(dir, `pub${v.ext}`), v.octets);
  const a = await M.analyser({ projet: dir, source: `pub${v.ext}`, nom: 'premiere', navigateur });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.source.sorte, 'video');
  assert.ok(a.source.images >= 89 && a.source.images <= 90, `${a.source.images} images`);
  assert.equal(a.source.cadence, 30);
  assert.equal(a.fenetres.length, 1, JSON.stringify(a.fenetres));
  assert.ok(Math.abs(a.fenetres[0].debut - 1) <= 1 / 30 + 1e-6, `début ${a.fenetres[0].debut}`);
  // Fin d'un cubic-out : les derniers pas font moins d'un dixième de point, sous le moindre changement visible.
  assert.ok(Math.abs(a.fenetres[0].fin - 1.6) <= 0.1 + 1e-6, `fin ${a.fenetres[0].fin}`);
  assert.equal(a.parActivite[1].mode, 'out');
  const b = await M.analyser({ projet: dir, source: `pub${v.ext}`, nom: 'seconde', navigateur });
  assert.equal(b.ok, true);
  for (const f of ['activite.json', 'fenetres.json', 'couleurs.json', 'main.json']) {
    assert.equal(fs.readFileSync(path.join(dir, 'sortie', 'imiter', 'seconde', f), 'utf8'), fs.readFileSync(path.join(dir, 'sortie', 'imiter', 'premiere', f), 'utf8'), f);
  }
  const pal = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'imiter', 'premiere', 'couleurs.json'), 'utf8'));
  assert.ok(pal.couleurs.length >= 2 && pal.couleurs.length <= 6);
});

test('imiter : une prise importée par « filmer » (S6) s\'analyse, sans copie dans assets/references', { ...SANS, timeout: 240000 }, async () => {
  const dir = dossierTemporaire('pm-imiter-prise-');
  fs.writeFileSync(path.join(dir, 'anim.gif'), gifCarre());
  const imp = await I.importer({ projet: dir, fichier: 'anim.gif', nom: 'anim', navigateur, ffmpeg: null });
  assert.equal(imp.ok, true, JSON.stringify(imp));
  const r = await M.analyser({ projet: dir, source: 'films/anim', navigateur });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.source.sorte, 'prise');
  assert.equal(r.source.origine, 'films/anim/prise-01');
  assert.equal(r.source.cadence, 30);
  assert.equal(r.fenetres.length, 1);
  assert.ok(Math.abs(r.fenetres[0].debut - 1) <= 0.05 + 1e-6 && Math.abs(r.fenetres[0].fin - 1.5) <= 0.05 + 1e-6, JSON.stringify(r.fenetres[0]));
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'references')), false);
});

test('imiter : comparer rend les écarts de début, fin et pic ; ≤ 0,08 s sur la scène d\'essai', { ...SANS, timeout: 300000 }, async () => {
  // La scène d'essai : le même carré, le même minutage (1 s, 0,5 s, cubic-out), sur un fond uni qui couvre le décor du style.
  const scene = [
    '<div data-decor style="position: absolute; inset: 0; background: #ffffff"></div>',
    '<div id="carre" data-decor style="position: absolute; left: 11cqh; top: 33cqh; width: 33cqh; height: 33cqh; background: #e11d48; translate: var(--dx, 0cqh) 0"',
    ' data-start="1" data-dur="0.5" data-tween="--dx 0cqh→111cqh cubic-out"></div>',
  ].join('');
  const dir = miniProjet({ scenes: [{ id: 'essai', html: scene, duree: 2.5, transition: 'coupe' }] });
  fs.writeFileSync(path.join(dir, 'carre.gif'), gifCarre());
  const a = await M.analyser({ projet: dir, source: 'carre.gif', niveau: 'mouvement', navigateur });
  assert.equal(a.ok, true, JSON.stringify(a));
  const r = await M.comparer({ projet: dir, nom: 'carre', scene: 'essai', navigateur });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.niveau, 'mouvement');
  assert.deepEqual(r.fenetres, { reference: 1, scene: 1 });
  assert.equal(r.ecarts.length, 1);
  for (const k of ['debut', 'fin', 'pic']) assert.ok(Math.abs(r.ecarts[0][k]) <= 0.08 + 1e-9, `${k} : ${r.ecarts[0][k]}`);
  assert.ok(r.ecartMax <= 0.08);
  assert.equal(r.conforme, true);
  assert.ok(Math.abs(r.decalage) <= 0.05, `décalage ${r.decalage}`);
  assert.deepEqual(r.planches, ['sortie/imiter/carre/comparaison-essai.png']);
  assert.ok(fs.existsSync(path.join(dir, r.planches[0])));
  assert.ok(r.alertes.some((x) => /fiche/.test(x)), 'fiche encore à compléter');
  // La scène finit plus tard que la référence : l'écart est dit en chiffres.
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, d.scenes[0].fichier), `<section data-scene="essai">${scene.replace('data-dur="0.5"', 'data-dur="0.8"')}</section>`);
  const lent = await M.comparer({ projet: dir, nom: 'carre', scene: 'essai', navigateur });
  assert.equal(lent.ok, true);
  assert.equal(lent.conforme, false);
  assert.ok(lent.phrases.some((p) => /finit 0,\d+ s plus tard que dans votre vidéo/.test(p)), lent.phrases.join(' / '));
});
