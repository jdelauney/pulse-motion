'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { optionsWebGPU } = require('./aide/gpu.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const SCENE = (dir) => path.join(dir, 'scenes', '01-s.html');

function obtenir(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { corps += d; });
      res.on('end', () => resolve({ statut: res.statusCode, corps }));
    }).on('error', reject);
  });
}

async function attendre(page, condition, delai = 60000) {
  const fin = Date.now() + delai;
  for (;;) {
    try { if (await page.evaluer(`!!(${condition})`)) return; } catch { /* page en cours de rechargement */ }
    if (Date.now() > fin) throw new Error(`condition non remplie : ${condition}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Empreinte des pixels du calque avant à l'instant t (FNV-1a), et leur somme. */
const PIXELS = (t) => `(async () => {
  await M.seek(${t});
  const p = await M.particules.lirePixels('s', 'avant');
  let h = 0x811c9dc5, somme = 0;
  for (const x of p.donnees) { h = Math.imul(h ^ x, 0x01000193) >>> 0; somme += x; }
  return { h, somme };
})()`;

/** Aperçu du projet « particules » ouvert dans Chrome ; gpu : WebGPU actif ; sinon window.__PM_SANS_GPU__. */
async function avecPanneau(port, { gpu = true } = {}, fn) {
  const dir = copierProjet('projet-particules');
  const apercu = await demarrerApercu({ dossier: dir, port, dossierStyles: STYLES, dossierEffets: EFFETS, delai: 50 });
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800, gpu, options: gpu ? await optionsWebGPU() : [], delai: 90000 });
  try {
    if (!gpu) await page.envoyer('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__PM_SANS_GPU__ = true;' });
    await page.aller(apercu.url);
    await page.evaluer('M.pret.then(() => M.particules.pret).then(() => true)');
    await fn(dir, page);
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
}

test('aperçu : modules de l\'atelier servis et chargés par la page d\'aperçu, absents de la page livrée', async () => {
  const dir = copierProjet('projet-particules');
  const apercu = await demarrerApercu({ dossier: dir, port: 47430, dossierStyles: STYLES, dossierEffets: EFFETS });
  try {
    const page = (await obtenir(apercu.url)).corps;
    assert.match(page, /<script defer src="\/_pm\/atelier\/expression\.js"><\/script>\n<script defer src="\/_pm\/atelier\/recette\.js"><\/script>\n<script type="module" src="\/_pm\/atelier\/panneau\.mjs"><\/script>/);
    for (const [fichier, motif] of [['expression.js', /M\.expression/], ['recette.js', /SCHEMA/], ['editeur.mjs', /construireFormulaire/], ['panneau.mjs', /remplacerEffet/]]) {
      const r = await obtenir(`${apercu.url}_pm/atelier/${fichier}`);
      assert.equal(r.statut, 200, fichier);
      assert.match(r.corps, motif, fichier);
    }
  } finally { await apercu.fermer(); }
  const livree = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false }).html;
  assert.doesNotMatch(livree, /_pm\/atelier|construireFormulaire|panneau\.mjs|SCHEMA/);
});

test('panneau : un réglage change l\'image sans rechargement ; enregistré puis réassemblé, même image ; panneau rouvert', async (t) => {
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  await avecPanneau(47431, {}, async (dir, page) => {
    const avant = await page.evaluer(PIXELS(2.2));
    assert.ok(avant.somme > 0, 'la gerbe est dessinée');
    const r = await page.evaluer(`(async () => {
      window.__pmMarque = 'meme-page';
      await M.atelier.ouvrir('s', 0);
      const t0 = performance.now();
      await M.atelier.regler('nombre', 900);
      return { duree: performance.now() - t0, etat: M.atelier.etat(), boucle: document.querySelector('.pm-etiquette').textContent };
    })()`);
    t.diagnostic(`réglage appliqué en ${Math.round(r.duree)} ms (critère : < 100 ms sur un GPU)`);
    assert.equal(r.etat.modifie, true);
    assert.match(r.boucle, /\(boucle\)/, 'la lecture boucle sur la fenêtre de l\'effet');
    const regle = await page.evaluer(PIXELS(2.2));
    assert.notEqual(regle.h, avant.h, 'l\'image a changé');
    assert.equal(await page.evaluer('window.__pmMarque'), 'meme-page', 'sans rechargement');
    await page.evaluer('M.atelier.enregistrer().then(() => true)');
    const scene = fs.readFileSync(SCENE(dir), 'utf8');
    assert.match(scene, /<div data-effet="gerbe" data-ancre="#cible" data-start="0\.5" data-dur="3" data-reglages="nombre: 900"><\/div>/);
    assert.ok(fs.existsSync(path.join(dir, '.historique', '001')));
    await attendre(page, '!window.__pmMarque && window.M && M.atelier && M.atelier.etat().ouvert && M.atelier.etat().ordre === 0');
    await page.evaluer('M.pret.then(() => M.particules.pret).then(() => true)');
    const apres = await page.evaluer(PIXELS(2.2));
    assert.equal(apres.h, regle.h, 'image identique à celle du réglage en direct');
  });
});

test('panneau : recette complète modifiée dans le formulaire, enregistrée comme nouvel effet ; nom de la bibliothèque refusé', async (t) => {
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  await avecPanneau(47432, {}, async (dir, page) => {
    const r = await page.evaluer(`(async () => {
      await M.atelier.ouvrir('s', 0);
      M.atelier.niveau('avance');
      const champ = document.querySelector('#pm-atelier [data-chemin="rendu_calque.bloom"] input[type=text]');
      champ.value = '2';
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((ok) => setTimeout(ok, 300));
      await M.atelier.pret;
      const e = M.atelier.etat();
      const refus = await M.atelier.enregistrerComme('simple').then(() => null, (x) => x.statut);
      return { recetteModifiee: e.recetteModifiee, bloom: e.recette.rendu_calque.bloom,
        enregistrerDesactive: document.querySelector('#pm-atelier [data-action="enregistrer"]').disabled,
        refus, message: document.querySelector('#pm-atelier .pm-at-message').textContent };
    })()`);
    assert.equal(r.recetteModifiee, true);
    assert.equal(r.bloom, 2);
    assert.equal(r.enregistrerDesactive, true, 'les réglages seuls ne suffisent plus');
    assert.equal(r.refus, 409);
    assert.match(r.message, /bibliothèque/);
    await page.evaluer('M.atelier.enregistrerComme("gerbe-vive").then(() => true)');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'effets', 'gerbe-vive.json'), 'utf8')), {
      version: 1, nom: 'gerbe-vive', etend: 'gerbe', description: 'Dérivé de « gerbe » dans l\'atelier', rendu_calque: { bloom: 2 },
    });
    assert.match(fs.readFileSync(SCENE(dir), 'utf8'), /<div data-effet="gerbe-vive"[^>]*data-graine="\d+"><\/div>/);
    await attendre(page, 'window.M && M.atelier && M.atelier.etat().ouvert && document.querySelector("#pm-atelier h3") && /gerbe-vive/.test(document.querySelector("#pm-atelier h3").textContent)');
    assert.equal(await page.evaluer('M.atelier.etat().niveau'), 'avance');
  });
});

test('panneau : conflit – rechargement retenu, enregistrement refusé, bouton Recharger', async (t) => {
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  await avecPanneau(47433, {}, async (dir, page) => {
    await page.evaluer('(async () => { window.__pmMarque = 1; await M.atelier.ouvrir("s", 0); await M.atelier.regler("nombre", 500); return true; })()');
    const retouche = fs.readFileSync(SCENE(dir), 'utf8').replace('</section>', '  <!-- retouche -->\n</section>');
    fs.writeFileSync(SCENE(dir), retouche);
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(await page.evaluer('window.__pmMarque'), 1, 'la page n\'a pas été rechargée sous le réglage');
    const r = await page.evaluer(`M.atelier.enregistrer().then(() => null, (e) => ({ statut: e.statut, conflit: M.atelier.etat().conflit,
      message: document.querySelector('#pm-atelier .pm-at-message').textContent,
      bouton: !!document.querySelector('#pm-atelier [data-action="recharger"]') }))`);
    assert.deepEqual([r.statut, r.conflit, r.bouton], [409, true, true]);
    assert.match(r.message, /modifiée sur le disque/);
    assert.equal(fs.readFileSync(SCENE(dir), 'utf8'), retouche, 'la retouche n\'est pas écrasée');
  });
});

test('sans WebGPU : le bouton « Effets » affiche le message du moteur ; liste et clic dans l\'image', async (t) => {
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  await avecPanneau(47434, { gpu: false }, async (dir, page) => {
    await attendre(page, 'document.getElementById("pm-bouton-effets")');
    await page.evaluer('(document.getElementById("pm-bouton-effets").click(), true)');
    await attendre(page, 'document.querySelector("#pm-atelier .pm-at-liste button")');
    const r = await page.evaluer(`(async () => {
      M.rendre(2.2);
      const b = document.getElementById('cible').getBoundingClientRect();
      document.getElementById('pm-scene').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
      await new Promise((ok) => setTimeout(ok, 100));
      return { message: document.querySelector('#pm-atelier .pm-at-message').textContent,
        effets: document.querySelectorAll('#pm-atelier .pm-at-liste button').length,
        ordre: M.atelier.etat().ordre, lecture: document.querySelector('#pm-lecteur button').getAttribute('aria-label') };
    })()`);
    assert.equal(r.message, 'Effet non affiché : WebGPU indisponible. Ouvrez la vidéo dans Chrome ou Edge récent.');
    assert.equal(r.effets, 3);
    assert.equal(r.ordre, 0, 'le clic choisit la gerbe, ancrée sur le carré');
    assert.equal(r.lecture, 'Lecture', 'le clic ne lance pas la vidéo');
  });
});
