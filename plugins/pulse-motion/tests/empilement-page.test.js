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
  fs.writeFileSync(path.join(dir, relatif), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
};

function projet() {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.obstacles = [{ type: 'sol', a: 85 }];
    d.scenes = [
      { id: 's1', fichier: 'scenes/01.html', duree: 3, textes: { titre: 'Un' } },
      { id: 's2', fichier: 'scenes/02.html', duree: 3, textes: { titre: 'Deux' } },
    ];
  });
  ecrire(dir, 'effets/couche.json', { version: 1, nom: 'couche', rendu_calque: { bloom: 0 }, emetteurs: [{ nom: 'e',
    naissance: { debit: 300, forme: { type: 'ancre' }, vie: [20, 20], taille: [0.3, 0.3] },
    forces: [{ type: 'gravite', valeur: 60 }], vie: { couleur: '#ffffff' },
    collisions: { cibles: ['elements'], reponse: 'poser', empiler: true, epaisseur: 0.4, talus: 40 }, rendu: { melange: 'alpha' } }] });
  const scene = (id, gauche) => `<section data-scene="${id}">
  <style>@scope { #source { position: absolute; left: ${gauche}cqh; top: 10cqh; width: 30cqh; height: 1cqh; } }</style>
  <h1 data-texte="titre"></h1>
  <div id="source"></div>
  <div data-effet="couche" data-ancre="#source" data-start="0" data-dur="1"></div>
</section>`;
  ecrire(dir, 'scenes/01.html', scene('s1', 30));
  ecrire(dir, 'scenes/02.html', scene('s2', 50));
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  return r.html;
}

function avecChemin(html, chemin) {
  return html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    for (const t of ${JSON.stringify(chemin)}) await M.seek(t);
    const h = Array.from(await M.particules.lireHauteurs('s2', 0));
    const p = await M.particules.lirePixels('s2', 'avant');
    let somme = 0;
    for (const x of p.donnees) somme += x;
    envoyer({ webgpu: true, h, somme });
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
}

test('page : couche sur un sol de la vidéo identique par deux chemins, contributions des scènes précédentes', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = projet();
  const direct = JSON.parse(await executerPage(avecChemin(html, [5.9])));
  assert.equal(direct.erreur, undefined, direct.erreur);
  if (direct.webgpu === false) return t.skip('WebGPU indisponible');
  const continu = JSON.parse(await executerPage(avecChemin(html, [0.5, 1.5, 2.5, 2.99, 3.5, 4.5, 5.9])));
  assert.equal(continu.erreur, undefined, continu.erreur);
  assert.deepEqual(direct.h, continu.h, 'mêmes hauteurs par un seek direct et par une lecture continue');
  assert.equal(direct.somme, continu.somme, 'même image');
  // Seul profil (0) : le sol de la vidéo, entrée 3 de la table de s2 (le sol de l'image n'est pas ciblé : « elements »).
  const L = 177.78;
  const caseDe = (x) => Math.floor(x / L * 256);
  assert.equal(direct.h.length, 256);
  const sol = direct.h;
  // Sous la source de s1 (30 à 60 cqh), seule la contribution de s1 : couche présente dès l'arrivée en s2.
  assert.ok(sol[caseDe(35)] > 0.5, `couche de s1 sous x = 35 : ${sol[caseDe(35)]}`);
  // Sous la source de s2 (50 à 80 cqh), s1 et s2 se cumulent là où elles se recouvrent (55).
  assert.ok(sol[caseDe(55)] > sol[caseDe(35)] && sol[caseDe(55)] > sol[caseDe(75)] * 0.9, JSON.stringify([sol[caseDe(35)], sol[caseDe(55)], sol[caseDe(75)]]));
});
