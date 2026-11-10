'use strict';
/* Spec Retouches et ergonomie (S4) 5.8, 5.10 et 5.12 dans Chrome : mode remarque et élément sous le clic, repères des
 * remarques, forme d'onde de la voix, vignettes des scènes, comparaison de deux versions ; et les pages assemblées qui
 * n'en contiennent rien. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const R = require('../scripts/lib/remarques.js');
const H = require('../scripts/historique.js');
const V = require('../scripts/lib/voix.js');
const W = require('../moteur/wav.js');
const { demarrerApercu } = require('../scripts/apercu.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sansNavigateur = !navigateur && 'Chrome ou Edge introuvable';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendre(page, condition, delai = 30000) {
  const fin = Date.now() + delai;
  for (;;) {
    try { if (await page.evaluer(`!!(${condition})`)) return; } catch { /* page en cours de chargement */ }
    if (Date.now() > fin) throw new Error(`condition non remplie : ${condition}`);
    await pause(150);
  }
}

/** Aperçu du projet ouvert dans Chrome : fn(page, apercu). */
async function avecApercu(dir, port, fn, chemin = '') {
  const apercu = await demarrerApercu({ dossier: dir, port, dossierStyles: STYLES, delai: 50 });
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800 });
  try {
    await page.aller(apercu.url + chemin);
    if (!chemin) {
      await page.evaluer('M.pret.then(() => true)');
      await attendre(page, 'M.remarquesApercu && M.pisteApercu && document.getElementById("pm-bouton-remarque")');
    }
    await fn(page, apercu);
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
}

/** Clic au centre d'un élément (ou au point x, y de #pm-scene, en fractions), sur l'élément qui s'y trouve. */
const CLIC = (selecteur, fx = null, fy = null) => `(function () {
  var b = ${selecteur ? `document.querySelector(${JSON.stringify(selecteur)})` : "document.getElementById('pm-scene')"}.getBoundingClientRect();
  var x = b.left + b.width * ${fx === null ? 0.5 : fx}, y = b.top + b.height * ${fy === null ? 0.5 : fy};
  document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  return true;
})()`;

test('lecteur : mode remarque, le clic épingle au lieu de mettre en pause', { skip: sansNavigateur, timeout: 90000 }, async () => {
  const dir = copierProjet('projet-simple');
  await avecApercu(dir, 47871, async (page) => {
    // Hors du mode remarque, le clic sur l'image garde son rôle : lecture.
    await page.evaluer(CLIC(null));
    assert.equal(await page.evaluer('M.lecteur.enLecture()'), true);
    await page.evaluer('M.lecteur.pause(), M.rendre(2), true');
    // Touche N : mode remarque ; le clic met en pause et épingle.
    await page.evaluer("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true })), true");
    assert.equal(await page.evaluer('M.remarquesApercu.mode()'), true);
    await page.evaluer('M.lecteur.jouer(), true');
    await page.evaluer(CLIC('[data-texte="titre"]'));
    assert.equal(await page.evaluer('M.lecteur.enLecture()'), false, 'en pause');
    const attente = await page.evaluer('M.remarquesApercu.attente()');
    assert.ok(attente && attente.x > 0 && attente.x < 1 && attente.scene === 'intro', JSON.stringify(attente));
    assert.equal(await page.evaluer("!!document.getElementById('pm-epingle') && !document.getElementById('pm-epingle').closest('#pm-scene')"), true, 'épingle hors de l\'image');
    assert.equal(await page.evaluer("!document.getElementById('pm-remarques').hidden && !!document.getElementById('pm-remarques').hasAttribute('data-pm-clavier')"), true);
    // Garder la remarque : écrite avec son image (capture de l'instant, JPEG), sans que l'espace tapé ne lance la lecture.
    await page.evaluer("var c = document.querySelector('#pm-remarques textarea'); c.focus(); c.value = 'le titre arrive trop tôt'; c.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); true");
    assert.equal(await page.evaluer('M.lecteur.enLecture()'), false, 'le panneau garde le clavier');
    await page.evaluer("[...document.querySelectorAll('#pm-remarques button')].find((b) => b.textContent === 'Garder la remarque').click(), true");
    await attendre(page, 'M.remarquesApercu.liste().length === 1');
    const gardee = R.lire(dir).remarques[0];
    assert.deepEqual([gardee.texte, gardee.scene, gardee.element, gardee.image], ['le titre arrive trop tôt', 'intro', 'titre', 'r-0001.jpg']);
    const jpeg = fs.readFileSync(path.join(R.dossierRemarques(dir), 'r-0001.jpg'));
    assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
    // Quitter le mode : le clic relance la lecture.
    await page.evaluer("document.getElementById('pm-bouton-remarque').click(), true");
    assert.equal(await page.evaluer('M.remarquesApercu.mode()'), false);
    await page.evaluer(CLIC(null));
    assert.equal(await page.evaluer('M.lecteur.enLecture()'), true);
  });
});

test('remarques : element trouvé sous le clic', { skip: sansNavigateur, timeout: 90000 }, async () => {
  const dir = copierProjet('projet-simple');
  await avecApercu(dir, 47872, async (page) => {
    await page.evaluer('M.rendre(2), M.remarquesApercu.basculer(true), true');
    await page.evaluer(CLIC('[data-texte="sous"]'));
    assert.equal((await page.evaluer('M.remarquesApercu.attente()')).element, 'sous');
    await page.evaluer(CLIC('#titre'));
    assert.equal((await page.evaluer('M.remarquesApercu.attente()')).element, 'titre');
    // Dans la scène 2 : le texte de la légende.
    await page.evaluer('M.rendre(M.minutage.scenes[1].debut + 1.5), true');
    await page.evaluer(CLIC('[data-texte="legende"]'));
    const a = await page.evaluer('M.remarquesApercu.attente()');
    assert.deepEqual([a.scene, a.element], ['chiffre', 'legende']);
    assert.ok(a.tScene > 1.4 && a.tScene < 1.6, String(a.tScene));
  });
});

test('lecteur : repères des remarques sur la piste', { skip: sansNavigateur, timeout: 90000 }, async () => {
  const dir = copierProjet('projet-simple');
  R.creer(dir, { portee: 'epingle', t: 1, x: 0.5, y: 0.5, texte: 'ouverte' });
  R.creer(dir, { portee: 'image', t: 4, texte: 'faite' });
  R.creer(dir, { portee: 'video', texte: 'sur toute la vidéo' });
  const d = R.lire(dir);
  d.remarques[1].etat = 'faite';
  fs.writeFileSync(R.fichierRemarques(dir), JSON.stringify(d));
  await avecApercu(dir, 47873, async (page) => {
    await attendre(page, "document.querySelectorAll('.pm-reperes-remarques span').length === 2");
    const reperes = await page.evaluer("[...document.querySelectorAll('.pm-reperes-remarques span')].map((s) => ({ etat: s.dataset.etat, gauche: parseFloat(s.style.left), dansPiste: !!s.closest('.pm-piste'), couleur: getComputedStyle(s).backgroundColor }))");
    const duree = await page.evaluer('M.duree');
    assert.deepEqual(reperes.map((r) => r.etat), ['ouverte', 'faite']);
    assert.ok(Math.abs(reperes[0].gauche - 100 / duree) < 0.01);
    assert.ok(Math.abs(reperes[1].gauche - 400 / duree) < 0.01);
    assert.ok(reperes.every((r) => r.dansPiste));
    assert.notEqual(reperes[0].couleur, reperes[1].couleur, 'ouvertes et faites en couleurs différentes');
  });
});

// --- 5.12 : forme d'onde et vignettes ---------------------------------------------------------------------------------

const taux = 48000;
function wavParole(secondes) {
  const x = new Float32Array(Math.round((secondes + 1) * taux));
  for (let i = taux / 2; i < (secondes + 0.5) * taux; i++) x[i] = 0.3 * Math.sin(i / 5) * (1 + Math.sin(i / 4000));
  return W.ecrire({ taux, canaux: [x] });
}
async function projetAvecVoix() {
  const dir = copierProjet('projet-simple');
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: wavParole(3), texte: 'Pourquoi garder le froid' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi garder le froid', fichier: r.relatif }; });
  return dir;
}

test('lecteur : forme d\'onde présente seulement avec une voix', { skip: sansNavigateur, timeout: 90000 }, async () => {
  await avecApercu(copierProjet('projet-simple'), 47874, async (page) => {
    await pause(1500);
    assert.equal(await page.evaluer("!!document.getElementById('pm-onde')"), false);
    assert.equal(await page.evaluer('M.pisteApercu.forme()'), null);
  });
  await avecApercu(await projetAvecVoix(), 47875, async (page) => {
    await attendre(page, 'M.pisteApercu.forme() && M.pisteApercu.forme().colonnes > 0');
    const f = await page.evaluer("(function () { var o = document.getElementById('pm-onde'); var p = document.querySelector('#pm-lecteur .pm-piste'); return { forme: M.pisteApercu.forme(), largeur: Math.round(o.getBoundingClientRect().width), canvas: o.querySelector('canvas').width, piste: Math.round(p.getBoundingClientRect().width), dansScene: !!o.closest('#pm-scene') }; })()");
    assert.equal(f.canvas, f.largeur, 'une colonne par pixel');
    assert.ok(Math.abs(f.largeur - f.piste) <= 1, 'sous la piste, sur toute sa largeur');
    assert.equal(f.forme.mots, 4, 'les mots calés de la voix');
    assert.equal(f.dansScene, false);
    // Pics normalisés : le plus fort vaut 1.
    const pics = await page.evaluer('(function () { var p = M.pisteApercu.picsParColonne(new Float32Array([0, 0.2, -0.4, 0.1]), 2); return [p[0], p[1]]; })()');
    assert.deepEqual(pics.map((x) => Math.round(x * 100) / 100), [0.5, 1]);
  });
});

test('lecteur : clic sur la forme d\'onde se place à l\'instant', { skip: sansNavigateur, timeout: 90000 }, async () => {
  await avecApercu(await projetAvecVoix(), 47876, async (page) => {
    await attendre(page, 'M.pisteApercu.forme() && M.pisteApercu.forme().colonnes > 0');
    await page.evaluer(CLIC('#pm-onde', 0.5, 0.5));
    const [t, duree] = await page.evaluer('[M.temps(), M.duree]');
    assert.ok(Math.abs(t - duree / 2) < 0.1, `${t} pour ${duree / 2}`);
    // Au survol, le mot dit à cet instant.
    const mot = await page.evaluer(`(function () {
      var s = M.minutage.scenes[0], v = M.donnees.scenes[0].voix, w = v.mots[1];
      var t = s.debut + (v.debut || 0) + (w.t0 + w.t1) / 2;
      var b = document.getElementById('pm-onde').getBoundingClientRect();
      document.getElementById('pm-onde').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: b.left + b.width * t / M.duree, clientY: b.top + 5 }));
      var bulle = document.querySelector('#pm-onde .pm-onde-mot');
      return bulle.hidden ? null : bulle.textContent;
    })()`);
    assert.equal(mot, 'garder');
  });
});

test('lecteur : vignette de scène au survol d\'un repère', { skip: sansNavigateur, timeout: 90000 }, async () => {
  await avecApercu(copierProjet('projet-simple'), 47877, async (page) => {
    await attendre(page, "document.querySelectorAll('.pm-reperes-scenes span').length === 2");
    await page.evaluer("document.querySelector('.pm-reperes-scenes span[data-scene=\"chiffre\"]').dispatchEvent(new MouseEvent('mouseenter')), true");
    await attendre(page, "(document.querySelector('#pm-vignette img') || {}).src && document.querySelector('#pm-vignette img').src.startsWith('data:image/jpeg')", 45000);
    const v = await page.evaluer("(function () { var b = document.getElementById('pm-vignette'); var i = b.querySelector('img'); return { texte: b.textContent, visible: !b.hidden, largeur: i.naturalWidth, dansScene: !!b.closest('#pm-scene') }; })()");
    assert.deepEqual([v.texte, v.visible, v.largeur, v.dansScene], ['Scène 2 · chiffre', true, 240, false]);
    // Un clic sur le repère se place au début de la scène.
    await page.evaluer("document.querySelector('.pm-reperes-scenes span[data-scene=\"chiffre\"]').click(), true");
    const [t, debut] = await page.evaluer('[M.temps(), M.minutage.scenes[1].debut]');
    assert.ok(Math.abs(t - debut) < 1e-6, `${t} pour ${debut}`);
  });
});

test('assembler : la page livrée sans forme d\'onde ni vignettes', async () => {
  const dir = await projetAvecVoix();
  const a = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(a.ok, true);
  const livree = fs.readFileSync(a.fichier, 'utf8');
  for (const motif of [/_pm\/apercu/, /piste\.mjs/, /pm-onde/, /pm-vignette/, /pm-reperes-scenes/, /pisteApercu/, /_pm\/version/, /Comparer avec/]) {
    assert.doesNotMatch(livree, motif, String(motif));
  }
});

// --- 5.10 : comparaison dans l'aperçu ---------------------------------------------------------------------------------

function obtenir(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (m) => { corps += m; });
      res.on('end', () => resolve({ statut: res.statusCode, corps }));
    }).on('error', reject);
  });
}

/** Fichiers du projet : chemin -> [taille, date] (tout, sortie et historique compris). */
function inventaire(dir) {
  const r = {};
  const visiter = (rel) => {
    const abs = path.join(dir, rel);
    const st = fs.statSync(abs);
    if (st.isDirectory()) { for (const n of fs.readdirSync(abs)) visiter(path.join(rel, n)); } else r[rel] = [st.size, st.mtimeMs];
  };
  for (const n of fs.readdirSync(dir)) visiter(n);
  return r;
}

test('apercu : version comparée assemblée sans rien écrire dans le projet', async () => {
  const dir = copierProjet('projet-simple');
  H.sauvegarder(dir, { phrase: 'change le titre' });
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Titre nouveau'; });
  const apercu = await demarrerApercu({ dossier: dir, port: 47878, dossierStyles: STYLES });
  try {
    await pause(300);
    const avant = inventaire(dir);
    const v1 = await obtenir(`${apercu.url}_pm/version/1`);
    assert.equal(v1.statut, 200);
    assert.match(v1.corps, /Pourquoi 4/);
    assert.doesNotMatch(v1.corps, /Titre nouveau/);
    assert.match(v1.corps, /<script src="\/_pm\/capture\.js"><\/script>/);
    assert.doesNotMatch(v1.corps, /_pm\/apercu\/|window\.__PM_APERCU__ = true/, 'sans l\'interface de l\'aperçu');
    assert.equal((await obtenir(`${apercu.url}_pm/version/1`)).corps, v1.corps, 'en cache, identique');
    assert.match((await obtenir(`${apercu.url}_pm/version/courante`)).corps, /Titre nouveau/);
    assert.equal((await obtenir(`${apercu.url}_pm/version/precedente`)).corps, v1.corps);
    assert.equal((await obtenir(`${apercu.url}_pm/version/42`)).statut, 404);
    const versions = JSON.parse((await obtenir(`${apercu.url}_pm/versions`)).corps);
    assert.deepEqual(versions.versions.map((v) => [v.numero, v.phrase]), [['001', 'change le titre']]);
    await pause(300);
    assert.deepEqual(inventaire(dir), avant, 'rien d\'écrit dans le projet');
  } finally { await apercu.fermer(); }
});

test('comparer : les deux cadres au même instant après un déplacement', { skip: sansNavigateur, timeout: 90000 }, async () => {
  const dir = copierProjet('projet-simple');
  H.sauvegarder(dir, { phrase: 'change le titre' });
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Titre nouveau'; });
  await avecApercu(dir, 47879, async (page) => {
    await attendre(page, 'globalThis.__comparer && document.getElementById("position").max !== "1"', 45000);
    await page.evaluer("var p = document.getElementById('position'); p.value = '3.2'; p.dispatchEvent(new Event('input')); true");
    const [a, b] = await page.evaluer('__comparer.temps()');
    assert.ok(Math.abs(a - 3.2) < 0.04 && Math.abs(b - 3.2) < 0.04, `${a} et ${b}`);
    assert.ok(Math.abs(a - b) < 1e-6, 'le même instant');
    const textes = await page.evaluer("['courante', 'avant'].map((id) => document.getElementById(id).contentDocument.querySelector('[data-texte=\"titre\"]').textContent)");
    assert.deepEqual(textes, ['Titre nouveau', 'Pourquoi 4 °C ?']);
    // Les barres propres aux cadres sont masquées : une seule barre pilote.
    assert.equal(await page.evaluer("getComputedStyle(document.getElementById('courante').contentDocument.getElementById('pm-lecteur')).display"), 'none');
    // La lecture vient de la version actuelle ; l'autre suit.
    await page.evaluer("document.getElementById('lecture').click(), true");
    await pause(600);
    const [c, d] = await page.evaluer('__comparer.temps()');
    assert.ok(c > 3.3, `lecture : ${c}`);
    assert.ok(Math.abs(c - d) < 0.1, `${c} et ${d}`);
    assert.equal(await page.evaluer("document.getElementById('avant').contentWindow.M.lecteur.enLecture()"), false, 'le son ne vient que de la version actuelle');
  }, '_pm/comparer?avec=1');
});
