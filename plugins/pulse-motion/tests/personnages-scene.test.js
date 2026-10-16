'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { preparerPersonnages } = require('../scripts/lib/personnages-scene.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const V = require('../scripts/lib/voix.js');
const W = require('../moteur/wav.js');
const P = require('../scripts/lib/personnages.js');

const navigateur = trouverNavigateur();
const lu = P.lire(null);

const SCENE = `<section data-scene="chiffre">
  <style>@scope { .grand { font-size: 20cqh; } }</style>
  <p id="nombre" class="grand" data-tween="nombre 0→1250 cubic-out" data-dur="2">0</p>
  <p data-texte="legende" data-start="0.5"></p>
  <div id="chef" data-personnage="touffu" data-x="-10" data-sol="92" data-taille="50">
    <i id="entree" data-action="marcher" data-vers="30" data-start="0" data-dur="1.2"></i>
    <i id="montre" data-action="pose" data-pose="montrer" data-start="#entree:fin" data-dur="0.8"></i>
    <i data-action="expression" data-expression="joie" data-start="#montre"></i>
    <i id="salut" data-action="jouer" data-clip="coucou" data-start="#montre:fin"></i>
  </div>
</section>`;

function video(scene = SCENE) {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), scene);
  return dir;
}

test('assemblage : erreurs nommées', () => {
  const mauvais = `<section data-scene="s"><div data-personnage="geant" data-x="dix"><i data-action="danser" data-start="0"></i><i data-action="marcher" data-vers="40"></i>
    <i data-action="pose" data-pose="assise"></i><i data-action="jouer" data-clip="respiration"></i><i data-action="expression" data-expression="rage"></i></div>
    <i data-action="pose" data-pose="montrer"></i></section>`;
  const r = preparerPersonnages(mauvais, { scene: 's', lu });
  const m = r.erreurs.map((e) => e.message).join('\n');
  for (const motif of [/personnage « geant » introuvable.*touffu/, /data-x="dix" doit être un nombre/, /action « danser » : action inconnue/,
    /action « marcher » : data-dur obligatoire/, /pose « assise » introuvable/, /« respiration » est un calque/, /expression « rage » introuvable/]) {
    assert.match(m, motif);
  }
  assert.ok(r.erreurs.every((e) => e.regle === 'personnage-invalide' && e.gravite === 'erreur'));
  assert.match(m, /action « pose » hors d'un personnage/, 'action après la fermeture du conteneur');
  const imbrique = preparerPersonnages('<section><div data-personnage="touffu"><span><i data-action="pose" data-pose="montrer" data-start="0"></i></span></div></section>', { scene: 's', lu });
  assert.match(imbrique.erreurs.map((e) => e.message).join(), /hors d'un personnage/, 'action dans un sous-élément');
  const sansDebut = preparerPersonnages('<section><div data-personnage="touffu"><i data-action="expression" data-expression="joie"></i><br><i data-action="jouer" data-clip="saut"/></div></section>', { scene: 's', lu });
  assert.deepEqual(sansDebut.erreurs, []);
  assert.match(sansDebut.html, /data-expression="joie" data-start="0"><\/i>/);
  assert.match(sansDebut.html, /data-clip="saut" data-start="0" data-dur="1.3"\/>/);
});

test('assemblage : durée d\'un geste écrite, données embarquées seulement s\'il y a un personnage', () => {
  const r = preparerPersonnages(SCENE, { scene: 'chiffre', lu });
  assert.deepEqual(r.erreurs, []);
  assert.match(r.html, /data-clip="coucou" data-start="#montre:fin" data-dur="1.6"/);
  assert.deepEqual([...r.utilises.dessins], ['touffu']);
  const avec = assembler({ dossier: video(), dossierStyles: STYLES, ecrire: false });
  assert.equal(avec.ok, true, JSON.stringify(avec.erreurs));
  assert.deepEqual(avec.erreurs.filter((e) => e.regle === 'personnage-invalide'), []);
  assert.ok(avec.donnees.personnages.dessins.touffu && avec.donnees.personnages.bib.clips.marche);
  assert.match(avec.html, /M\.demarrerPersonnages\(\);/);
  const sans = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, ecrire: false });
  assert.equal(sans.donnees.personnages, undefined);
});

test('page : le personnage entre, montre, salue ; même image quel que soit l\'ordre ; décor pour le contrôle', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = video();
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  try {
    await page.aller(pathToFileURL(r.fichier).href);
    const res = await page.evaluer(`(async () => {
      await M.pret;
      const E = M.minutage.elements.chiffre;
      const racine = () => document.querySelector('#chef [data-pm-perso-racine]');
      const lire = async (t) => { await M.seek(t); const m = /translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(racine().getAttribute('transform')); return { x: +m[1], bras: document.querySelector('#chef [data-piece="brasAvant"]').getAttribute('transform') }; };
      const entree = E.entree, montre = E.montre, salut = E.salut;
      const milieu = await lire((entree.debut + entree.fin) / 2);
      const pose = await lire((montre.debut + montre.fin) / 2);
      const fin = await lire(salut.fin + 0.1);
      const encore = await lire((entree.debut + entree.fin) / 2);
      return { milieu, pose, fin, encore, decor: document.querySelector('#chef').hasAttribute('data-decor'), cache: document.querySelector('#chef svg').getAttribute('aria-hidden'),
        dureeSalut: salut.fin - salut.debut, erreurs: (M.erreurs || []).map((e) => e.message) };
    })()`);
    assert.deepEqual(res.erreurs, []);
    assert.ok(Math.abs(res.milieu.x - 0.10 * 1600) < 2, `milieu de la marche : x ${res.milieu.x}`);
    assert.ok(Math.abs(res.pose.x - 0.30 * 1600) < 1e-6, `arrêté à 30 % : ${res.pose.x}`);
    assert.notEqual(res.pose.bras, res.milieu.bras, 'la pose change le bras');
    assert.equal(JSON.stringify(res.encore), JSON.stringify(res.milieu), 'même image en revenant en arrière');
    assert.ok(Math.abs(res.dureeSalut - 1.6 / 0.8) < 0.01 || Math.abs(res.dureeSalut - 1.6) < 0.01, `durée du salut ${res.dureeSalut}`);
    assert.equal(res.decor, true);
    assert.equal(res.cache, 'true');
  } finally { await page.fermer(); }
});

test('parler : erreur sans voix ; avec la voix, la bouche suit les mots puis revient', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const sansVoix = preparerPersonnages('<section><div data-personnage="touffu"><i data-action="parler"></i></div></section>', { scene: 's', lu });
  assert.match(sansVoix.erreurs.map((e) => e.message).join(), /la scène n'a pas de voix/);
  const avec = preparerPersonnages('<section><div data-personnage="touffu"><i data-action="parler"></i></div></section>', { scene: 's', lu, voix: true });
  assert.deepEqual(avec.erreurs, []);
  assert.equal(avec.parle, true);
  const muet = { ...lu, dessins: { muet: { ...lu.dessins.touffu, visage: { ...lu.dessins.touffu.visage, bouches: { neutre: lu.dessins.touffu.visage.bouches.neutre } } } } };
  const r0 = preparerPersonnages('<section><div data-personnage="muet"><i data-action="parler"></i></div></section>', { scene: 's', lu: muet, voix: true });
  assert.deepEqual(r0.erreurs.map((e) => [e.gravite, /aucune bouche de parole/.test(e.message)]), [['alerte', true]]);
  const sansPrise = video('<section data-scene="chiffre"><div data-personnage="touffu"><i data-action="parler"></i></div></section>');
  modifierDeroule(sansPrise, (d) => { d.scenes[1].voix = { texte: 'Mille deux cent cinquante' }; });
  const rs = assembler({ dossier: sansPrise, dossierStyles: STYLES, ecrire: false });
  assert.ok(rs.erreurs.some((e) => e.regle === 'personnage-invalide' && /voix n'est pas enregistrée/.test(e.message)), JSON.stringify(rs.erreurs));

  const dir = copierProjet('projet-simple');
  const taux = 48000, x = new Float32Array(taux * 4);
  for (let i = taux / 2; i < 2.5 * taux; i++) x[i] = 0.3 * Math.sin(i / 5);
  const prise = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: W.ecrire({ taux, canaux: [x] }), texte: 'Pourquoi garder le froid' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi garder le froid', fichier: prise.relatif }; });
  const fichier = fs.readdirSync(path.join(dir, 'scenes')).find((f) => /intro/.test(f));
  const html = fs.readFileSync(path.join(dir, 'scenes', fichier), 'utf8');
  fs.writeFileSync(path.join(dir, 'scenes', fichier), html.replace(/<\/section>\s*$/, '<div id="parleur" data-personnage="touffu" data-x="80" data-vue="90"><i data-action="parler"></i></div>\n</section>\n'));
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  try {
    await page.aller(pathToFileURL(r.fichier).href);
    const res = await page.evaluer(`(async () => {
      await M.pret;
      const visible = () => [...document.querySelectorAll('#parleur [data-bouche-nom]')].filter((b) => { for (let e = b; e && e.id !== 'parleur'; e = e.parentNode) if (e.style && e.style.display === 'none') return false; return true; }).map((b) => b.getAttribute('data-bouche-nom'));
      const v = M.donnees.scenes[0].voix, d = M.minutage.scenes[0].debut + v.debut;
      const pendant = [];
      for (const m of v.mots) { await M.seek(d + (m.t0 + m.t1) / 2); pendant.push(visible().join()); }
      await M.seek(d + v.duree + 1);
      const apres = visible().join();
      return { pendant, apres, erreurs: (M.erreurs || []).map((e) => e.message) };
    })()`);
    assert.deepEqual(res.erreurs, []);
    assert.ok(new Set(res.pendant).size >= 2, `la bouche change pendant la voix : ${res.pendant}`);
    assert.ok(!['A', 'E', 'I', 'O', 'U', 'MBP', 'FV', 'L'].includes(res.apres), `après la voix : ${res.apres}`);
  } finally { await page.fermer(); }
});

