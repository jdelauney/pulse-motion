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
const proche = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
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
  const demarches = preparerPersonnages('<section><div data-personnage="touffu"><i data-action="marcher" data-vers="40" data-dur="2" data-clip="marche-fiere"></i><i data-action="courir" data-vers="80" data-start="3" data-dur="1" data-clip="coucou"></i><i data-action="marcher" data-vers="20" data-start="5" data-dur="2" data-clip="course"></i></div></section>', { scene: 's', lu });
  const md = demarches.erreurs.map((e) => e.message).join(' | ');
  assert.match(md, /démarche « marche-fiere » introuvable ; la créer d'abord/);
  assert.match(md, /« coucou » ne peut pas servir de démarche : il faut un mouvement en boucle, comme « course »/);
  assert.equal(demarches.erreurs.length, 2, 'la course sert de démarche');
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

test('hauteur et temps : erreurs d\'assemblage ; dans la page, les pieds sur la colline et le personnage figé avec son conteneur', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const mauvais = preparerPersonnages('<section><svg><rect id="mur"/></svg><div data-personnage="touffu" data-sol="#absent"><i data-action="glisser" data-start="0"></i><i data-action="bondir" data-vers="40" data-start="1"></i><i data-action="marcher" data-vers="40" data-dur="1" data-sol="#mur" data-start="2"></i><i data-action="glisser" data-sol="80" data-dur="1" data-courbe="tordue" data-start="3"></i><i data-action="bondir" data-vers="20" data-dur="1" data-hauteur="haut" data-start="4"></i></div></section>', { scene: 's', lu });
  const m = mauvais.erreurs.map((e) => e.message).join(' | ');
  const inutiles = preparerPersonnages('<section><svg><path id="c" d="M0 0"/><path id="c" d="M0 1"/></svg><div data-personnage="touffu" data-sol="#c"><i data-action="pose" data-pose="montrer" data-sol="80" data-start="0" data-dur="1"></i><i data-action="glisser" data-sol="80" data-dur="1" data-hauteur="10" data-start="1"></i><i data-action="bondir" data-vers="20" data-dur="1" data-courbe="linear" data-start="2"></i></div></section>', { scene: 's', lu });
  const mi = inutiles.erreurs.map((e) => e.message).join(' | ');
  for (const motif of [/data-sol ne sert qu'aux déplacements/, /data-hauteur ne sert qu'à « bondir »/, /data-courbe ne sert qu'à « glisser »/, /plusieurs éléments portent l'id « c »/]) assert.match(mi, motif);
  for (const motif of [/sol « #absent » introuvable/, /il faut data-vers \(où aller\) ou data-sol/, /« bondir ».*data-dur obligatoire/, /le sol « #mur » doit être un tracé/, /Nom de courbe inconnu/, /data-hauteur="haut" doit être un nombre/]) assert.match(m, motif);
  const SCENE_H = `<section data-scene="chiffre">
  <p id="nombre" data-tween="nombre 0→1250 cubic-out" data-dur="6">0</p>
  <div class="decor"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%"><g transform="translate(0 10)"><path id="colline" d="M0 70 L100 50" fill="none" stroke="#888"/></g></svg></div>
  <div id="grimpeur" data-personnage="touffu" data-x="10" data-sol="#colline" data-taille="20">
    <i id="monte" data-action="marcher" data-vers="90" data-start="0" data-dur="4"></i>
  </div>
  <div id="fige" data-gel="0.5+1" style="position:absolute;inset:0">
    <div id="statue" data-personnage="touffu" data-x="20" data-sol="95" data-taille="20"><i data-action="marcher" data-vers="80" data-start="0" data-dur="4"></i><i data-action="expression" data-expression="joie" data-start="0.8"></i></div>
  </div>
</section>`;
  const dir = video(SCENE_H);
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.deepEqual(r.erreurs.filter((e) => e.regle === 'personnage-invalide'), []);
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  try {
    await page.aller(pathToFileURL(r.fichier).href);
    const res = await page.evaluer(`(async () => {
      await M.pret;
      const d = M.minutage.scenes.find((s) => s.id === 'chiffre').debut;
      const pos = (id) => { const tr = document.querySelector('#' + id + ' [data-pm-perso-racine]').getAttribute('transform'); const m = /translate\\(([-\\d.e]+)[ ,]+([-\\d.e]+)\\)/.exec(tr); if (!m) throw new Error(id + ' : ' + tr); return [+m[1], +m[2]]; };
      const out = [];
      for (const t of [0.5, 2, 3.5]) { await M.seek(d + t); out.push(pos('grimpeur')); }
      // Scène au rythme 0,8 : le gel « 0.5+1 » (temps de scène) couvre 0,625 s à 1,875 s.
      await M.seek(d + 1); const a = pos('statue'); await M.seek(d + 1.8); const b = pos('statue'); await M.seek(d + 3); const c = pos('statue');
      return { out, a, b, c, erreurs: (M.erreurs || []).map((e) => e.message) };
    })()`);
    assert.deepEqual(res.erreurs.filter((m) => !/pendant un arrêt sur image/.test(m)), []);
    assert.ok(res.erreurs.some((m) => /action « expression » : elle commence pendant un arrêt sur image/.test(m)), 'alerte : action pendant le gel');
    // Tracé sous un <g transform> : la transformation du décor compte. viewBox 1600 x 900 : sol(x) = 80 - 0,2 x (% de la hauteur) ; l'écart de hauteur entre deux instants suit la pente.
    const [p1, p2, p3] = res.out;
    const attendu = (pa, pb) => (-0.2 * ((pb[0] - pa[0]) / 1600 * 100)) / 100 * 900;
    assert.ok(Math.abs((p2[1] - p1[1]) - attendu(p1, p2)) < 2, `pente suivie : ${p2[1] - p1[1]} ≈ ${attendu(p1, p2)}`);
    assert.ok(Math.abs((p3[1] - p2[1]) - attendu(p2, p3)) < 2);
    assert.deepEqual(res.a, res.b, 'figé pendant le gel de son conteneur');
    assert.ok(res.c[0] > res.b[0], 'il reprend après le gel');
  } finally { await page.fermer(); }
});

test('objets tenus : erreurs d\'assemblage ; dans la page, l\'objet suit la main puis est lâché', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const mauvais = preparerPersonnages('<section><div id="a" data-personnage="touffu"></div><p id="o1" data-tenu-par="#b" data-start="0" data-dur="1"></p><p id="o2" data-tenu-par="#a" data-main="gauche" data-orientation="penche" data-lacher="vole" data-prise="milieu" data-start="0"></p><div><p id="o3" data-tenu-par="#a" data-start="0" data-dur="1"></p></div></section>', { scene: 's', lu });
  const m = mauvais.erreurs.map((e) => e.message).join(' | ');
  for (const motif of [/« o1 » : porteur « #b » introuvable/, /data-main="gauche"/, /data-orientation="penche"/, /data-lacher="vole"/, /data-prise="milieu"/, /« o2 » : data-dur obligatoire/, /« o3 » : il doit être dans le même conteneur que son porteur/]) assert.match(m, motif);
  const SCENE_O = `<section data-scene="chiffre">
  <style>@scope { .objet { position: absolute; left: 5%; top: 5%; width: 6cqh; height: 10cqh; background: var(--c-primaire); } }</style>
  <p id="nombre" data-tween="nombre 0→1250 cubic-out" data-dur="3">0</p>
  <div id="porteur" data-personnage="touffu" data-x="20" data-sol="90" data-taille="30">
    <i id="va" data-action="marcher" data-vers="60" data-start="0" data-dur="2"></i>
  </div>
  <div id="crayon" class="objet" data-decor data-tenu-par="#porteur" data-orientation="main" data-start="0.5" data-dur="1" data-lacher="tombe"></div>
  <div id="tasse" class="objet" data-decor data-tenu-par="#porteur" data-main="arriere" data-start="0.5" data-dur="1" data-lacher="cache"></div>
</section>`;
  const r = assembler({ dossier: video(SCENE_O), dossierStyles: STYLES });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  try {
    await page.aller(pathToFileURL(r.fichier).href);
    const res = await page.evaluer(`(async () => {
      await M.pret;
      const d = M.minutage.scenes.find((s) => s.id === 'chiffre').debut;
      const E = M.minutage.elements.chiffre, cr = E.crayon;
      const porteur = document.getElementById('porteur');
      const lire = (id) => { const s = document.getElementById(id).style; return { left: s.left, top: s.top, transform: s.transform, visibility: s.visibility, position: s.position }; };
      await M.seek(d + 0.2); const avant = lire('crayon');
      const t1 = cr.debut + 0.4; await M.seek(t1); const pendant = lire('crayon'); const m1 = M.personnages.mains(porteur, t1);
      await M.seek(cr.fin + 3); const tombe = lire('crayon'); const tasse = lire('tasse'); const mf = M.personnages.mains(porteur, cr.fin);
      await M.seek(d + 0.2); await M.seek(t1); const encore = lire('crayon');
      return { avant, pendant, m1, tombe, tasse, mf, encore, W: M.personnages.W, H: M.personnages.H, erreurs: (M.erreurs || []).map((e) => e.message) };
    })()`);
    assert.deepEqual(res.erreurs, []);
    assert.equal(res.avant.position, '', 'avant la prise : ses styles d\'origine');
    proche(parseFloat(res.pendant.left), res.m1.avant.x / res.W * 100, 0.01);
    proche(parseFloat(res.pendant.top), res.m1.avant.y / res.H * 100, 0.01);
    assert.match(res.pendant.transform, new RegExp('rotate\\(' + (Math.round((res.m1.avant.angle + 90) * 100) / 100).toString().replace('.', '\\.') + 'deg\\)'), 'tourne avec l\'avant-bras');
    proche(parseFloat(res.tombe.top), res.mf.sol / res.H * 100, 0.01);
    assert.equal(res.tasse.visibility, 'hidden', 'lâchée : cachée');
    assert.deepEqual(res.encore, res.pendant, 'même image quel que soit l\'ordre');
  } finally { await page.fermer(); }
});

