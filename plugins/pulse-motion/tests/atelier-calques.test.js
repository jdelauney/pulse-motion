'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

/** Projet « particules » : une balise en erreur en tête (son rang compte), réglages facultatifs sur la gerbe. */
function assembler2(reglages) {
  const dir = copierProjet('projet-particules');
  const f = path.join(dir, 'scenes', '01-s.html');
  let html = fs.readFileSync(f, 'utf8').replace('<div data-effet="gerbe"', '<div data-effet="inconnu"></div>\n  <div data-effet="gerbe"');
  if (reglages) html = html.replace('<div data-effet="gerbe"', `<div data-effet="gerbe" data-reglages="${reglages}"`);
  fs.writeFileSync(f, html);
  return assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
}

function pageAvec(r, code) {
  return r.html.replace('</body>', `<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const lire = async () => {
      const p = await M.particules.lirePixels('s', 'avant');
      let h = 0x811c9dc5, somme = 0;
      for (const x of p.donnees) { h = Math.imul(h ^ x, 0x01000193) >>> 0; somme += x; }
      return { h, somme };
    };
    const empreinte = async (t) => { await M.seek(t); return lire(); };
    ${code}
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>\n</body>`);
}

test('remplacerEffet : même image que la page assemblée avec la recette remplacée ; rang des balises ; deux remplacements à la suite', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const a = assembler2(null);
  const b = assembler2('nombre: 900; vitesse: 1.6');
  const effetA = a.effets.find((e) => e.ordre === 1).effet;
  const effetB = b.effets.find((e) => e.ordre === 1).effet;
  const ra = JSON.parse(await executerPage(pageAvec(a, `
    const r = { webgpu: true, raison: M.particules.raison };
    r.avant = await empreinte(2.2);
    r.decrire = M.particules.decrire('s').map((d) => [d.ordre, d.calque, Math.round(d.debut * 100) / 100]);
    r.refus = await M.particules.remplacerEffet('s', 0, ${JSON.stringify(effetB)}).then(() => null, (e) => e.message);
    window.__pmMarque = 1;
    await M.particules.remplacerEffet('s', 1, ${JSON.stringify(effetB)});
    r.marque = window.__pmMarque;
    r.apres = await lire();
    await M.seek(5);
    r.chemin = await empreinte(2.2);
    // Deux remplacements sans attendre le premier : le dernier demandé gagne.
    const p1 = M.particules.remplacerEffet('s', 1, ${JSON.stringify(effetA)});
    const p2 = M.particules.remplacerEffet('s', 1, ${JSON.stringify(effetB)});
    await Promise.all([p1, p2]);
    r.concurrence = await lire();
    envoyer(r);
  `)));
  assert.equal(ra.erreur, undefined, ra.erreur);
  assert.equal(ra.webgpu, true);
  const rb = JSON.parse(await executerPage(pageAvec(b, 'envoyer({ webgpu: true, attendu: await empreinte(2.2) });')));
  assert.equal(rb.erreur, undefined, rb.erreur);
  assert.equal(ra.raison, null);
  assert.deepEqual(ra.decrire, [[1, 'avant', 0.5], [2, 'arriere', 1], [3, 'arriere', 5.5]]);
  assert.match(ra.refus, /Effet 0 de la scène « s » introuvable/);
  assert.equal(ra.marque, 1, 'sans rechargement');
  assert.ok(ra.avant.somme > 0);
  assert.notEqual(ra.avant.h, rb.attendu.h, 'les réglages changent l\'image');
  assert.equal(ra.apres.h, rb.attendu.h, 'même image que la page réassemblée');
  assert.equal(ra.chemin.h, rb.attendu.h, 'même image par un autre chemin après le remplacement');
  assert.equal(ra.concurrence.h, rb.attendu.h, 'le dernier remplacement demandé gagne');
});
