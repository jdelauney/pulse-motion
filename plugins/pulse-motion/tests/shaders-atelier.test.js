'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { creerRoutesAtelier } = require('../scripts/lib/routes-atelier.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};
const APLAT = { version: 1, nom: 'aplat', usage: 'fond', parametres: { teinte: { defaut: '#ff0000', type: 'couleur' }, opacite: { defaut: 1, min: 0, max: 1 } } };
const CODE_APLAT = 'fn image(coord: vec2f) -> vec4f {\n  return vec4f(R.teinte.rgb, 1.0) * R.opacite;\n}\n';
const SCENE = '<section data-scene="s">\n  <div data-effet="simple" data-calque="arriere"></div>\n  <div data-shader="aplat" data-reglages="opacite: 0.5"></div>\n  <div data-shader="aplat" data-calque="avant"></div>\n</section>\n';

function projet() {
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'shaders/aplat.json', APLAT);
  ecrire(dir, 'shaders/aplat.wgsl', CODE_APLAT);
  ecrire(dir, 'scenes/01-s.html', SCENE);
  return dir;
}

function requete(url, { methode = 'GET', corps } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: methode, headers: corps !== undefined ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let texte = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { texte += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(texte); } catch { /* pas du JSON */ } resolve({ statut: res.statusCode, json }); });
    });
    req.on('error', reject);
    req.end(corps === undefined ? undefined : JSON.stringify(corps));
  });
}

async function servir(dir, fn) {
  const routes = creerRoutesAtelier(dir, { dossierStyles: STYLES, bibliotheque: EFFETS, bibliothequeShaders: dossierTemporaire('pm-sh-vide-') });
  const serveur = http.createServer((req, res) => { if (!routes(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  try { await fn(`http://127.0.0.1:${serveur.address().port}/_pm/atelier/`); } finally { await new Promise((ok) => serveur.close(ok)); }
}

test('atelier : fonds des scènes décrits, sources d\'un shader', async () => {
  const dir = projet();
  await servir(dir, async (base) => {
    const s = (await requete(`${base}scenes`)).json.scenes[0];
    assert.equal(s.effets.length, 1);
    assert.deepEqual(s.shaders.map((f) => [f.ordre, f.nom, f.calque, f.reglages, f.usage, f.erreur]), [[0, 'aplat', 'arriere', 'opacite: 0.5', 'fond', null], [1, 'aplat', 'avant', '', 'fond', null]]);
    assert.deepEqual(Object.keys(s.shaders[0].parametres), ['teinte', 'opacite']);
    const src = (await requete(`${base}shader?nom=aplat`)).json;
    assert.equal(src.code, CODE_APLAT);
    assert.equal(src.json.usage, 'fond');
    assert.equal(src.source, 'projet');
    assert.deepEqual(src.erreurs, []);
    assert.equal((await requete(`${base}shader?nom=absent`)).statut, 404);
    assert.equal((await requete(`${base}shader?nom=..%2Fx`)).statut, 400);
  });
});

test('atelier : reglages-shader écrit sur le bon fond, refuse un réglage hors bornes, un conflit, un rang inconnu', async () => {
  const dir = projet();
  const fichier = path.join(dir, 'scenes', '01-s.html');
  await servir(dir, async (base) => {
    const s = (await requete(`${base}scenes`)).json.scenes[0];
    const corps = (o) => ({ fichier: s.fichier, empreinte: s.empreinte, scene: 's', ordre: 1, reglages: 'teinte: #0000ff', ...o });
    const hors = await requete(`${base}reglages-shader`, { methode: 'POST', corps: corps({ reglages: 'opacite: 4' }) });
    assert.equal(hors.statut, 422);
    assert.match(hors.json.message, /au-delà du maximum 1/);
    assert.equal(hors.json.erreurs[0].chemin, 'reglages.opacite');
    assert.equal((await requete(`${base}reglages-shader`, { methode: 'POST', corps: corps({ reglages: 'teinte: "x' }) })).statut, 400);
    assert.equal((await requete(`${base}reglages-shader`, { methode: 'POST', corps: corps({ ordre: 5 }) })).statut, 409);
    assert.equal(fs.readFileSync(fichier, 'utf8'), SCENE, 'rien n\'est écrit tant que c\'est refusé');
    const ok = await requete(`${base}reglages-shader`, { methode: 'POST', corps: corps() });
    assert.equal(ok.statut, 200, JSON.stringify(ok.json));
    assert.equal(fs.readFileSync(fichier, 'utf8'), SCENE.replace('<div data-shader="aplat" data-calque="avant">', '<div data-shader="aplat" data-calque="avant" data-reglages="teinte: #0000ff">'));
    assert.ok(fs.existsSync(path.join(dir, '.historique', '001')));
    const perime = await requete(`${base}reglages-shader`, { methode: 'POST', corps: corps({ reglages: 'opacite: 0.2' }) });
    assert.equal(perime.statut, 409);
    assert.equal(perime.json.conflit, true);
  });
});

const { demarrerApercu } = require('../scripts/apercu.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { optionsWebGPU } = require('./aide/gpu.js');

test('panneau : un réglage de fond change l\'image sans rechargement ; enregistré dans la scène', async (t) => {
  const navigateur = trouverNavigateur();
  if (!navigateur) return t.skip('Chrome ou Edge introuvable');
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = projet();
  ecrire(dir, 'scenes/01-s.html', '<section data-scene="s">\n  <div data-shader="aplat"></div>\n</section>\n');
  const apercu = await demarrerApercu({ dossier: dir, port: 47460, dossierStyles: STYLES, dossierEffets: EFFETS, delai: 50 });
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800, gpu: true, options: await optionsWebGPU(), delai: 90000 });
  try {
    await page.aller(apercu.url);
    await page.evaluer('M.pret.then(() => M.particules.pret).then(() => true)');
    const pixel = `(async () => { await M.seek(1); const p = await M.particules.lirePixels('s', 'arriere'); return Array.from(p.donnees.slice(0, 4)); })()`;
    const avant = await page.evaluer(pixel);
    const r = await page.evaluer(`(async () => {
      window.__pmMarque = 'meme-page';
      const bouton = !!document.getElementById('pm-bouton-effets');
      await M.atelier.ouvrir('s');
      const liste = Array.from(document.querySelectorAll('#pm-atelier [data-fond]')).map((b) => b.textContent);
      const choisi = M.atelier.choisirFond(0, 's');
      await M.atelier.reglerFond('teinte', '#0000ff');
      await M.atelier.reglerFond('opacite', 4);
      const refuse = M.atelier.etat().erreurs.map((e) => e.chemin);
      await M.atelier.reglerFond('opacite', 1);
      return { bouton, liste, choisi, refuse, genre: M.atelier.etat().genre };
    })()`);
    assert.equal(r.bouton, true, 'bouton « Effets » pour une page qui n\'a que des fonds');
    assert.deepEqual(r.liste, ['Fond : aplat']);
    assert.equal(r.choisi, true);
    assert.deepEqual(r.refuse, ['reglages.opacite'], 'réglage hors bornes marqué');
    assert.equal(r.genre, 'fond');
    const apres = await page.evaluer(pixel);
    assert.ok(avant[0] > 250 && avant[2] < 5, `rouge avant : ${avant}`);
    assert.ok(apres[2] > 250 && apres[0] < 5, `bleu après : ${apres}`);
    assert.equal(await page.evaluer('window.__pmMarque'), 'meme-page', 'sans rechargement');
    await page.evaluer('M.atelier.enregistrerFond().then(() => true)');
    assert.match(fs.readFileSync(path.join(dir, 'scenes', '01-s.html'), 'utf8'), /<div data-shader="aplat" data-reglages="teinte: #0000ff; opacite: 1"><\/div>/);
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
});

const R = require('../moteur/particules/recette.js');
const S = require('../moteur/shaders/code.js');

test('compilerPourPage : modules attachés depuis les sources de la page, module inconnu nommé', async () => {
  const E = await import(pathToFileURL(path.join(__dirname, '..', 'moteur', 'atelier', 'editeur.mjs')).href);
  const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
  const sources = new Map([['pousse', { json: { version: 1, nom: 'pousse', usage: 'module-force', parametres: { ax: { defaut: 5, min: 0, max: 50 } } },
    code: 'fn force(p: Particule, t: f32, zone: vec4f) -> vec2f { return vec2f(R.ax, 0.0); }\n' }]]);
  const recette = { version: 1, nom: 'essai', parametres: { ax: { defaut: 12, min: 0, max: 50 } },
    emetteurs: [{ nom: 'e', naissance: { debit: 10, vie: [1, 1] }, modules: { force: 'pousse' } }] };
  const r = await E.compilerPourPage(R, recette, { dur: 1, graine: 1, charte: CHARTE, reglages: 'ax: 20' }, new Map(), S, sources);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.match(r.effet.emetteurs[0].modulesWGSL.force.wgsl, /const pmForce_R_ax: f32 = 20\.0;/, 'réglage de la recette repris');
  const inconnu = await E.compilerPourPage(R, { ...recette, emetteurs: [{ ...recette.emetteurs[0], modules: { force: 'absent' } }] },
    { dur: 1, graine: 1, charte: CHARTE }, new Map(), S, sources);
  assert.equal(inconnu.ok, false);
  assert.equal(inconnu.erreurs[0].regle, 'shader-inconnu');
  assert.equal(inconnu.erreurs[0].chemin, 'modules');
  const sans = await E.compilerPourPage(R, { version: 1, nom: 'x', emetteurs: [{ nom: 'e', naissance: { debit: 10, vie: [1, 1] } }] }, { dur: 1, graine: 1, charte: CHARTE }, new Map());
  assert.equal(sans.ok, true, 'sans module : comme avant (S absent dans Node)');
});
