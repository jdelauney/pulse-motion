'use strict';
/* Spec « Mouvement vivant », plan V4 « Vie du décor » (5.9, 5.10) dans la page : fenêtre, phases et cycles des boucles
 * pm-v-* posés par le moteur, repos à la fin de la fenêtre, engrenage, dérive, tout-en-phase et preuve du déterminisme.
 * Unitaires : vie-decor.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { calculerMinutage } = require('../moteur/minutage.js');
const D = require('../scripts/lib/determinisme.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const SEUILS = require('../scripts/seuils.json');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };

const boite = (id, classes, gauche, attrs = '', style = '') => `<div id="${id}" class="${classes}" ${attrs} style="position: absolute; left: ${gauche}cqh; top: 20cqh; width: 4cqh; height: 16cqh; background: #3a7;${style}"></div>`;
const JARDIN = `<section data-scene="jardin">
  ${boite('plante1', 'pm-v-balance', 5, 'data-start="0" data-dur="scene"')}
  ${boite('plante2', 'pm-v-balance', 12, 'data-start="0" data-dur="scene"')}
  ${boite('plante3', 'pm-v-balance', 19, 'data-start="0" data-dur="scene"')}
  ${boite('impose', 'pm-v-balance', 26, 'data-start="0" data-dur="scene"', ' --pm-fois: 1;')}
  ${boite('flamme', 'pm-v-flamme', 33, 'data-start="0" data-dur="scene"')}
  ${boite('libre', 'pm-v-lueur', 40)}
  ${boite('court', 'pm-v-balance', 47, 'data-start="1" data-dur="2"')}
  ${boite('nuage', 'pm-v-nuage', 54, 'data-start="0" data-dur="scene"')}
  <div data-start="0" data-dur="scene">
    ${boite('roue', 'pm-v-engrenage', 61)}
    ${boite('menee', 'pm-v-engrenage-inverse', 68, '', ' --pm-dur: calc(6s * 10 / 16);')}
  </div>
  <div data-start="0" data-dur="scene">
    ${boite('e1', 'etoile pm-v-scintille', 75)}${boite('e2', 'etoile pm-v-scintille', 80)}${boite('e3', 'etoile pm-v-scintille', 85)}
    ${boite('f1', 'fixe pm-v-scintille', 90, '', ' --pm-phase: 0.25;')}${boite('f2', 'fixe pm-v-scintille', 95, '', ' --pm-phase: 0.25;')}${boite('f3', 'fixe pm-v-scintille', 100, '', ' --pm-phase: 0.25;')}
  </div>
</section>`;
const FIN = `<section data-scene="fin">
  ${boite('tardive', 'pm-v-lueur', 10, 'data-start="0" data-dur="scene"')}
</section>`;

function projet() {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.writeFileSync(path.join(dir, 'scenes', '01-jardin.html'), JARDIN);
  fs.writeFileSync(path.join(dir, 'scenes', '02-fin.html'), FIN);
  modifierDeroule(dir, (d) => {
    d.scenes = [
      { id: 'jardin', fichier: 'scenes/01-jardin.html', duree: 10, textes: {}, transition: 'coupe' },
      { id: 'fin', fichier: 'scenes/02-fin.html', duree: 5, textes: {}, transition: 'coupe' },
    ];
  });
  return dir;
}

let page = null;
let dossier = null;
let assemblage = null;
async function ouvrir() {
  if (page) return page;
  dossier = projet();
  assemblage = assembler({ dossier, dossierStyles: STYLES, ecrire: false, groupes: 'tous' });
  assert.equal(assemblage.ok, true, JSON.stringify(assemblage.erreurs));
  const fichier = path.join(dossier, 'vie.html');
  fs.writeFileSync(fichier, assemblage.html);
  page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  await page.aller(pathToFileURL(fichier).href);
  await page.evaluer('(async () => { await M.pret; await document.fonts.ready; return true; })()');
  return page;
}
test.after(async () => { if (page) await page.fermer(); });

/** État des vies à l'instant t : variables écrites, minutage des animations, valeurs calculées. */
const etat = (t) => `(() => {
  M.rendre(${t});
  const r = {};
  document.querySelectorAll('[class*="pm-v-"]').forEach((el) => {
    const cs = getComputedStyle(el);
    r[el.id] = {
      fenetre: el.style.getPropertyValue('--pm-fenetre'), phase: el.style.getPropertyValue('--pm-v-phase'),
      fois: el.style.getPropertyValue('--pm-v-fois'), fois2: el.style.getPropertyValue('--pm-v-fois-2'),
      anims: el.getAnimations().map((a) => { const c = a.effect.getComputedTiming(); return { nom: a.animationName, duree: c.duration, delai: c.delay, iterations: c.iterations, fin: c.endTime }; }),
      rotate: cs.rotate, scale: cs.scale, translate: cs.translate,
    };
  });
  r.cqh = document.getElementById('pm-scene').clientHeight / 100;
  return r;
})()`;
const angle = (v) => (v === 'none' ? 0 : parseFloat(v));
const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≠ ${b}`);

test('pm-v : jamais sans fin, cycles tenant dans la fenêtre', SANS, async () => {
  const p = await ouvrir();
  const r = await p.evaluer(etat(5));
  // Fenêtre : celle du porteur minuté (la scène entière en data-dur="scene"), au rythme de la scène.
  assert.equal(r.plante1.fenetre, '10');
  assert.equal(r.plante1.fois, '2', '10 s à 4,2 s par aller-retour : 2 cycles entiers');
  assert.equal(r.court.fenetre, '2');
  proche(Number(r.court.fois), 2 / 4.2, 1e-5, 'fenêtre plus courte que la période : une fraction');
  assert.equal(r.libre.fenetre, '10', 'sans porteur minuté : la scène');
  assert.equal(r.libre.fois, '3');
  // Deux animations (flamme) : chacune ses cycles.
  assert.equal(r.flamme.fois, '14');
  assert.equal(r.flamme.fois2, '9');
  for (const [id, v] of Object.entries(r)) {
    if (id === 'cqh' || id === 'nuage') continue;
    for (const a of v.anims) {
      assert.ok(Number.isFinite(a.iterations), `${id} : ${a.nom} sans fin`);
      const fenetre = Number(v.fenetre) * 1000;
      assert.ok(a.fin <= fenetre + 1, `${id} : ${a.nom} finit à ${a.fin} ms, après sa fenêtre (${fenetre} ms)`);
    }
  }
  assert.deepEqual(r.flamme.anims.map((a) => a.iterations), [14, 9]);
});

test('pm-v : dernière image de la fenêtre au repos (boucle qui oscille)', SANS, async () => {
  const p = await ouvrir();
  const milieu = await p.evaluer(etat(4.9));
  const fin = await p.evaluer(etat(9.99));
  for (const id of ['plante1', 'plante2', 'plante3', 'flamme']) {
    assert.equal(angle(fin[id].rotate), 0, `${id} : au repos à la fin (${fin[id].rotate})`);
  }
  assert.ok(['1', 'none'].includes(fin.flamme.scale) || /^1(\s1)?$/.test(fin.flamme.scale), fin.flamme.scale);
  assert.ok(['plante1', 'plante2', 'plante3'].some((id) => Math.abs(angle(milieu[id].rotate)) > 0.3), 'vivantes au milieu de la fenêtre');
  // Fenêtre courte (de 1 à 3 s) : après elle, l'élément ne bouge plus.
  const a = await p.evaluer(etat(3.5));
  const b = await p.evaluer(etat(8));
  assert.equal(a.court.rotate, b.court.rotate);
  // Dernière scène : fenêtre jusqu'à 1 s avant la fin, posée à M.demarrer même si la scène était masquée.
  const debut = await p.evaluer(etat(0));
  assert.equal(debut.tardive.fenetre, '4');
  assert.equal(debut.tardive.fois, '1');
});

test('pm-v : deux éléments de même classe ne sont pas en phase', SANS, async () => {
  const p = await ouvrir();
  const r = await p.evaluer(etat(2.5));
  const delais = ['plante1', 'plante2', 'plante3'].map((id) => r[id].anims[0].delai);
  assert.equal(new Set(delais).size, 3, delais.join(', '));
  for (const d of delais) assert.ok(d <= 0 && d > -4200, String(d));
  assert.equal(new Set(['plante1', 'plante2', 'plante3'].map((id) => r[id].rotate)).size, 3, 'trois poses différentes au même instant');
  // Une boucle continue ne se déphase pas (la classe l'impose) ; une phase écrite par la scène l'emporte.
  assert.equal(r.roue.anims[0].delai, 0);
  for (const id of ['f1', 'f2', 'f3']) proche(r[id].anims[0].delai, -0.25 * 2800, 1e-6, id);
});

test('pm-v : --pm-fois écrit par la scène l\'emporte', SANS, async () => {
  const p = await ouvrir();
  const r = await p.evaluer(etat(1));
  assert.equal(r.impose.fois, '2', 'le moteur calcule toujours sa valeur');
  assert.equal(r.impose.anims[0].iterations, 1, 'mais celle de la scène est jouée');
});

test('#075 engrenage : un tour entier par période, roues menées dans le bon sens', SANS, async () => {
  const p = await ouvrir();
  for (const t of [1.5, 3, 4.5]) {
    const r = await p.evaluer(etat(t));
    proche(angle(r.roue.rotate), (360 * t / 6) % 360, 0.01, `roue à ${t} s`);
    proche(angle(r.menee.rotate), -((360 * t / 3.75) % 360), 0.01, `roue menée à ${t} s`);
  }
  const r = await p.evaluer(etat(2));
  assert.equal(r.roue.anims[0].duree, 6000);
  assert.equal(r.menee.anims[0].duree, 3750);
  proche(Number(r.roue.fois), 10 / 6, 1e-5, 'boucle continue : elle remplit sa fenêtre');
  proche(r.roue.anims[0].fin, 10000, 1);
});

test('#078 nuage : position proportionnelle au temps dans la fenêtre', SANS, async () => {
  const p = await ouvrir();
  const xs = [];
  for (const t of [0, 1, 2.5, 5, 9]) {
    const r = await p.evaluer(etat(t));
    xs.push([t, parseFloat(r.nuage.translate) || 0, r.cqh]);
  }
  for (const [t, x, cqh] of xs) proche(x, t * 4 * cqh, 0.05, `à ${t} s`);
});

test('tout-en-phase : les vies déphasées par le moteur ne sont pas signalées, une même phase imposée l\'est', SANS, async () => {
  const p = await ouvrir();
  const constats = await p.evaluer(`M.mesurerMouvement({ seuils: ${JSON.stringify(SEUILS)} })`);
  const enPhase = constats.filter((c) => c.regle === 'tout-en-phase');
  assert.deepEqual(enPhase.map((c) => [c.element, c.valeur]), [['.fixe', 3]]);
  assert.deepEqual(constats.filter((c) => c.regle === 'raccord-boucle'), [], 'chaque boucle de vie revient à son départ');
});

test('pm-v : même image quel que soit l\'ordre de rendu (preuve du déterminisme)', SANS, async () => {
  const p = await ouvrir();
  const instants = [0.4, 2.2, 5.1, 7.7, 9.6];
  const lire = async (t) => { const r = await p.evaluer(etat(t)); return Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'cqh').map(([k, v]) => [k, [v.rotate, v.scale, v.translate]])); };
  const avant = [];
  for (const t of instants) avant.push(await lire(t));
  const apres = [];
  for (const t of [...instants].reverse()) apres.unshift(await lire(t));
  assert.deepEqual(apres, avant);
  // La preuve du contrôle porte sur ces scènes, et passe.
  assert.deepEqual(D.concernees(assemblage).map((s) => [s.id, s.raisons]), [['jardin', ['vie']], ['fin', ['vie']]]);
  const minutage = calculerMinutage(assemblage.donnees.scenes, {}, {});
  const r = await D.verifierDeterminisme({ assemblage, minutage, seuils: SEUILS, navigateur, ratio: '16:9', ouvrir: ouvrirCapture });
  assert.equal(r.lancee, true);
  assert.deepEqual(r.problemes, []);
});
