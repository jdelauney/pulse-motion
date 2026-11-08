'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { calculerMinutage } = require('../moteur/minutage.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

const EXEMPLE = path.join(__dirname, '..', 'exemples', 'chaine-du-froid');

function copierExemple() {
  const dir = dossierTemporaire('pm-exemple-');
  fs.cpSync(EXEMPLE, dir, { recursive: true });
  return dir;
}

test('« La chaîne du froid » : 6 scènes, 60 s', () => {
  const d = JSON.parse(fs.readFileSync(path.join(EXEMPLE, 'deroule.json'), 'utf8'));
  assert.equal(d.scenes.length, 6);
  assert.equal(calculerMinutage(d.scenes, {}).duree, 60);
});

test('« La chaîne du froid » : assemblée et contrôlée sans aucun problème', () => {
  const dir = copierExemple();
  const r = assembler({ dossier: dir });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs, []);
  assert.deepEqual(r.effets.map((e) => [e.scene, e.effet.nom, e.calque, e.ancre]), [['seuil', 'etincelles', 'avant', 'valeur']]);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid.html')));
  assert.deepEqual(controler({ dossier: dir }).problemes, []);
});

const navigateur = trouverNavigateur();
test('« La chaîne du froid » dans le navigateur : aucun débordement, chiffre « 4 » affiché à la fin', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierExemple();
  const { html } = assembler({ dossier: dir, ecrire: false });
  const verification = `<script>M.pret.then(function () { return document.fonts.ready; }).then(function () {
    var d = M.detecterDebordements(); M.rendre(16);
    var r = { debordements: d, erreurs: M.erreurs, valeur: document.getElementById('valeur').textContent };
    var pre = document.createElement('pre'); pre.id = 'verification'; pre.textContent = JSON.stringify(r); document.body.appendChild(pre);
  });</script>`;
  const fichier = path.join(dir, 'verification.html');
  fs.writeFileSync(fichier, html.replace('</body>', `${verification}\n</body>`));
  const m = /<pre id="verification">([^<]*)<\/pre>/.exec(await rendreDOM(navigateur, fichier));
  assert.ok(m, 'vérification absente');
  const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.deepEqual(r, { debordements: [], erreurs: [], valeur: '4' });
});

const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

test('« La chaîne du froid » : étincelles sur le chiffre, dessinées avec WebGPU', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierExemple();
  const { html } = assembler({ dossier: dir, ecrire: false });
  const code = `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  await M.particules.pret;
  if (!M.particules.disponible) return envoyer({ webgpu: false });
  const seuil = M.minutage.scenes.find((s) => s.id === 'seuil');
  await M.seek(seuil.debut + 2.5);
  const p = await M.particules.lirePixels('seuil', 'avant');
  let allumes = 0;
  for (let i = 3; i < p.donnees.length; i += 4) if (p.donnees[i] > 0) allumes++;
  envoyer({ allumes, erreurs: M.erreurs });
})();
</script>`;
  const r = JSON.parse(await executerPage(html.replace('</body>', `${code}
</body>`)));
  assert.deepEqual(r.erreurs, []);
  assert.ok(r.allumes > 100, `${r.allumes} pixels allumés par les étincelles`);
});

test('« La chaîne du froid » : contrôle complet de la vidéo rendue, rien à signaler, en moins de 20 s', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const { controlerComplet } = require('../scripts/controler.js');
  const dir = copierExemple();
  const debut = Date.now();
  const r = await controlerComplet({ dossier: dir, corriger: false });
  assert.equal(r.renduVerifie, true);
  assert.deepEqual(r.problemes, []);
  assert.ok(Date.now() - debut < 20000, `${Date.now() - debut} ms`);
});

// ---- Les exemples des modèles de vidéo (exemples/<modèle>/, chacun sorti d'une séance /pulse-motion:creer)
const { listerModeles, lireModele } = require('../scripts/modeles.js');
const EXEMPLES = path.join(__dirname, '..', 'exemples');
const exemplesDeModeles = () => listerModeles().map((m) => m.exemple || m.id).filter((x) => x !== 'chaine-du-froid');

test('exemples des modèles : un par modèle, avec le récit de sa séance', () => {
  assert.equal(exemplesDeModeles().length, 6);
  for (const id of exemplesDeModeles()) {
    const recit = JSON.parse(fs.readFileSync(path.join(EXEMPLES, id, 'exemple.json'), 'utf8'));
    const m = lireModele(recit.modele);
    assert.ok(m, `${id} : modèle « ${recit.modele} » inconnu`);
    assert.ok(m.phrases.includes(recit.phrase), `${id} : la phrase vient du modèle`);
    assert.equal(recit.reponses.voix, 'Pas de voix', id);
    assert.ok(Array.isArray(recit.retouches), id);
    const d = JSON.parse(fs.readFileSync(path.join(EXEMPLES, id, 'deroule.json'), 'utf8'));
    assert.equal(d.genre, m.genre, id);
    assert.equal(d.format.ratio, m.format, id);
    assert.equal(d.style, m.styles[0], id);
    assert.equal(d.sousTitres, undefined, `${id} : pas de sous-titres`);
    assert.ok(d.scenes.every((s) => s.voix === undefined), `${id} : pas de voix`);
    assert.deepEqual(d.scenes.map((s) => s.type), m.scenes.map((s) => s.type), `${id} : structure du modèle`);
  }
});

test('exemples des modèles : chacun s\'assemble et se contrôle sans aucun problème', () => {
  for (const id of exemplesDeModeles()) {
    const dir = dossierTemporaire('pm-exemple-modele-');
    fs.cpSync(path.join(EXEMPLES, id), dir, { recursive: true });
    const r = assembler({ dossier: dir });
    assert.deepEqual(r.erreurs, [], id);
    assert.deepEqual(controler({ dossier: dir }).problemes, [], id);
  }
});

test('exemples des modèles : contrôle complet de chaque vidéo rendue (débordements, zone des boutons en 9:16), rien à signaler', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const { controlerComplet } = require('../scripts/controler.js');
  for (const id of exemplesDeModeles()) {
    const dir = dossierTemporaire('pm-exemple-modele-');
    fs.cpSync(path.join(EXEMPLES, id), dir, { recursive: true });
    const r = await controlerComplet({ dossier: dir, corriger: false });
    assert.equal(r.renduVerifie, true, id);
    assert.deepEqual(r.problemes, [], id);
  }
});
