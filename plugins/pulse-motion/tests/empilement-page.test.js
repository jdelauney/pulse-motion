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

function projet({ debut1 = 0, transition } = {}) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.obstacles = [{ type: 'sol', a: 85 }];
    d.scenes = [
      { id: 's1', fichier: 'scenes/01.html', duree: 3, textes: { titre: 'Un' } },
      { id: 's2', fichier: 'scenes/02.html', duree: 3, textes: { titre: 'Deux' }, ...(transition ? { transition } : {}) },
    ];
  });
  ecrire(dir, 'effets/couche.json', { version: 1, nom: 'couche', rendu_calque: { bloom: 0 }, emetteurs: [{ nom: 'e',
    naissance: { debit: 300, forme: { type: 'ancre' }, vie: [20, 20], taille: [0.3, 0.3] },
    forces: [{ type: 'gravite', valeur: 60 }], vie: { couleur: '#ffffff' },
    collisions: { cibles: ['elements'], reponse: 'poser', empiler: true, epaisseur: 0.4, talus: 40 }, rendu: { melange: 'alpha' } }] });
  const scene = (id, gauche, debut) => `<section data-scene="${id}">
  <style>@scope { #source { position: absolute; left: ${gauche}cqh; top: 10cqh; width: 30cqh; height: 1cqh; } }</style>
  <h1 data-texte="titre"></h1>
  <div id="source"></div>
  <div data-effet="couche" data-ancre="#source" data-start="${debut}" data-dur="1"></div>
</section>`;
  ecrire(dir, 'scenes/01.html', scene('s1', 30, debut1));
  ecrire(dir, 'scenes/02.html', scene('s2', 50, 0));
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
    // Particules posées sur le sol de la vidéo (entrée 3) : position, x local du contact, case du profil.
    const e = await M.particules.lireEtat('s2', 0, 0);
    const cf = await M.particules.lireContacts('s2', 0, 0);
    const c = new Uint32Array(cf.buffer);
    const u = new Uint32Array(e.buffer);
    const posees = [];
    for (let s = 0; s < e.length / 16; s++) if (u[s * 16 + 14] === 1 && c[s * 8 + 2] === 3) posees.push({ x: e[s * 16], y: e[s * 16 + 1], lx: cf[s * 8], cel: c[s * 8 + 7] });
    envoyer({ webgpu: true, h, somme, posees });
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
  contactsCoherents(direct.posees);
});

/** x local du contact sur le sol de la vidéo (centre en L / 2) et case du profil cohérents avec la position. */
function contactsCoherents(posees) {
  const L = 177.78;
  assert.ok(posees.length > 50, `${posees.length} particules posées sur le sol de la vidéo`);
  for (const p of posees) {
    assert.ok(Math.abs(p.lx - (p.x - L / 2)) < 0.05, `x local ${p.lx} pour x = ${p.x}`);
    // À une case près (arrondis en f32 au bord d'une case) ; une largeur nulle mettait tout dans la case 255.
    assert.ok(Math.abs(p.cel - (p.lx / (L / 2) * 0.5 + 0.5) * 256) < 1.01, `case ${p.cel} pour x local ${p.lx}`);
  }
}

test('page : effet de la scène 1 qui commence plus tard (data-start 0.5) : mêmes couches par deux chemins, contacts au bon x local', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = projet({ debut1: 0.5 });
  const direct = JSON.parse(await executerPage(avecChemin(html, [5.9])));
  assert.equal(direct.erreur, undefined, direct.erreur);
  if (direct.webgpu === false) return t.skip('WebGPU indisponible');
  const continu = JSON.parse(await executerPage(avecChemin(html, [0.5, 1.5, 2.5, 2.99, 3.5, 4.5, 5.9])));
  assert.equal(continu.erreur, undefined, continu.erreur);
  assert.deepEqual(direct.h, continu.h, 'mêmes hauteurs par un seek direct et par une lecture continue');
  assert.equal(direct.somme, continu.somme, 'même image');
  const L = 177.78;
  const caseDe = (x) => Math.floor(x / L * 256);
  assert.ok(direct.h[caseDe(35)] > 0.5, `couche de s1 sous x = 35 : ${direct.h[caseDe(35)]}`);
  assert.ok(direct.h[255] < 1e-6, `rien au bord droit (case 255) : ${direct.h[255]}`);
  contactsCoherents(direct.posees);
  contactsCoherents(continu.posees);
});

function avecCouche(html, chemin) {
  return html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const r = { webgpu: true };
    for (const t of ${JSON.stringify(chemin)}) {
      await M.seek(t);
      if (t === 3.3) {
        // s2 à τ = 0,8 s : ses flocons tombent encore (y vers 29) ; seule la couche héritée de s1 est au sol.
        const p = await M.particules.lirePixels('s2', 'avant');
        const k = p.hauteur / 100;
        const alpha = (x, y) => p.donnees[(Math.round(y * k) * p.largeur + Math.round(x * k)) * 4 + 3];
        let somme = 0;
        for (const x of p.donnees) somme += x;
        r.couche = { somme, a35: alpha(35, 84.2), a120: alpha(120, 84.2), a35haut: alpha(35, 70) };
        r.h = Array.from(await M.particules.lireHauteurs('s2', 0));
      }
    }
    const e = await M.particules.lireEtat('s2', 0, 0);
    const c = new Uint32Array((await M.particules.lireContacts('s2', 0, 0)).buffer);
    const u = new Uint32Array(e.buffer);
    r.posees = [];
    for (let s = 0; s < e.length / 16; s++) if (u[s * 16 + 14] === 1 && c[s * 8 + 2] === 3) r.posees.push({ x: e[s * 16], y: e[s * 16 + 1] });
    envoyer(r);
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
}

test('page : transition (« Hiver » à deux scènes) : couche héritée dessinée dans la scène 2, flocons posés dessus, deux chemins', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  // s1 : 0 à 3 s ; s2 (glissement) : 2,5 à 5,5 s. L'effet de s1 est encore affiché quand celui de s2 commence.
  const html = projet({ transition: 'glissement' });
  const direct = JSON.parse(await executerPage(avecCouche(html, [3.3, 5.4])));
  assert.equal(direct.erreur, undefined, direct.erreur);
  if (direct.webgpu === false) return t.skip('WebGPU indisponible');
  const continu = JSON.parse(await executerPage(avecCouche(html, [0.5, 1.5, 2.5, 2.8, 3.3, 4.5, 5.4])));
  assert.equal(continu.erreur, undefined, continu.erreur);
  const L = 177.78;
  const caseDe = (x) => Math.floor(x / L * 256);
  // Contribution de s1 prise au début de l'effet de s2 (2,5 s), pas seulement après sa fin.
  assert.ok(direct.h[caseDe(35)] > 0.5, `couche héritée sous x = 35 : ${direct.h[caseDe(35)]}`);
  assert.ok(direct.couche.a35 > 100, `couche dessinée au sol en x = 35 : alpha ${direct.couche.a35}`);
  assert.equal(direct.couche.a120, 0, 'rien au sol hors de la couche (x = 120)');
  assert.equal(direct.couche.a35haut, 0, 'rien au-dessus de la couche');
  assert.deepEqual(direct.h, continu.h, 'mêmes hauteurs par deux chemins');
  assert.equal(direct.couche.somme, continu.couche.somme, 'même image par deux chemins');
  // Nouveaux flocons de s2 au-dessus de la couche héritée (sans elle, les premiers se poseraient à 84,85).
  const surCouche = direct.posees.filter((p) => p.x > 52 && p.x < 58);
  assert.ok(surCouche.length >= 5, `${surCouche.length} flocons posés vers x = 55`);
  assert.ok(surCouche.every((p) => p.y < 84), `flocons sur la couche : y max ${Math.max(...surCouche.map((p) => p.y))}`);
  assert.deepEqual(direct.posees, continu.posees, 'mêmes flocons posés par deux chemins');
});
