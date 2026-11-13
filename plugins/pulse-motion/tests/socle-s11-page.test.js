'use strict';
/* Spec S11, jalon J1 (5.1 point 4) : registre des habillages, liste unique, et personnages rendus à l'identique dans la
 * page. L'empreinte EMPREINTE a été relevée avec le moteur de la 0.72.0 (choix de l'habillage codé en dur dans scene.js),
 * avant le registre ; un changement voulu du rendu des personnages la met à jour (à dire dans le message de commit). */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const HAB = require('../moteur/personnages/habillages.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const navigateur = trouverNavigateur();
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');

// Touffu en pièces qui marche, touffu en bâtonnets (data-habillage) qui montre, bâtonnets seuls qui courent.
const SCENE = `<section data-scene="chiffre">
  <div id="a" data-personnage="touffu" data-x="20" data-taille="35"><i data-action="marcher" data-vers="35" data-start="0.5" data-dur="2"></i></div>
  <div id="b" data-personnage="touffu" data-habillage="batonnets" data-x="50" data-vue="45" data-taille="35"><i data-action="pose" data-pose="montrer" data-start="0.5"></i></div>
  <div id="c" data-personnage="batonnets" data-x="80" data-vue="180" data-taille="35"><i data-action="courir" data-vers="65" data-start="1" data-dur="2"></i></div>
</section>`;
const EMPREINTE = '2e2e9c6fcf97820a84f501b0c8b2c425d57825267a5606512f085418985c8a19';

function projet(scene) {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), scene);
  const json = path.join(dir, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(json, 'utf8'));
  d.scenes[1].duree = 5;
  delete d.scenes[1].rythme;
  fs.writeFileSync(json, JSON.stringify(d, null, 2));
  return dir;
}

test('habillages : liste unique ; pieces et batonnets rendus à l\'identique (empreinte avant et après)', { timeout: 120000 }, async (t) => {
  // Liste unique : le registre ; la scène, la validation, l'atelier, l'assemblage et la planche la lisent, sans liste à eux.
  // 0.76.0 (S11 J4) : l'habillage plume rejoint le registre ; pieces et batonnets gardent leur empreinte.
  assert.deepEqual(HAB.NOMS, ['pieces', 'batonnets', 'plume']);
  assert.equal(HAB.DEFAUT, 'pieces');
  assert.deepEqual(HAB.sansDessin(), ['batonnets']);
  for (const n of HAB.NOMS) {
    assert.equal(typeof HAB.habillages[n].creer, 'function', n);
    assert.ok(fs.existsSync(path.join(RACINE, 'moteur', HAB.habillages[n].fichier)), n);
    assert.deepEqual(GM.GROUPES[`habillage-${n}`], [HAB.habillages[n].fichier], n);
  }
  assert.ok(GM.GROUPES.personnages.includes('personnages/habillages.js'));
  assert.ok(!GM.GROUPES.personnages.some((m) => /^habillage-/.test(m)), 'les habillages ont chacun leur groupe');
  for (const f of ['moteur/personnages/scene.js', 'scripts/lib/personnages-scene.js', 'moteur/personnages/atelier.mjs']) {
    const code = lire(...f.split('/')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /['"](?:pieces|batonnets)['"]|M\.pieces\.creer|M\.batonnets\.creer|\bB\.creer|\bPI\.creer/, `${f} : habillage nommé en dur`);
    assert.match(code, /habillages/, f);
  }
  assert.doesNotMatch(lire('moteur', 'personnages', 'atelier.html'), /habillage-[a-z]+\.js/);
  const { STATIQUES } = require('../scripts/lib/routes-personnages.js');
  const page = STATIQUES['/_pm/personnages'].transformer(fs.readFileSync(path.join(RACINE, 'moteur', 'personnages', 'atelier.html'))).toString('utf8');
  for (const m of [...HAB.fichiers(), 'personnages/habillages.js']) {
    assert.ok(page.includes(`<script src="/_pm/personnages/modules/${m}"></script>`), m);
    assert.ok(STATIQUES[`/_pm/personnages/modules/${m}`], m);
  }
  assert.ok(page.indexOf('personnages/habillages.js') < page.indexOf('atelier.mjs'));
  assert.deepEqual(require('../scripts/lib/planche-personnages.js').MODULES.filter((m) => /habillage/.test(m)), [...HAB.fichiers(), 'personnages/habillages.js']);

  // L'assemblage n'embarque que les habillages d'une scène.
  const groupes = (scene) => assembler({ dossier: projet(scene), dossierStyles: STYLES, ecrire: false });
  const tous = groupes(SCENE);
  assert.deepEqual(tous.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.deepEqual(tous.groupes.filter((g) => /personnages|habillage/.test(g)), ['personnages', 'habillage-pieces', 'habillage-batonnets']);
  const pieces = groupes('<section data-scene="chiffre"><div data-personnage="touffu"></div></section>');
  assert.deepEqual(pieces.groupes.filter((g) => /habillage/.test(g)), ['habillage-pieces']);
  assert.ok(!pieces.moteur.includes('pm-perso-touffe-trait') && pieces.moteur.includes('data-piece'), 'module des bâtonnets absent');
  const seuls = groupes('<section data-scene="chiffre"><div data-personnage="batonnets"></div></section>');
  assert.deepEqual(seuls.groupes.filter((g) => /habillage/.test(g)), ['habillage-batonnets']);
  assert.ok(seuls.moteur.includes('pm-perso-touffe-trait') && !seuls.moteur.includes('data-piece'), 'module des pièces absent');
  assert.deepEqual(GM.groupesDuDeroule({ personnages: {} }, [], [], { habillages: ['batonnets'] }), ['tronc', 'personnages', 'habillage-batonnets']);
  assert.deepEqual(GM.groupesDuDeroule({ personnages: {} }), ['tronc', 'personnages', 'habillage-pieces', 'habillage-batonnets', 'habillage-plume', 'main-levee']);

  // Rendu identique : les trois personnages, à cinq instants, dans la page.
  if (!navigateur) { t.skip('Chrome ou Edge introuvable : rendu des personnages non vérifié'); return; }
  const r = assembler({ dossier: projet(SCENE), dossierStyles: STYLES });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const p = await ouvrirPage({ navigateur, largeur: 640, hauteur: 360 });
  try {
    await p.aller(pathToFileURL(r.fichier).href);
    const rendu = await p.evaluer(`(async () => {
      await M.pret;
      const d = M.minutage.scenes.find((s) => s.id === 'chiffre').debut;
      const out = [];
      for (const t of [0.2, 1.1, 1.9, 2.7, 3.6]) { await M.seek(d + t); out.push(['a', 'b', 'c'].map((id) => document.getElementById(id).querySelector('svg').outerHTML).join(' | ')); }
      return { rendu: out.join(' ---- '), habillages: Object.keys(M.habillages), erreurs: (M.erreurs || []).map((e) => e.message) };
    })()`);
    assert.deepEqual(rendu.erreurs, []);
    assert.deepEqual(rendu.habillages, HAB.NOMS);
    assert.match(rendu.rendu, /data-piece=/, 'touffu en pièces');
    assert.match(rendu.rendu, /pm-perso-membre/, 'bâtonnets');
    assert.equal(crypto.createHash('sha256').update(rendu.rendu).digest('hex'), EMPREINTE);
  } finally { await p.fermer(); }
});
