'use strict';
/* Spec « Mouvement vivant », plan V2 : contrôles du mouvement (5.12) dans la page (M.mesurerMouvement, contrôle de la
 * vidéo rendue), coût sur chaine-du-froid, et planche image par image (5.14). Unitaires : mouvement-controles.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { plancheCadence } = require('../scripts/regard.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const SEUILS = require('../scripts/seuils.json');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const RACINE = path.join(__dirname, '..');

const ANCIEN_CLIGNEMENT = { nom: 'clignement', description: 'ancien clignement (0.24.0)', boucle: true, duree: 3.2, additif: true,
  cles: [{ t: 0, angles: { paupieres: 0 } }, { t: 0.94, angles: { paupieres: 0 }, courbe: 'linear' }, { t: 0.955, angles: { paupieres: -0.92 }, courbe: 'linear' }, { t: 0.985, angles: { paupieres: -0.92 }, courbe: 'linear' }] };

const GESTES = `<section data-scene="gestes">
  <div id="coureur" data-personnage="touffu" data-x="5" data-taille="25"><i data-action="courir" data-vers="95" data-start="0.5" data-dur="3"></i></div>
  <div id="sobre" data-personnage="touffu" data-x="30" data-taille="25" data-vie="sobre"><i data-action="pose" data-pose="montrer" data-start="1" data-dur="3.5"></i></div>
  <div id="plein" data-personnage="touffu" data-x="55" data-taille="25"><i data-action="pose" data-pose="montrer" data-start="1" data-dur="3.5"></i></div>
  <div id="immobile" data-personnage="touffu" data-x="80" data-taille="25" data-vie="aucune"><i data-action="pose" data-pose="montrer" data-start="1" data-dur="3.5"></i></div>
</section>`;
const BOUCLES = `<section data-scene="boucles">
  <style>@keyframes pm-essai-glisse { from { translate: 0 0; } to { translate: 10px 0; } }
    @keyframes pm-essai-tourne { to { rotate: 360deg; } }
    @keyframes pm-essai-brille { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .boite { position: absolute; width: 4cqh; height: 4cqh; background: #888; }</style>
  <div id="glisse" class="boite" style="left: 10cqw; top: 10cqh; animation: pm-essai-glisse 1s linear 3;"></div>
  <div id="tourne" class="boite" style="left: 20cqw; top: 10cqh; animation: pm-essai-tourne 1s linear 3;"></div>
  <div class="etoile boite" style="left: 30cqw; top: 30cqh; animation: pm-essai-brille 1.2s ease-in-out 3;"></div>
  <div class="etoile boite" style="left: 40cqw; top: 30cqh; animation: pm-essai-brille 1.2s ease-in-out 3;"></div>
  <div class="etoile boite" style="left: 50cqw; top: 30cqh; animation: pm-essai-brille 1.2s ease-in-out 3;"></div>
  <div class="pm-v-scintille boite" data-start="0" data-dur="scene" style="left: 30cqw; top: 60cqh;"></div>
  <div class="pm-v-scintille boite" data-start="0" data-dur="scene" style="left: 40cqw; top: 60cqh;"></div>
  <div class="pm-v-scintille boite" data-start="0" data-dur="scene" style="left: 50cqw; top: 60cqh;"></div>
</section>`;
const CAMERA = `<section data-scene="camera">
  <div id="cam-dure" data-camera="x 50→30 1+1 cubic-out" style="position:absolute; inset:0"><p data-texte="titre">Dure</p></div>
  <div id="cam-douce" data-camera="x 50→30 1+1 sine-inout" style="position:absolute; inset:0"></div>
  <div id="cam-secousse" data-camera="x 50→30 2+1 cubic-out; secousse 1.2 1.9+0.4" style="position:absolute; inset:0"></div>
  <div id="cam-zoom" data-camera="zoom 1→1.3 1+0.6; zoom 1.3→1 1.7+0.6" style="position:absolute; inset:0"></div>
</section>`;

/** Projet d'essai : scènes données (id -> html, durée). */
function projet(scenes, avant = () => {}) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  scenes.forEach(([id, html], i) => fs.writeFileSync(path.join(dir, 'scenes', `0${i + 1}-${id}.html`), html));
  modifierDeroule(dir, (d) => { d.scenes = scenes.map(([id, , duree], i) => ({ id, fichier: `scenes/0${i + 1}-${id}.html`, duree, textes: {}, transition: 'coupe' })); });
  avant(dir);
  return dir;
}

async function mesurerMouvement(dir) {
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false, groupes: 'tous' });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const fichier = path.join(dir, 'mesure.html');
  fs.writeFileSync(fichier, r.html);
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    return await page.evaluer(`(async () => { await M.pret; await document.fonts.ready; return { constats: M.mesurerMouvement({ seuils: ${JSON.stringify(SEUILS)} }), erreurs: (M.erreurs || []).map((e) => e.message) }; })()`);
  } finally { await page.fermer(); }
}

test('contrôles du mouvement dans la page : geste bref, pose figée, raccord de boucle, tout en phase, à-coups de caméra', SANS, async () => {
  const dir = projet([['gestes', GESTES, 6], ['boucles', BOUCLES, 5], ['camera', CAMERA, 5]]);
  const { constats, erreurs } = await mesurerMouvement(dir);
  assert.deepEqual(erreurs, []);
  const de = (regle) => constats.filter((c) => c.regle === regle).map((c) => `${c.scene}/${c.element}`).sort();
  // geste-bref : la course n'est pas signalée ; le nouveau clignement non plus.
  assert.deepEqual(de('geste-bref'), []);
  // pose-figee : data-vie sobre seulement (pleine : repos vivant ; aucune : immobile exprès).
  assert.deepEqual(de('pose-figee'), ['gestes/sobre']);
  const figee = constats.find((c) => c.regle === 'pose-figee');
  assert.ok(figee.valeur.duree > 2.5 && figee.valeur.duree <= 3.5, JSON.stringify(figee));
  // raccord-boucle : translate 0→10 répété signalé, rotation 0→360 non.
  assert.deepEqual(de('raccord-boucle'), ['boucles/glisse']);
  // tout-en-phase : 3 étoiles au même départ ; les pm-v-scintille, chacune à sa phase (moteur, V4), non.
  assert.deepEqual(constats.filter((c) => c.regle === 'tout-en-phase').map((c) => [c.element, c.valeur]), [['.etoile', 3]]);
  // a-coup-camera : cubic-out qui démarre, et zoom avant puis arrière collés ; sine-inout et secousse non.
  assert.deepEqual(de('a-coup-camera'), ['camera/cam-dure', 'camera/cam-zoom']);
  const zoom = constats.find((c) => c.element === 'cam-zoom');
  assert.equal(zoom.valeur.retour, true);
  const dure = constats.find((c) => c.element === 'cam-dure');
  const debutCamera = 11; // gestes 6 s + boucles 5 s
  assert.ok(Math.abs(dure.instant - (debutCamera + 1)) < 0.1, String(dure.instant));

  // Par le contrôle de la vidéo rendue : alertes en français, jamais corrigées seules.
  const assemblage = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const c = await controlerRendu({ html: assemblage.html, ratio: '16:9', duree: 16, navigateur });
  assert.equal(c.renduVerifie, true);
  const regles = new Set(c.problemes.map((p) => p.regle));
  for (const r of ['pose-figee', 'raccord-boucle', 'tout-en-phase', 'a-coup-camera']) assert.ok(regles.has(r), `${r} : ${[...regles].join(', ')}`);
  assert.equal(regles.has('geste-bref'), false);
  for (const p of c.problemes.filter((x) => ['pose-figee', 'raccord-boucle', 'tout-en-phase', 'a-coup-camera'].includes(x.regle))) {
    assert.equal(p.gravite, 'alerte');
    assert.doesNotMatch(p.message, /undefined|NaN/);
  }
  // Contrôle partiel : seules les scènes demandées.
  const partiel = await controlerRendu({ html: assemblage.html, ratio: '16:9', duree: 16, navigateur, scenes: ['boucles'] });
  assert.deepEqual([...new Set(partiel.problemes.filter((p) => ['pose-figee', 'raccord-boucle', 'tout-en-phase', 'a-coup-camera'].includes(p.regle)).map((p) => p.scene))], ['boucles']);
});

test('geste-bref : l\'ancien clignement de 48 ms est signalé, le nouveau ne l\'est pas (dans la page)', SANS, async () => {
  const scene = `<section data-scene="repos"><div id="touffu" data-personnage="touffu" data-x="50" data-taille="40"></div></section>`;
  const nouveau = await mesurerMouvement(projet([['repos', scene, 8]]));
  assert.deepEqual(nouveau.constats.filter((c) => c.regle === 'geste-bref'), []);
  // Bibliothèque de la vidéo : l'ancien clignement en boucle (fermé en 48 ms, toutes les 3,2 s).
  const ancien = await mesurerMouvement(projet([['repos', scene, 8]], (dir) => {
    fs.mkdirSync(path.join(dir, 'personnages', 'clips'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'personnages', 'clips', 'clignement.json'), JSON.stringify(ANCIEN_CLIGNEMENT, null, 2));
  }));
  const g = ancien.constats.filter((c) => c.regle === 'geste-bref');
  assert.equal(g.length, 1, JSON.stringify(ancien.constats));
  assert.equal(g[0].valeur.partie, 'paupières');
  assert.ok(g[0].valeur.duree < 0.1);
});

test('perf : contrôle complet de chaine-du-froid au plus 10 % plus long', SANS, async () => {
  // Le reste du contrôle est inchangé : la passe du mouvement coûte au plus 10 % de la passe des mesures (M.mesurer).
  const r = assembler({ dossier: path.join(RACINE, 'exemples', 'chaine-du-froid'), ecrire: false, groupes: 'tous' });
  assert.equal(r.ok, true);
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pm-perf-mouvement-'));
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, r.html);
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    const t = await page.evaluer(`(async () => {
      await M.pret; await document.fonts.ready;
      const s = ${JSON.stringify(SEUILS)};
      M.mesurer({ ratio: '16:9', seuils: s }); M.mesurerMouvement({ seuils: s });
      let mesures = Infinity, mouvement = Infinity;
      for (let i = 0; i < 2; i++) {
        let t0 = performance.now(); M.mesurer({ ratio: '16:9', seuils: s }); mesures = Math.min(mesures, performance.now() - t0);
        t0 = performance.now(); M.mesurerMouvement({ seuils: s }); mouvement = Math.min(mouvement, performance.now() - t0);
      }
      return { mesures, mouvement };
    })()`);
    assert.ok(t.mouvement <= 0.1 * t.mesures, `mouvement ${t.mouvement.toFixed(0)} ms, mesures ${t.mesures.toFixed(0)} ms`);
  } finally {
    await page.fermer();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('planche --de 2 --duree 1 --pas 2 : 15 vignettes à 30 i/s, légendées', SANS, async () => {
  const scene = `<section data-scene="repos"><div id="touffu" data-personnage="touffu" data-x="50" data-taille="40"><i data-action="bondir" data-vers="60" data-start="2" data-dur="0.8"></i></div></section>`;
  const dir = projet([['repos', scene, 5]]);
  const r = await plancheCadence({ dossier: dir, scene: 'repos', de: 2, duree: 1, pas: 2, dossierStyles: STYLES, navigateur });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.vignettes, 15);
  assert.equal(r.ips, 30);
  assert.deepEqual(r.planches, ['sortie/planche/cadence-repos.png']);
  const png = fs.readFileSync(path.join(dir, 'sortie', 'planche', 'cadence-repos.png'));
  // 10 vignettes de 192 px par ligne, deux lignes, chacune avec sa légende (24 px) : 2 052 × 300 px.
  assert.equal(png.readUInt32BE(16), 10 * 192 + 11 * 12);
  assert.equal(png.readUInt32BE(20), 2 * (108 + 24) + 3 * 12);
  // Deux demandes identiques : la même planche (images de la vidéo à l'image près).
  const encore = await plancheCadence({ dossier: dir, scene: 'repos', de: 2, duree: 1, pas: 2, dossierStyles: STYLES, navigateur });
  assert.deepEqual(encore.instants, r.instants);
});
