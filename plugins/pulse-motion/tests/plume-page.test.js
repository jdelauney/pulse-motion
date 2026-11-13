'use strict';
/* Spec S11, jalon J4 (5.6) dans le navigateur : l'habillage « plume » dans la page d'une vidéo d'un style existant clair
 * (carnet ; le style plume arrive en J11), même pose et même SVG d'un rendu à l'autre et d'une page à l'autre, aucun filtre ni
 * visage ; planches des trois dessins plume dans les 5 vues. Sans navigateur : plume.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const P = require('../scripts/lib/personnages.js');
const PL = require('../scripts/lib/planche-personnages.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const lu = P.lire(null);
const PLUME = ['passant', 'enfant', 'ouvrier'];

// Trois personnages plume qui marchent dans une scène du style carnet (clair).
const SCENE = `<section data-scene="chiffre">
  <div id="a" data-personnage="passant" data-x="10" data-taille="45"><i data-action="marcher" data-vers="40" data-start="0.3" data-dur="3"></i></div>
  <div id="b" data-personnage="enfant" data-x="45" data-taille="32" data-vue="45"><i data-action="marcher" data-vers="65" data-start="0.5" data-dur="3"></i></div>
  <div id="c" data-personnage="ouvrier" data-x="92" data-taille="45" data-vue="180"><i data-action="marcher" data-vers="72" data-start="0.2" data-dur="3"></i></div>
</section>`;

function projet() {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), SCENE);
  modifierDeroule(dir, (d) => { d.style = 'carnet'; d.scenes[1].duree = 5; delete d.scenes[1].rythme; });
  return dir;
}

const RELEVER = (instants) => `(async () => {
  await M.pret;
  const d = M.minutage.scenes.find((s) => s.id === 'chiffre').debut;
  const out = [];
  for (const t of ${JSON.stringify(instants)}) { await M.seek(d + t); out.push(['a', 'b', 'c'].map((id) => document.getElementById(id).querySelector('svg').outerHTML).join(' | ')); }
  return { rendus: out, habillages: Object.keys(M.habillages), erreurs: (M.erreurs || []).map((e) => e.message),
    membres: document.querySelectorAll('#a [data-plume][data-membre]').length };
})()`;

test('plume : même pose, même SVG', { ...SANS, timeout: 180000 }, async () => {
  const r = assembler({ dossier: projet() });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.ok(r.groupes.includes('habillage-plume') && r.groupes.includes('main-levee'));
  const lire = async (instants) => {
    const p = await ouvrirPage({ navigateur, largeur: 640, hauteur: 360 });
    try { await p.aller(pathToFileURL(r.fichier).href); return await p.evaluer(RELEVER(instants)); } finally { await p.fermer(); }
  };
  // Aller-retour dans le temps dans une page (1,2 s, 3 s, de nouveau 1,2 s), puis une autre page : le même SVG.
  const une = await lire([1.2, 3, 1.2, 0.1]);
  assert.deepEqual(une.erreurs, []);
  assert.ok(une.habillages.includes('plume'));
  assert.equal(une.rendus[0], une.rendus[2], 'même instant, même SVG dans la même page');
  assert.notEqual(une.rendus[0], une.rendus[1], 'ils marchent');
  const autre = await lire([1.2, 0.1]);
  assert.equal(autre.rendus[0], une.rendus[0], 'même instant, même SVG d\'une page à l\'autre');
  assert.equal(autre.rendus[1], une.rendus[3]);
  // Au trait de plume : des tracés de membres, encre et papier, aucun filtre, aucun visage.
  const svg = une.rendus[0];
  assert.ok(une.membres >= 15, `${une.membres} tracés de membres`);
  assert.match(svg, /class="pm-perso pm-plume"/);
  assert.match(svg, /data-plume="papier"[^>]*data-membre="jambeAvant"/);
  assert.doesNotMatch(svg, /filter|feTurbulence|mix-blend/);
  assert.doesNotMatch(svg, /data-oeil|data-bouche|data-visage|data-pupille/);
  assert.doesNotMatch(svg, /data-membre="[^"]+"[^>]* d="[^"]*[Zz]/, 'membres sans fermeture');
});

test('plume : planches des trois dessins dans les 5 vues, marche et pose', { ...SANS, timeout: 180000 }, async () => {
  const dir = dossierTemporaire('pm-plume-planches-');
  for (const n of PLUME) {
    const dessin = lu.dessins[n];
    for (const [nom, type] of [['marche', 'clip'], ['montrer', 'pose']]) {
      const objet = type === 'clip' ? lu.clips[nom] : lu.poses[nom];
      const { html } = PL.pagePlanche({ nom, type, objet, lu, gabarit: P.gabaritDe(dessin, lu), dessin, vues: [0, 45, 90, -90, 180], images: 4 });
      assert.match(html, /M\.plume = api/, 'module plume dans la planche');
      assert.match(html, /M\.mainLevee = api/, 'main-levee dans la planche');
      assert.match(html, /background:#FDFCF8/, 'planche sur fond de papier');
      const r = await PL.rendrePlanche({ nom, type, objet, lu, gabarit: P.gabaritDe(dessin, lu), dessin, vues: [0, 45, 90, -90, 180], images: type === 'clip' ? 4 : 1, sortie: path.join(dir, `${nom}-${n}.png`), navigateur });
      assert.equal(r.personnages, 5 * (type === 'clip' ? 4 : 1), `${n}, ${nom}`);
      assert.ok(fs.statSync(r.fichier).size > 2000);
    }
  }
});
