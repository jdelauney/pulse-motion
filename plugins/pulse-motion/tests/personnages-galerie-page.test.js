'use strict';
/* Spec « Mouvement vivant », plan V6 « Galerie de personnages » (5.17) dans le navigateur : chaque personnage livré joue toutes
 * les poses, tous les clips et toutes les expressions sans pièce détachée, sur les pages des planches ; une image à trois
 * personnages livrés coûte au plus 1,5 fois celle du Touffu. Unitaires : personnages-galerie.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const P = require('../scripts/lib/personnages.js');
const PL = require('../scripts/lib/planche-personnages.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const lu = P.lire(null);
const LIVRES = ['ecoliere', 'soignant', 'grand-mere', 'technicien', 'cuisiniere', 'guide'];
const VUES = [0, 45, 90, -90, 180];

// Paires de pièces qui se touchent : une pièce détachée n'en touche plus aucune.
const PAIRES = [['torse', 'tete'], ...['Avant', 'Arriere'].flatMap((c) => [['torse', `cuisse${c}`], [`cuisse${c}`, `tibia${c}`], [`tibia${c}`, `pied${c}`],
  ['torse', `bras${c}`], [`bras${c}`, `avantBras${c}`], [`avantBras${c}`, `main${c}`]])];

const VERIFIER = `(() => {
  const paires = ${JSON.stringify(PAIRES)};
  const fautes = [];
  let vus = 0;
  document.querySelectorAll('#planche > g').forEach((g, k) => {
    const boite = (nom) => { const p = g.querySelector('[data-piece="' + nom + '"]'); if (!p) return null; const r = p.getBoundingClientRect(); return r.width || r.height ? r : null; };
    for (const [a, b] of paires) {
      const A = boite(a), B = boite(b);
      // Une main sans dessin (manière « traits ») n'a pas de boîte : le bout arrondi de l'avant-bras en tient lieu.
      if (!A || !B) { if (!/^main/.test(b)) fautes.push(k + ' : ' + a + '/' + b + ' sans boîte'); continue; }
      vus++;
      const ecart = Math.max(A.left - B.right, B.left - A.right, A.top - B.bottom, B.top - A.bottom);
      if (ecart > 0.5) fautes.push(k + ' : ' + a + ' et ' + b + ' séparés de ' + ecart.toFixed(1) + ' px');
    }
  });
  return { fautes, vus, personnages: document.querySelectorAll('#planche > g').length };
})()`;

let page = null;
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-galerie-perso-'));
async function charger(html) {
  if (!page) page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 1200 });
  const f = path.join(dossier, 'p.html');
  fs.writeFileSync(f, html);
  await page.aller(pathToFileURL(f).href);
}
test.after(async () => { if (page) await page.fermer(); fs.rmSync(dossier, { recursive: true, force: true }); });

test('personnages : chaque dessin joue toutes les poses, tous les clips et toutes les expressions livrés sans pièce détachée (planche)', { ...SANS, timeout: 300000 }, async () => {
  for (const nom of LIVRES) {
    const dessin = lu.dessins[nom];
    const gabarit = P.gabaritDe(dessin, lu);
    const objets = [...Object.keys(lu.poses).map((n) => ['pose', n, lu.poses[n]]), ...Object.keys(lu.clips).map((n) => ['clip', n, lu.clips[n]])];
    for (const [type, n, objet] of objets) {
      const { html } = PL.pagePlanche({ nom: n, type, objet, lu, gabarit, vues: VUES, images: 8, dessin });
      await charger(html);
      const r = await page.evaluer(VERIFIER);
      assert.deepEqual(r.fautes, [], `${nom}, ${type} ${n}`);
      assert.ok(r.vus >= r.personnages * 10, `${nom}, ${type} ${n} : ${r.vus} paires vues`);
    }
    // Toutes les expressions et toutes les bouches : la planche du visage, chaque vignette a ses yeux et sa bouche.
    const { html } = PL.pageVisage({ nom, dessin, lu, gabarit, vues: [0, 45, 90] });
    await charger(html);
    const v = await page.evaluer(`(() => {
      const cellules = [...document.querySelectorAll('[data-visage]')];
      return cellules.map((c) => {
        const vue = [...c.querySelectorAll('[data-visage-vue]')].find((x) => x.style.display !== 'none');
        if (!vue) return 'aucune vue';
        const yeux = [...vue.querySelectorAll('[data-oeil]')].filter((o) => o.getBoundingClientRect().width > 2).length;
        const bouche = [...vue.querySelectorAll('[data-bouche-nom]')].filter((b) => b.style.display !== 'none').length;
        return yeux === 2 && bouche === 1 ? 'ok' : yeux + ' yeux, ' + bouche + ' bouche';
      });
    })()`);
    assert.ok(v.length >= 3 * (6 + P.BOUCHES.length), `${nom} : ${v.length} vignettes`);
    assert.deepEqual(v.filter((x) => x !== 'ok'), [], nom);
  }
});

test('personnages : coût de rendu d\'une image à 3 personnages livrés dans la borne de § 3 (1,5 fois)', { ...SANS, timeout: 120000 }, async () => {
  const mesurer = async (noms) => {
    const dir = copierProjet('projet-simple');
    const persos = noms.map((n, i) => `<div id="p${i}" data-personnage="${n}" data-x="${15 + 30 * i}" data-taille="45"><i data-action="marcher" data-vers="${25 + 30 * i}" data-start="0" data-dur="1.5"></i><i data-action="jouer" data-clip="coucou" data-start="2"></i><i data-action="expression" data-expression="joie" data-start="1"></i></div>`).join('');
    fs.writeFileSync(path.join(dir, 'scenes', '01-intro.html'), `<section data-scene="intro"><h1 data-texte="titre"></h1>${persos}</section>`);
    const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
    assert.equal(r.ok, true, JSON.stringify(r.erreurs));
    const p = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 720 });
    try {
      const f = path.join(dir, 'cout.html');
      fs.writeFileSync(f, r.html);
      await p.aller(pathToFileURL(f).href);
      await p.evaluer('(async () => { await M.pret; return true; })()');
      // Meilleur de 3 passes de 90 images (3 s à 30 i/s), mise en page comprise.
      return await p.evaluer(`(() => {
        let meilleur = Infinity;
        for (let passe = 0; passe < 4; passe++) {
          const t0 = performance.now();
          for (let i = 0; i < 90; i++) { M.rendre(i / 30); document.getElementById('pm-scene').getBoundingClientRect(); }
          if (passe) meilleur = Math.min(meilleur, performance.now() - t0);
        }
        return meilleur;
      })()`);
    } finally {
      await p.fermer();
    }
  };
  const touffu = await mesurer(['touffu', 'touffu', 'touffu']);
  const livres = await mesurer(['ecoliere', 'technicien', 'cuisiniere']);
  assert.ok(livres <= 1.5 * touffu, `trois livrés ${livres.toFixed(1)} ms, trois Touffus ${touffu.toFixed(1)} ms (90 images)`);
});
