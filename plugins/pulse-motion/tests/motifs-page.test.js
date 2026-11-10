'use strict';
/* Spec « Mouvement vivant », plan V5 « Motifs » (5.11) dans la page : défilement sans raccord, cercle d'inondation jusqu'au coin
 * le plus loin, hélice identique en export rapide et en capture fidèle, et les règles du mouvement sur les motifs.
 * Unitaires : motifs.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { decoder } = require('../scripts/lib/png.js');
const { charger } = require('../scripts/mouvements.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const DICO = charger();
const exemple = (no) => DICO.mouvements.find((e) => e.no === no).recette.exemple;
const CAPTURE = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'capture.js'), 'utf8');

function projet(scenes, { tempo = null } = {}) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  scenes.forEach(([id, html], i) => fs.writeFileSync(path.join(dir, 'scenes', `0${i + 1}-${id}.html`), html));
  modifierDeroule(dir, (d) => {
    d.scenes = scenes.map(([id, , duree], i) => ({ id, fichier: `scenes/0${i + 1}-${id}.html`, duree, textes: { titre: 'Un titre', texte: 'Un texte' }, transition: 'coupe' }));
    if (tempo) d.tempo = { bpm: tempo };
  });
  return dir;
}
function page(dir, nom = 'page.html') {
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false, groupes: 'tous' });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const fichier = path.join(dir, nom);
  fs.writeFileSync(fichier, r.html);
  return fichier;
}
async function ouvrir(fichier) {
  const p = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
  await p.aller(pathToFileURL(fichier).href);
  await p.evaluer('(async () => { await M.pret; await document.fonts.ready; return true; })()');
  return p;
}

test('#087 défilement : raccord invisible à chaque tour', SANS, async () => {
  const p = await ouvrir(page(projet([['logos', `<section data-scene="logos">\n${exemple('087')}\n</section>`, 45]])));
  try {
    const r = await p.evaluer(`(() => {
      const piste = document.querySelector('.pm-v-defile');
      const items = piste.children;
      const x = (t, i) => { M.rendre(t); return items[i].getBoundingClientRect().left; };
      const n = items.length / 2;
      const anim = piste.getAnimations()[0].effect.getComputedTiming();
      const P = anim.duration / 1000;
      const mesures = [];
      for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) mesures.push({ debut: x(k * P + 0.001, i), fin: x((k + 1) * P - 0.001, i + n) });
      return { n, P, iterations: anim.iterations, mesures, largeur: piste.getBoundingClientRect().width, pas: items[1].getBoundingClientRect().left - items[0].getBoundingClientRect().left };
    })()`);
    assert.equal(r.n, 4);
    assert.equal(r.P, 20);
    assert.ok(r.iterations > 2 && r.iterations < 2.3, `fenêtre de 45 s : ${r.iterations} tours (boucle continue)`);
    // À la fin de chaque tour, le logo n° i + n est exactement là où le logo n° i était au début du tour.
    for (const m of r.mesures) assert.ok(Math.abs(m.fin - m.debut) < 0.6, `raccord : ${m.fin} au lieu de ${m.debut}`);
    // La piste contient deux fois la liste, avec l'écart après chaque logo : un tour = la moitié de sa largeur.
    assert.ok(Math.abs(r.largeur / 2 - r.n * r.pas) < 0.6, `${r.largeur} / 2 ≠ ${r.n} × ${r.pas}`);
    // Les règles du mouvement ne signalent ni le raccord du défilement ni le battement de la pulsation.
  } finally {
    await p.fermer();
  }
});

test('#090 inondation : coin le plus loin couvert à la fin, pour quatre points de départ', SANS, async () => {
  const points = [[80, 70], [10, 20], [50, 50], [0, 100]];
  const html = `<section data-scene="flot">\n<h2 data-texte="titre" data-start="0.2"></h2>\n${points.map(([x, y], i) => `<div id="f${i}" class="pm-m-inonde" data-decor data-start="0.5" data-dur="0.32" style="--pm-x: ${x}; --pm-y: ${y}"></div>`).join('\n')}\n</section>`;
  const p = await ouvrir(page(projet([['flot', html, 3]])));
  try {
    const r = await p.evaluer(`(() => {
      const scene = document.getElementById('pm-scene').getBoundingClientRect();
      const lire = (t) => { M.rendre(t); return [...document.querySelectorAll('.pm-m-inonde')].map((el) => getComputedStyle(el).clipPath); };
      return { L: scene.width, H: scene.height, debut: lire(0.4), fin: lire(1) };
    })()`);
    points.forEach(([x, y], i) => {
      assert.match(r.debut[i], /^circle\(0px at /, `avant : ${r.debut[i]}`);
      const m = /^circle\(([\d.]+)px at ([\d.]+)% ([\d.]+)%\)$/.exec(r.fin[i]);
      assert.ok(m, r.fin[i]);
      assert.deepEqual([Number(m[2]), Number(m[3])], [x, y]);
      const cx = x / 100 * r.L, cy = y / 100 * r.H;
      const loin = Math.max(...[[0, 0], [r.L, 0], [0, r.H], [r.L, r.H]].map(([a, b]) => Math.hypot(a - cx, b - cy)));
      assert.ok(Number(m[1]) >= loin, `(${x}, ${y}) : rayon ${m[1]} < coin le plus loin ${loin}`);
      assert.ok(Math.abs(Number(m[1]) - 1.05 * loin) < 1, `(${x}, ${y}) : rayon ${m[1]} ≠ 1,05 × ${loin}`);
    });
  } finally {
    await p.fermer();
  }
});

test('#093 hélice : planche de l\'export rapide identique à la capture fidèle à 2 % près', { ...SANS, timeout: 120000 }, async () => {
  const L = 640, H = 360;
  const fichier = page(projet([['helice', `<section data-scene="helice">\n${exemple('093')}\n</section>`, 6]]));
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur: L, hauteur: H, navigateur, delai: 60000 });
  try {
    await c.evaluer(`${CAPTURE}; true`);
    for (const t of [0.5, 2, 3.5, 5.5]) {
      const fidele = decoder(await c.capturer(t));
      const rapide = decoder(Buffer.from(await c.evaluer(`(async () => {
        const canvas = document.createElement('canvas'); canvas.width = ${L}; canvas.height = ${H};
        const ctx = canvas.getContext('2d');
        await M.capturer(ctx, ${L}, ${H});
        return canvas.toDataURL('image/png').split(',')[1];
      })()`), 'base64'));
      assert.deepEqual([rapide.largeur, rapide.hauteur], [fidele.largeur, fidele.hauteur]);
      let differents = 0;
      const n = fidele.largeur * fidele.hauteur;
      for (let i = 0; i < n; i++) {
        let ecart = 0;
        for (let k = 0; k < 3; k++) ecart = Math.max(ecart, Math.abs(fidele.donnees[i * fidele.canaux + k] - rapide.donnees[i * rapide.canaux + k]));
        if (ecart > 32) differents++;
      }
      assert.ok(differents / n <= 0.02, `t = ${t} s : ${(100 * differents / n).toFixed(2)} % de pixels différents`);
    }
  } finally {
    await c.fermer();
  }
});

test('motifs : ni raccord-boucle sur le défilement et la pulsation, ni hors-champ de leurs boucles', SANS, async () => {
  const html = `<section data-scene="motifs">\n${exemple('087')}\n${exemple('083')}\n</section>`;
  const p = await ouvrir(page(projet([['motifs', html, 30]], { tempo: 120 })));
  try {
    const constats = await p.evaluer('JSON.stringify(M.mesurerMouvement({ seuils: {} }))');
    const liste = JSON.parse(constats);
    assert.deepEqual(liste.filter((x) => x.regle === 'raccord-boucle'), [], constats);
    // La pulsation bat sur chaque temps (0,5 s à 120 bpm) et finit au repos.
    const r = await p.evaluer(`(() => {
      const el = document.querySelector('h2.pm-v-cogne');
      const a = el.getAnimations()[0].effect.getComputedTiming();
      M.rendre(0.0001); const debut = getComputedStyle(el).scale;
      M.rendre(29.999); const fin = getComputedStyle(el).scale;
      return { duree: a.duration, iterations: a.iterations, debut, fin };
    })()`);
    assert.equal(r.duree, 500);
    assert.equal(r.iterations, 58, "fenêtre de 29 s (dernière scène : fin − 1 s)");
    assert.ok(Math.abs(parseFloat(r.debut) - 1.012) < 1e-3, `coup sur le temps : ${r.debut}`);
    assert.ok(Math.abs(parseFloat(r.fin) - 1) < 2e-3, `au repos : ${r.fin}`);
  } finally {
    await p.fermer();
  }
});
