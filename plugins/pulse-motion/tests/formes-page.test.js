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
    envoyer({ webgpu: true, l, haut: repere.centre[1] - repere.demi[1], bas: repere.centre[1] + repere.demi[1], alertes: M.particules.alertes });
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
  assert.match(r.alertes[0], /Scène « s » : un obstacle de forme exacte est invisible à la fin de son minutage \(masque vide\) ; il est ignoré\./);
  assert.ok(r.l.every((p) => p.obstacle !== 4), 'personne posé sur le bandeau effacé');
});
