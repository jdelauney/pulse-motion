'use strict';
/* Spec S11, jalon J5 (5.7 et 5.8) dans Chrome ou Edge sans fenêtre : une scène au vent (data-vent="rafales"), une enseigne
 * qui pend (data-pendule), un passant au trait de plume en marche calculée (écharpe et mallette en pendules) et une queue
 * (os en plus) ; la même image au même instant, à l'aller et au retour (deux exports identiques). Sans navigateur :
 * physique.test.js et demarche.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const CAPTURE = fs.readFileSync(path.join(RACINE, 'moteur', 'capture.js'), 'utf8');

const SCENE = `<section data-scene="chiffre" data-vent="rafales" data-vent-dir="0">
  <svg viewBox="0 0 160 90" style="position: absolute; inset: 0; width: 100%; height: 100%">
    <g id="enseigne" data-pendule="14 0.15"><line x1="130" y1="4" x2="130" y2="20" stroke="#222" stroke-width="0.6" /><rect x="118" y="20" width="24" height="12" fill="#b3412d" /></g>
  </svg>
  <div id="a" data-personnage="passant" data-demarche="calculee" data-x="10" data-taille="45"><i data-action="marcher" data-vers="55" data-start="0.3" data-dur="3"></i></div>
  <div id="q" data-personnage="batonnets" data-gabarit="avec-queue" data-x="80" data-taille="30"><i data-action="pose" data-pose="debout" data-start="0"></i></div>
</section>`;

function preparer() {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), SCENE);
  modifierDeroule(dir, (d) => { d.style = 'carnet'; d.scenes[1].duree = 5; delete d.scenes[1].rythme; });
  const r = require('../scripts/assembler.js').assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.ok(r.groupes.includes('physique') && r.groupes.includes('demarche'), r.groupes.join(','));
  assert.match(r.html, /M\.demarrerPhysique\(\);/);
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, r.html);
  return { fichier, debut: r.minutage.scenes.find((s) => s.id === 'chiffre').debut };
}

let page = null;
let contexte = null;
test.before(async () => {
  if (!navigateur) return;
  contexte = preparer();
  const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
  page = await ouvrirCapture({ fichierHtml: contexte.fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 });
  await page.evaluer(`${CAPTURE}; true`);
});
test.after(async () => { if (page) await page.fermer(); });

const RELEVE = `(function () {
  var e = document.getElementById('enseigne'), a = document.getElementById('a');
  var pan = a.querySelector('[data-cle="echarpe/pan"]'), mal = a.querySelector('[data-cle="objetAvant"]');
  return { enseigne: e.getAttribute('transform'), pan: pan && pan.getAttribute('d'), mallette: mal && mal.getAttribute('d'),
    queue: document.getElementById('q').querySelector('svg').innerHTML.length, defini: M.vent.defini, erreurs: (M.erreurs || []).map(function (x) { return x.message; }) };
})()`;

test('physique : même t, même angle ; deux exports identiques', { ...SANS, timeout: 240000 }, async () => {
  const instants = [0.6, 1.3, 2.2, 3.1, 4.4].map((x) => contexte.debut + x);
  const passe = async (liste) => {
    const out = {};
    for (const t of liste) {
      const image = await page.capturer(t);
      await page.evaluer(`M.seek(${t}).then(function () { return true; })`);
      out[t] = { image: Buffer.from(image).toString('base64'), releve: await page.evaluer(RELEVE) };
    }
    return out;
  };
  const aller = await passe(instants);
  const retour = await passe(instants.slice().reverse());
  for (const t of instants) {
    assert.deepEqual(retour[t].releve, aller[t].releve, `relevé à ${t} s`);
    assert.ok(retour[t].image === aller[t].image, `image à ${t} s : deux exports identiques`);
  }
  const r = aller[instants[1]].releve;
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.defini, true);
  // Le vent souffle vers la droite : l'enseigne penche (son bas vers la droite : rotation négative), l'écharpe flotte.
  const angle = (tr) => Number((/rotate\((-?[\d.]+)/.exec(tr || '') || [])[1]);
  assert.ok(angle(r.enseigne) < -2, r.enseigne);
  assert.notEqual(aller[instants[1]].releve.pan, aller[instants[2]].releve.pan);
  assert.notEqual(aller[instants[1]].releve.enseigne, aller[instants[3]].releve.enseigne, 'les rafales la font bouger');
  // Le calcul de la page est celui de Node, au même instant.
  const Ph = require('../moteur/physique.js');
  const dansPage = await page.evaluer(`M.physique.pendule({ longueur: 14, amorti: 0.15, gravite: M.physique.G_CQH, prise: M.physique.PRISE }, ${instants[1]}, { vent: M.vent })`);
  const enEntree = await page.evaluer(`(function () { var s = M.minutage.scenes.filter(function (x) { return x.id === 'chiffre'; })[0]; return s.debut; })()`);
  const piste = Ph.piste(Ph.entreesVent({ scenes: [{ debut: enEntree, vent: 'rafales', dir: 0 }] }));
  const enNode = Ph.pendule({ longueur: 14, amorti: 0.15, gravite: Ph.G_CQH, prise: Ph.PRISE }, instants[1], { vent: (u) => Ph.ventPiste(piste, u) });
  assert.ok(Math.abs(dansPage - enNode) < 1e-12, `${dansPage} dans la page, ${enNode} dans Node`);
  assert.ok(Math.abs(angle(r.enseigne) + enNode * 180 / Math.PI) < 1e-3);
});

test('physique : avant la scène au vent, calme : l\'enseigne pend droit', { ...SANS, timeout: 120000 }, async () => {
  await page.evaluer(`M.seek(${contexte.debut - 1.5}).then(function () { return true; })`);
  const r = await page.evaluer(RELEVE);
  assert.equal(r.enseigne, null, 'sans rotation');
});
