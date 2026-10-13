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

test('page : neige posée au-dessus des lettres d\'un mot ; masque vide : alerte, obstacle ignoré', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'HI'; });
  ecrire(dir, 'effets/flocons.json', { version: 1, nom: 'flocons', rendu_calque: { bloom: 0 }, emetteurs: [{ nom: 'e',
    naissance: { salves: [{ t: 0, nombre: 400 }], forme: { type: 'ancre' }, vie: [10, 10], taille: [0.6, 0.6] },
    forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['formes'], reponse: 'poser' }, rendu: { melange: 'alpha' } }] });
  ecrire(dir, 'scenes/01-s.html', `<section data-scene="s">
  <style>@scope {
    #mot { position: absolute; left: 30cqh; top: 40cqh; margin: 0; font: 900 40cqh/1 sans-serif; letter-spacing: 10cqh; }
    #source { position: absolute; left: 25cqh; top: 5cqh; width: 110cqh; height: 1cqh; }
    @keyframes sortie { from { opacity: 1; } to { opacity: 0; } }
    #fugace { position: absolute; left: 0; top: 90cqh; width: 177cqh; height: 5cqh; background: #f00; animation: sortie 1s linear both; }
  }</style>
  <h1 id="mot" data-texte="titre" data-obstacle="forme"></h1>
  <div id="fugace" data-start="0" data-dur="1" data-obstacle="forme"></div>
  <div id="source"></div>
  <div data-effet="flocons" data-ancre="#source" data-start="0" data-dur="0.1"></div>
</section>`);
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs, []);
  const html = a.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    await M.seek(3);
    const p = await M.particules.lireEtat('s', 0, 0);
    const c = new Uint32Array((await M.particules.lireContacts('s', 0, 0)).buffer);
    const u = new Uint32Array(p.buffer);
    const el = document.getElementById('mot');
    const section = el.closest('section');
    const repere = M.particulesInterne.mesurerReperes([el], section)[0];
    const m = await M.figer.masque(el);
    // Alpha du masque au point (cqh de la scène), via le repère de l'élément.
    const alpha = (x, y) => {
      const l = M.obstacles.versLocal(repere, [x, y]);
      const i = Math.floor((l[0] / repere.demi[0] * 0.5 + 0.5) * m.largeur);
      const j = Math.floor((l[1] / repere.demi[1] * 0.5 + 0.5) * m.hauteur);
      return i < 0 || j < 0 || i >= m.largeur || j >= m.hauteur ? 0 : m.alpha[j * m.largeur + i];
    };
    const l = [];
    for (let s = 0; s < p.length / 16; s++) {
      if (u[s * 16 + 14] !== 1) continue;
      const x = p[s * 16], y = p[s * 16 + 1];
      let dessous = false;
      // Contact gonflé du rayon (0,3) : la lettre peut être juste sous le flocon ou décalée d'un rayon (coin d'une lettre).
      for (let d = 0.05; d <= 1.6 && !dessous; d += 0.05) for (const dx of [-0.35, 0, 0.35]) if (alpha(x + dx, y + d) >= 128) { dessous = true; break; }
      l.push({ x, y, obstacle: c[s * 8 + 2], dedans: alpha(x, y) >= 128, dessous });
    }
    const panneau = document.querySelector('[data-effet] > .pm-effet-alerte');
    M.modeCapture(true);
    const enCapture = panneau ? getComputedStyle(panneau).display : null;
    M.modeCapture(false);
    envoyer({ webgpu: true, l, haut: repere.centre[1] - repere.demi[1], bas: repere.centre[1] + repere.demi[1], alertes: M.particules.alertes,
      formesVides: await M.particules.formesVides(), panneau: panneau ? panneau.textContent : null, enCapture, erreurs: document.querySelectorAll('.pm-effet-panneau').length });
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  const posees = r.l.filter((p) => p.obstacle === 3);
  assert.ok(posees.length >= 40, `${posees.length} flocons posés sur les lettres`);
  assert.ok(posees.every((p) => !p.dedans), 'aucun flocon dans une lettre');
  assert.ok(posees.every((p) => p.dessous), 'chaque flocon posé a une lettre juste sous lui (à 1,6 cqh au plus)');
  // Forme exacte, pas la boîte : certains se posent bas dans la boîte (barre du H), d'autres passent entre les lettres.
  assert.ok(posees.some((p) => p.y > r.haut + 8), 'des flocons posés sur la barre du H, sous le haut de la boîte');
  assert.ok(r.l.some((p) => p.obstacle !== 3 && p.y > r.bas), 'des flocons tombés entre les lettres, sous la boîte');
  // Le bandeau qui s'efface à la fin de son minutage : masque vide, alerte, pas d'obstacle.
  assert.equal(r.alertes.length, 1);
  assert.match(r.alertes[0], /Scène « s » : l'obstacle de forme exacte « #fugace » est invisible à la fin de son minutage \(masque vide\) ; il est ignoré\./);
  assert.ok(r.l.every((p) => p.obstacle !== 4), 'personne posé sur le bandeau effacé');
  // Remonté à la personne : panneau d'alerte sur l'effet (aperçu seulement), et contrôle de la vidéo (sans GPU).
  assert.equal(r.panneau, r.alertes[0]);
  assert.equal(r.enCapture, 'none', "panneau d'alerte masqué dans les images exportées");
  assert.equal(r.erreurs, 0, "pas de panneau d'erreur : l'effet est affiché");
  assert.deepEqual(r.formesVides, [{ scene: 's', element: 'fugace', message: r.alertes[0] }]);
});

/** Deux scènes au même titre « HI » (forme exacte) ; neige dans la scène « rang » seulement ; code : script de mesure. */
function deuxScenes(rang, code) {
  const dir = copierProjet('projet-particules');
  modifierDeroule(dir, (d) => {
    d.scenes = [
      { id: 's1', fichier: 'scenes/01.html', duree: 3, textes: { titre: 'HI' } },
      { id: 's2', fichier: 'scenes/02.html', duree: 4, textes: { titre: 'HI' } },
    ];
  });
  ecrire(dir, 'effets/flocons.json', { version: 1, nom: 'flocons', rendu_calque: { bloom: 0 }, emetteurs: [{ nom: 'e',
    naissance: { salves: [{ t: 0, nombre: 400 }], forme: { type: 'ancre' }, vie: [10, 10], taille: [0.6, 0.6] },
    forces: [{ type: 'gravite', valeur: 40 }], collisions: { cibles: ['formes'], reponse: 'poser' }, rendu: { melange: 'alpha' } }] });
  const scene = (id, effet) => `<section data-scene="${id}">
  <style>@scope {
    #mot-${id} { position: absolute; left: 30cqh; top: 40cqh; margin: 0; font: 900 40cqh/1 sans-serif; letter-spacing: 10cqh; }
    #source-${id} { position: absolute; left: 25cqh; top: 5cqh; width: 110cqh; height: 1cqh; }
  }</style>
  <h1 id="mot-${id}" data-texte="titre" data-obstacle="forme"></h1>
  <div id="source-${id}"></div>
  ${effet ? `<div data-effet="flocons" data-ancre="#source-${id}" data-start="0" data-dur="0.1"></div>` : ''}
</section>`;
  ecrire(dir, 'scenes/01.html', scene('s1', rang === 1));
  ecrire(dir, 'scenes/02.html', scene('s2', rang === 2));
  const a = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const id = 's' + rang;
  return a.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    ${code || `await M.seek(${rang === 1 ? 2.5 : 5.5});
    const p = await M.particules.lireEtat('${id}', 0, 0);
    const c = new Uint32Array((await M.particules.lireContacts('${id}', 0, 0)).buffer);
    const u = new Uint32Array(p.buffer);
    const ys = [];
    for (let s = 0; s < p.length / 16; s++) if (u[s * 16 + 14] === 1 && c[s * 8 + 2] === 3) ys.push(p[s * 16 + 1]);
    envoyer({ webgpu: true, ys });`}
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>
</body>`);
}

test("page : forme exacte d'une scène qui n'est pas la première (masque pris scène masquée) : même pose qu'en scène 1", async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const r1 = JSON.parse(await executerPage(deuxScenes(1)));
  assert.equal(r1.erreur, undefined, r1.erreur);
  if (r1.webgpu === false) return t.skip('WebGPU indisponible');
  const r2 = JSON.parse(await executerPage(deuxScenes(2)));
  assert.equal(r2.erreur, undefined, r2.erreur);
  // Lettres de 40 cqh dont le haut est vers y = 40 : flocons posés sur les lettres (pas au-dessus du champ ni ailleurs).
  assert.ok(r1.ys.length >= 40, `scène 1 : ${r1.ys.length} flocons posés sur les lettres`);
  assert.ok(r2.ys.length >= 40, `scène 2 : ${r2.ys.length} flocons posés sur les lettres`);
  assert.ok(Math.abs(r2.ys.length - r1.ys.length) <= r1.ys.length * 0.1, `autant de flocons posés : ${r1.ys.length} et ${r2.ys.length}`);
  const moyenne = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  assert.ok(Math.abs(moyenne(r1.ys) - moyenne(r2.ys)) < 1, `même hauteur moyenne : ${moyenne(r1.ys)} et ${moyenne(r2.ys)}`);
  assert.ok(r2.ys.every((y) => y > 35 && y < 82), 'posés sur les lettres de la scène 2');
});

test('page : un échec en refaisant les formes après un changement de polices laisse les seeks répondre (panneau)', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const html = deuxScenes(1, `
    M.particulesInterne.creerFormes = () => { throw new Error('champ impossible'); };
    document.fonts.dispatchEvent(new Event('loadingdone'));
    const fini = await Promise.race([M.seek(1).then(() => true), new Promise((ok) => setTimeout(() => ok(false), 20000))]);
    const panneau = (document.querySelector('[data-effet] > .pm-effet-panneau') || {}).textContent || null;
    envoyer({ webgpu: true, fini, panneau });`);
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  if (r.webgpu === false) return t.skip('WebGPU indisponible');
  assert.equal(r.fini, true, 'le seek se termine');
  assert.match(r.panneau || '', /champ impossible/);
});
