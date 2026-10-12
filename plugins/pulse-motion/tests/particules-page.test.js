'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, EFFETS, copierProjet } = require('./aide/projet.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');
const { optionsWebGPU, executerPage } = require('./aide/gpu.js');

const CODE = `
<script>
(async () => {
  const envoyer = (o) => fetch('/_resultat', { method: 'POST', body: JSON.stringify(o) });
  try {
    await M.particules.pret;
    if (!M.particules.disponible) return envoyer({ webgpu: false });
    const lire = async (t, calque = 'avant') => { await M.seek(t); return M.particules.lirePixels('s', calque); };
    const egal = (a, b) => a.largeur === b.largeur && a.hauteur === b.hauteur && a.donnees.every((x, i) => x === b.donnees[i]);
    const somme = (p) => { let s = 0; for (const x of p.donnees) s += x; return s; };
    const r = { webgpu: true };
    await M.seek(0);
    const direct = await lire(2.2);
    r.hasardDirect = document.getElementById('hasard').style.left;
    await M.seek(5);
    const detour = await lire(2.2);
    r.hasardDetour = document.getElementById('hasard').style.left;
    r.deterministe = egal(direct, detour);
    // Aller-retour dans la fenêtre de l'effet : restaure un instantané et rejoue des pas.
    await M.seek(3.4);
    r.deterministeFenetre = egal(direct, await lire(2.2));
    // Les particules suivent l'ancre (le carré glisse de 10 cqh par seconde).
    const moyenneX = async (t) => {
      await M.seek(t);
      const e = await M.particules.lireEtat('s', 0, 0);
      const u = new Uint32Array(e.buffer);
      let somme = 0, n = 0;
      for (let i = 0; i < e.length; i += 16) if (u[i + 14] === 1) { somme += e[i]; n++; }
      return n ? somme / n : NaN;
    };
    r.x1 = await moyenneX(1);
    r.x22 = await moyenneX(2.2);
    r.sectionsIsolees = [...document.querySelectorAll('#pm-scene > section.pm-avec-calques')].map((s) => getComputedStyle(s).isolation);
    await M.seek(5);
    r.etatLibere = await M.particules.lireEtat('s', 0, 0).then(() => false, () => true);
    r.nonVide = somme(direct) > 0;
    r.videAvant = somme(await lire(0.2)) === 0;
    r.videApres = somme(await lire(5)) === 0;
    r.arriere = somme(await lire(1.5, 'arriere')) > 0;
    r.finDeScene = somme(await lire(5.9, 'arriere')) > 0;
    r.calques = [...document.querySelectorAll('.pm-calque')].map((c) => c.getAttribute('data-pm-calque') + ':' + getComputedStyle(c).zIndex).sort();
    const avantPerte = await lire(2.2);
    M.particules.device.destroy();
    await new Promise((ok) => setTimeout(ok, 200));
    await M.particules.pret;
    r.apresPerte = M.particules.disponible && egal(avantPerte, await lire(2.2));
    // Seek lancé dans la fenêtre de perte, avant que device.lost soit résolue.
    await M.seek(5);
    M.particules.device.destroy();
    await M.seek(2.2);
    r.seekPendantPerte = M.particules.disponible && egal(avantPerte, await M.particules.lirePixels('s', 'avant'));
    envoyer(r);
  } catch (e) { envoyer({ erreur: String(e && e.stack || e) }); }
})();
</script>`;

function page(dir) {
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  return r.html;
}

test('calques : image reproductible, vide hors fenêtre, calques ordonnés, reprise après perte du GPU', async (t) => {
  if (!(await optionsWebGPU())) return t.skip('WebGPU indisponible sans fenêtre');
  const dir = copierProjet('projet-particules');
  const f = path.join(dir, 'scenes', '01-s.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', "  <p id=\"hasard\" data-start=\"0\"></p><script>M.chaqueImage('s', function () { document.getElementById('hasard').style.left = (Math.random() * 10).toFixed(6) + 'cqh'; });</script>\n</section>"));
  const html = page(dir).replace('</body>', `${CODE}\n</body>`);
  const r = JSON.parse(await executerPage(html));
  assert.equal(r.erreur, undefined, r.erreur);
  assert.equal(r.webgpu, true);
  assert.equal(r.nonVide, true, 'des particules sont dessinées à 2,2 s');
  assert.equal(r.deterministe, true, 'même image par 0 → 2,2 et par 5 → 2,2 (ancre animée)');
  assert.equal(r.deterministeFenetre, true, 'même image par 0 → 2,2 et par 3,4 → 2,2 (instantané restauré, pas rejoués)');
  assert.ok(r.x22 - r.x1 > 8, "les particules suivent l'ancre : x(2,2) − x(1) = " + (r.x22 - r.x1));
  assert.deepEqual(r.sectionsIsolees, ['isolate']);
  assert.equal(r.etatLibere, true, "simulation détruite hors de la fenêtre de l'effet");
  assert.equal(r.seekPendantPerte, true, 'seek pendant la perte du GPU : image correcte');
  assert.equal(r.videAvant, true);
  assert.equal(r.videApres, true);
  assert.equal(r.arriere, true);
  assert.equal(r.finDeScene, true);
  assert.deepEqual(r.calques, ['arriere:-1', 'avant:1000']);
  assert.equal(r.apresPerte, true);
  assert.ok(r.hasardDirect, 'Math.random a été appelé par la scène');
  assert.equal(r.hasardDirect, r.hasardDetour, 'Math.random reproductible par deux chemins');
});

test('sans WebGPU : panneau sur chaque effet, panneau d\'erreur, page lisible', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-particules');
  const scene = fs.readFileSync(path.join(dir, 'scenes', '01-s.html'), 'utf8').replace('</section>', '  <div data-effet="inconnu"></div>\n</section>');
  fs.writeFileSync(path.join(dir, 'scenes', '01-s.html'), scene);
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  const html = r.html.replace('<body>', '<body>\n<script>window.__PM_SANS_GPU__ = true;</script>');
  const fichier = path.join(dossierTemporaire('pm-sans-gpu-'), 'page.html');
  fs.writeFileSync(fichier, html);
  const dom = await rendreDOM(trouverNavigateur(), fichier);
  const panneaux = dom.match(/class="pm-effet-panneau">[^<]*/g) || [];
  assert.equal(panneaux.filter((p) => /Effet non affiché : WebGPU indisponible\. Ouvrez la vidéo dans Chrome ou Edge récent\./.test(p)).length, 3);
  assert.equal(panneaux.filter((p) => /Effet « inconnu » introuvable/.test(p)).length, 1);
  assert.match(dom, /data-pm-pret/);
});

test('sans effet : aucun calque ni panneau dans la page', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const r = assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  const fichier = path.join(dossierTemporaire('pm-sans-effet-'), 'page.html');
  fs.writeFileSync(fichier, r.html);
  const dom = await rendreDOM(trouverNavigateur(), fichier);
  assert.match(dom, /data-pm-pret/);
  assert.doesNotMatch(dom, /<canvas[^>]*pm-calque/);
  assert.doesNotMatch(dom, /class="pm-effet-panneau"/);
});

test('zone d\'effet : une classe de scène place la balise, sans classe elle couvre la scène', { skip: !trouverNavigateur() && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-effets');
  fs.writeFileSync(path.join(dir, 'scenes', '01-etincelles.html'), `<section data-scene="etincelles">
  <style>@scope { .zone-feu { inset: 70% auto auto 30%; width: 40%; height: 10%; } }</style>
  <h1 id="titre" data-texte="titre" data-start="0.2"></h1>
  <div id="zone" class="zone-feu" data-effet="simple"></div>
  <div id="plein" data-effet="simple"></div>
</section>`);
  const r = assembler({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ecrire: false });
  assert.deepEqual(r.erreurs, []);
  const mesure = `<script>window.__PM_SANS_GPU__ = true;
setTimeout(function () {
  var s = document.querySelector('section[data-scene]').getBoundingClientRect();
  function rel(id) { var b = document.getElementById(id).getBoundingClientRect(); return [(b.left - s.left) / s.width, (b.top - s.top) / s.height, b.width / s.width, b.height / s.height]; }
  var pre = document.createElement('pre'); pre.id = 'mesure-zone';
  pre.textContent = JSON.stringify({ zone: rel('zone'), plein: rel('plein') });
  document.body.appendChild(pre);
}, 500);</script>`;
  const fichier = path.join(dossierTemporaire('pm-zone-'), 'page.html');
  fs.writeFileSync(fichier, r.html.replace('<body>', `<body>\n${mesure}`));
  const dom = await rendreDOM(trouverNavigateur(), fichier);
  const m = /<pre id="mesure-zone">([^<]*)<\/pre>/.exec(dom);
  assert.ok(m, 'mesure absente de la page');
  const { zone, plein } = JSON.parse(m[1]);
  const proche = (a, b) => Math.abs(a - b) < 0.02;
  assert.ok(proche(zone[0], 0.3) && proche(zone[1], 0.7) && proche(zone[2], 0.4) && proche(zone[3], 0.1), 'zone placée à 30 % / 70 % : ' + zone);
  assert.ok(proche(plein[0], 0) && proche(plein[1], 0) && proche(plein[2], 1) && proche(plein[3], 1), 'sans classe, toute la scène : ' + plein);
});
