'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const ecrire = (dir, relatif, contenu) => {
  fs.mkdirSync(path.dirname(path.join(dir, relatif)), { recursive: true });
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu, null, 2));
};
const recette = (nom, emetteur, rendu_calque) => ({ version: 1, nom, ...(rendu_calque ? { rendu_calque } : {}), emetteurs: [{ nom: 'e', ...emetteur }] });
const salve = (nombre, extra = {}) => ({ salves: [{ t: 0, nombre }], forme: { type: 'point' }, vitesse: { cone: 360, valeur: [5, 20] }, vie: [3, 3], taille: [3, 5], ...extra });

function projet() {
  const dir = copierProjet('projet-particules');
  ecrire(dir, 'assets/planche.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="32" height="32" fill="#f00"/><rect x="32" width="32" height="32" fill="#0f0"/><rect y="32" width="32" height="32" fill="#00f"/><rect x="32" y="32" width="32" height="32" fill="#ff0"/></svg>');
  ecrire(dir, 'effets/etoiles.json', recette('etoiles', { naissance: salve(30), rendu: { type: 'sprite', texture: 'etoile' }, vie: { intensite: 3 } }));
  ecrire(dir, 'effets/traits.json', recette('traits', { naissance: { debit: 60, forme: { type: 'point' }, vitesse: { cone: 360, valeur: [20, 40] }, vie: [1, 2] }, rendu: { type: 'etincelle', etirement: 0.05, flou: true } }));
  ecrire(dir, 'effets/rubans.json', recette('rubans', { naissance: salve(10), forces: [{ type: 'turbulence', echelle: 5, force: 30 }], rendu: { type: 'trainee', longueur: 8, melange: 'alpha' } }));
  ecrire(dir, 'effets/cartes.json', recette('cartes', { naissance: salve(20, { z: [-1, 1] }), rendu: { type: 'planche', texture: 'assets/planche.svg', melange: 'alpha', planche: { colonnes: 2, lignes: 2 } } }));
  ecrire(dir, 'effets/confettis-test.json', recette('confettis-test', { naissance: salve(40, { z: [-1, 1], vitesse_angulaire: [90, 360] }), rendu: { texture: 'confetti', melange: 'alpha' }, vie: { couleur: 'accent' } }));
  ecrire(dir, 'effets/lumiere.json', recette('lumiere', { naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vie: [10, 10], taille: [4, 4] }, vie: { intensite: 8 } }, { bloom: 1, seuil_bloom: 1 }));
  ecrire(dir, 'effets/sans-bloom.json', { version: 1, nom: 'sans-bloom', etend: 'lumiere', rendu_calque: { bloom: 0 } });
  ecrire(dir, 'effets/gris.json', recette('gris', { naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vie: [10, 10], taille: [40, 40] }, vie: { couleur: '#808080' }, rendu: { melange: 'alpha' } }, { bloom: 0 }));
  ecrire(dir, 'effets/aces.json', recette('aces', { naissance: { salves: [{ t: 0, nombre: 1 }], forme: { type: 'point' }, vie: [10, 10], taille: [40, 40] }, vie: { couleur: '#808080' }, rendu: { melange: 'alpha' } }, { bloom: 0, tons: 'aces' }));
  ecrire(dir, 'effets/douce.json', { version: 1, nom: 'douce', etend: 'aces', rendu_calque: { tons: 'douce' } });
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="types">
  <div data-effet="etoiles"></div><div data-effet="traits"></div><div data-effet="rubans"></div>
  <div data-effet="cartes"></div><div data-effet="confettis-test"></div>
</section>`);
  ecrire(dir, 'scenes/02-lumiere.html', '<section data-scene="lumiere"><div data-effet="lumiere"></div></section>');
  ecrire(dir, 'scenes/03-sans.html', '<section data-scene="sans"><div data-effet="sans-bloom"></div></section>');
  ecrire(dir, 'scenes/04-tons.html', '<section data-scene="tons"><div data-effet="gris"></div></section>');
  ecrire(dir, 'scenes/05-aces.html', '<section data-scene="aces"><div data-effet="aces"></div></section>');
  ecrire(dir, 'scenes/06-douce.html', '<section data-scene="douce"><div data-effet="douce"></div></section>');
  modifierDeroule(dir, (d) => {
    d.scenes = [
      { id: 'types', fichier: 'scenes/01-s.html', duree: 3, textes: {} },
      { id: 'lumiere', fichier: 'scenes/02-lumiere.html', duree: 2, textes: {} },
      { id: 'sans', fichier: 'scenes/03-sans.html', duree: 2, textes: {} },
      { id: 'tons', fichier: 'scenes/04-tons.html', duree: 2, textes: {} },
      { id: 'aces', fichier: 'scenes/05-aces.html', duree: 2, textes: {} },
      { id: 'douce', fichier: 'scenes/06-douce.html', duree: 2, textes: {} },
    ];
  });
  return dir;
}

const CODE = `
<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const debut = (id) => M.minutage.scenes.find((s) => s.id === id).debut;
    const lire = async (id, t) => { await M.seek(debut(id) + t); return M.particules.lirePixels(id, 'avant'); };
    const egal = (a, b) => a.donnees.every((x, i) => x === b.donnees[i]);
    const somme = (p) => { let s = 0; for (const x of p.donnees) s += x; return s; };
    const pixel = (p, x, y) => { const i = (Math.round(y) * p.largeur + Math.round(x)) * 4; return Array.from(p.donnees.slice(i, i + 4)); };
    const r = { webgpu: true };
    await M.seek(0);
    const direct = await lire('types', 1.2);
    await M.seek(M.duree);
    const detour = await lire('types', 1.2);
    r.typesNonVide = somme(direct) > 0;
    r.typesDeterministe = egal(direct, detour);
    const ordre = await M.particules.lireOrdre('types', 3, 0);
    let trie = true;
    for (let i = 2; i < ordre.length; i += 2) if (ordre[i] < ordre[i - 2]) trie = false;
    r.cartesTriees = trie;
    r.cartesVivantes = Array.from(ordre).filter((_, i) => i % 2 === 0).filter((c) => c !== 0xffffffff).length;
    const lum = await lire('lumiere', 1);
    const sans = await lire('sans', 1);
    const k = lum.hauteur / 100;
    r.bloomLoin = pixel(lum, lum.largeur / 2 + 6 * k, lum.hauteur / 2)[3];
    r.sansBloomLoin = pixel(sans, sans.largeur / 2 + 6 * k, sans.hauteur / 2)[3];
    r.centreLumiere = pixel(lum, lum.largeur / 2, lum.hauteur / 2);
    const tons = await lire('tons', 1);
    r.gris = pixel(tons, tons.largeur / 2, tons.hauteur / 2);
    const aces = await lire('aces', 1);
    const douce = await lire('douce', 1);
    r.aces = pixel(aces, aces.largeur / 2, aces.hauteur / 2);
    r.douce = pixel(douce, douce.largeur / 2, douce.hauteur / 2);
    envoyer(r);
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>`;

test('rendu : types de rendu, tri, bloom, tons', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = projet();
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs, []);
  const r = JSON.parse(await executerPage(a.html.replace('</body>', `${CODE}\n</body>`)));
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.webgpu, true);
  assert.equal(r.typesNonVide, true);
  assert.equal(r.typesDeterministe, true, 'même image par deux chemins avec tous les types de rendu');
  assert.equal(r.cartesTriees, true, 'clés croissantes après le tri bitonique');
  assert.equal(r.cartesVivantes, 20);
  assert.ok(r.bloomLoin > 0, `le bloom éclaire à 6 cqh du point (alpha ${r.bloomLoin})`);
  assert.equal(r.sansBloomLoin, 0, 'sans bloom, rien à 6 cqh');
  assert.ok(r.centreLumiere[3] === 255 && r.centreLumiere[0] > 240, `centre lumineux saturé : ${r.centreLumiere}`);
  r.gris.slice(0, 3).forEach((c) => assert.ok(Math.abs(c - 128) <= 2, `gris de la charte conservé : ${r.gris}`));
  assert.equal(r.gris[3], 255);
  r.aces.slice(0, 3).forEach((c) => assert.ok(c > 138, `courbe ACES appliquée même sans bloom : ${r.aces}`));
  r.douce.slice(0, 3).forEach((c) => assert.ok(Math.abs(c - 128) <= 2, `courbe douce conservée : ${r.douce}`));
});

test('rendu : calque vide après la fin d\'un effet, sans pixel de tramage', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const code = `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  await M.particules.pret;
  if (!M.particules.disponible) return envoyer({ webgpu: false });
  await M.seek(5);
  const p = await M.particules.lirePixels('s', 'avant');
  let s = 0; for (const x of p.donnees) s += x;
  envoyer({ somme: s });
})();
</script>`;
  const r = JSON.parse(await executerPage(a.html.replace('</body>', `${code}\n</body>`)));
  assert.equal(r.somme, 0);
});
