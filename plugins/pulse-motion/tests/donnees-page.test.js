'use strict';
/* Spec « Explication narrée » (S7), plan J2 « Données, code, formules » : critères rendus dans Chrome ou Edge sans fenêtre.
 * Graphiques (5.6), moyeu et schéma dans les styles livrés (5.7), code (5.9), formules (5.10), deux voies d'export, contrôle de la
 * vidéo rendue, preuve du déterminisme, coût par image et poids de la page (D8). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { prouver } = require('../scripts/lib/determinisme.js');
const { decoder } = require('../scripts/lib/png.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet, poserVoix } = require('./aide/mini-projet.js');
const { wavSinus } = require('./aide/son.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const CAPTURE = lire('moteur', 'capture.js');
const L = 640, H = 360;
const STYLES = fs.readdirSync(path.join(RACINE, 'styles')).filter((s) => fs.existsSync(path.join(RACINE, 'styles', s, 'catalogue.json'))).sort();

const VENTES = { type: 'barres', unite: '%', source: 'Insee, 2025', valeurs: [{ etiquette: '2023', valeur: 12, debut: 'mot:2023' }, { etiquette: '2024', valeur: 19, debut: 'mot:2024' }, { etiquette: '2025', valeur: 27, accent: true, debut: 'mot:2025' }] };
const SANS_MOTS = (g) => ({ ...g, valeurs: g.valeurs.map(({ debut, ...v }) => v) });
const COURBE = { type: 'courbe', valeurs: [{ etiquette: 'janv.', valeur: 8 }, { etiquette: 'févr.', valeur: 11 }, { etiquette: 'mars', valeur: 10 }, { etiquette: 'avr.', valeur: 15 }] };
const ANNEAU = { type: 'anneau', valeurs: [{ etiquette: 'Images', valeur: 55, accent: true }, { etiquette: 'Textes', valeur: 30 }, { etiquette: 'Sons', valeur: 15 }] };
const FORMULE = { langage: 'tableur', titre: 'Ventes.xlsx', etapes: [{ code: '=SOMME(B2:B13)' }, { code: '=MOYENNE(B2:B13)', debut: 'mot:moyenne', surligner: [1] }] };

/** Projet assemblé, page écrite. -> { dir, a, fichier } */
function page(scenes, { deroule = {}, style } = {}) {
  const dir = miniProjet({ scenes: scenes.map((s) => ({ duree: 5, transition: 'coupe', ...s })), deroule, ...(style ? { style } : {}) });
  return {
    dir,
    assembler() {
      const a = assembler({ dossier: dir, ecrire: false });
      assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
      const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
      fs.writeFileSync(fichier, a.html);
      return { a, fichier };
    },
  };
}
async function ouvrir(p, { largeur = L, hauteur = H } = {}) {
  const { a, fichier } = p.assembler();
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur, hauteur, navigateur, delai: 60000 });
  return { c, a, fichier };
}
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));
const traces = (c, t, id = 's') => json(c, `M.seek(${t}).then(function () { return M.dessin.traces(${JSON.stringify(id)}); })`);
const releve = (c, id = 's') => json(c, `M.seek(0).then(function () { return M.relever(${JSON.stringify(id)}); })`);
function ecart(a, b) {
  let s = 0;
  const n = a.largeur * a.hauteur;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) s += Math.abs(a.donnees[i * a.canaux + k] - b.donnees[i * b.canaux + k]);
  return s / (n * 3 * 255);
}
const rapide = async (c, l = L, h = H) => decoder(Buffer.from(await c.evaluer(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${l}; canvas.height = ${h};
  await M.capturer(canvas.getContext('2d'), ${l}, ${h});
  return canvas.toDataURL('image/png').split(',')[1];
})()`), 'base64'));
/** Hauteur (cqh) d'un rectangle tracé net « M x y L … Z ». */
const hauteur = (d) => { const y = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter((v, i) => i % 2); return Math.max(...y) - Math.min(...y); };
const instantMot = (a, mot, id = 's') => { const v = a.donnees.scenes.find((s) => s.id === id).voix; return v.debut + v.mots.find((m) => m.w.toLowerCase().replace(/[^\p{L}\d]/gu, '') === mot).t0; };

// --- 5.6 Graphiques ------------------------------------------------------------------------------------------------------

test('graphique : une barre à debut mot:2024 pousse quand la voix dit 2024', { ...SANS, timeout: 180000 }, async () => {
  const p = page([{ id: 's', duree: 6, html: '<figure id="ventes" data-graphique="ventes" data-start="0.2" style="width: 100cqh; height: 56cqh"></figure>', graphiques: { ventes: VENTES } }]);
  await poserVoix(p.dir, 's', wavSinus({ secondes: 4 }), 'les ventes en 2023 puis en 2024 et enfin en 2025');
  const { c, a } = await ouvrir(p);
  try {
    const t24 = instantMot(a, '2024');
    const barre = async (t) => { const l = (await traces(c, t)).filter((x) => x.genre === 'graphique' && /\/barre1$/.test(x.cle)); return l.length ? hauteur(l[0].d) : 0; };
    const valeur = (t) => json(c, `M.seek(${t}).then(function () { var e = document.querySelector('.pm-calque-textes [data-texte="graphique:ventes:valeur:1"]'); return { t: e.textContent, op: Number(e.style.opacity) }; })`);
    assert.equal(await barre(t24 - 0.04), 0, 'rien avant le mot');
    const mi = await barre(t24 + 0.3), pleine = await barre(t24 + 0.95);
    assert.ok(mi > 0 && mi < pleine * 0.95, `${mi} / ${pleine}`);
    assert.ok(pleine > 10, `${pleine} cqh`);
    const v = await valeur(t24 + 0.3);
    const n = Number(v.t.replace(/[^\d,]/g, '').replace(',', '.'));
    assert.ok(n > 0 && n < 19 && v.op > 0 && v.op < 1, JSON.stringify(v));
    assert.deepEqual(await valeur(t24 + 0.95), { t: '19 %', op: 1 });
    // La barre de 2023, avant : déjà pleine ; celle de 2025, après : pas encore là.
    const l = (await traces(c, t24 + 0.05)).filter((x) => x.genre === 'graphique');
    assert.ok(l.some((x) => /\/barre0$/.test(x.cle)) && !l.some((x) => /\/barre2$/.test(x.cle)));
  } finally { await c.fermer(); }
});

test('graphique : rendu identique au même t dans les deux voies d\'export (barres, courbe, anneau, main levée)', { ...SANS, timeout: 180000 }, async () => {
  const p = page([
    { id: 's', html: '<figure data-graphique="ventes" data-start="0.2" style="position: absolute; left: 4cqh; top: 6cqh; width: 80cqh; height: 44cqh"></figure><figure data-graphique="mois" data-start="0.4" style="position: absolute; left: 92cqh; top: 6cqh; width: 80cqh; height: 44cqh"></figure><figure data-graphique="parts" data-start="0.3" style="position: absolute; left: 50cqh; top: 54cqh; width: 80cqh; height: 44cqh"></figure>',
      graphiques: { ventes: SANS_MOTS(VENTES), mois: COURBE, parts: ANNEAU } },
    { id: 'm', html: '<style>@scope { :scope { --pm-trait: main; } }</style><figure data-graphique="ventes" data-start="0.2" style="width: 100cqh; height: 56cqh"></figure>', graphiques: { ventes: SANS_MOTS(VENTES) } }]);
  const { c } = await ouvrir(p);
  try {
    await c.evaluer(`${CAPTURE}; true`);
    for (const t of [0.9, 1.4, 3, 6.2]) {
      const f = decoder(await c.capturer(t));
      await c.evaluer(`M.seek(${t})`);
      const e = ecart(f, await rapide(c));
      assert.ok(e <= 0.02, `t = ${t} : ${(100 * e).toFixed(2)} %`);
    }
    // Même image au même t, quel que soit l'ordre des seek.
    const image = async (t) => { await c.evaluer(`M.seek(${t})`); return rapide(c); };
    const a1 = await image(1.4); await image(4); await image(0.5);
    assert.ok(ecart(a1, await image(1.4)) === 0);
    // Anneau : les étiquettes avec leur part, chacune quand sa part est complète.
    const et = await json(c, 'M.seek(4).then(function () { return Array.prototype.map.call(document.querySelectorAll(\'.pm-calque-textes [data-texte^="graphique:parts:etiquette"]\'), function (e) { return [e.textContent, e.style.opacity]; }); })');
    assert.deepEqual(et, [['Images 55 %', '1'], ['Textes 30 %', '1'], ['Sons 15 %', '1']]);
    const tot = await json(c, 'M.seek(0.9).then(function () { return Array.prototype.map.call(document.querySelectorAll(\'.pm-calque-textes [data-texte^="graphique:parts:etiquette"]\'), function (e) { return Number(e.style.opacity); }); })');
    assert.ok(tot[2] === 0, `la dernière part n'est pas encore complète : ${tot}`);
    // Courbe : aire en dégradé, sans mode de fusion.
    assert.ok(await json(c, 'M.seek(3).then(function () { return !!document.querySelector(".pm-calque linearGradient") && !document.querySelector(".pm-calque [style*=blend]"); })'));
  } finally { await c.fermer(); }
});

test('graphique : étiquettes et valeurs sont des textes jugés par le contrôle (contraste réel, relevés)', { ...SANS, timeout: 240000 }, async () => {
  const p = page([{ id: 's', html: '<style>@scope { .pm-graphique-etiquette { color: #eef1f5 !important; } }</style><figure data-graphique="ventes" data-start="0.2" style="width: 100cqh; height: 56cqh"></figure>', graphiques: { ventes: SANS_MOTS(VENTES) } }]);
  const { a } = p.assembler();
  const r = await controlerRendu({ html: a.html, ratio: '16:9', duree: 5, navigateur });
  assert.equal(r.renduVerifie, true, JSON.stringify(r.problemes));
  assert.ok(r.problemes.some((x) => /^contraste/.test(x.regle) && /graphique:ventes:etiquette:/.test(x.element)), JSON.stringify(r.problemes.map((x) => [x.regle, x.element])));
  assert.ok(!r.problemes.some((x) => /graphique:ventes:valeur/.test(x.element) && /^contraste/.test(x.regle)), 'les valeurs restent lisibles');
  assert.ok(!r.problemes.some((x) => ['dessin-erreur', 'erreur-de-scene', 'flash'].includes(x.regle)));
  const el = r.releves.s.elements;
  assert.ok(el.some((e) => e.genre === 'graphique') && el.filter((e) => e.genre === 'etiquette').length >= 7, JSON.stringify(el.map((e) => e.genre)));
});

// --- 5.9 Code ------------------------------------------------------------------------------------------------------------

test('code : passage d\'étape au mot dit, durée divisée par l\'allure ; un jeton commun glisse, un retiré s\'efface, un nouveau apparaît', { ...SANS, timeout: 240000 }, async () => {
  const mesurer = async (allure) => {
    const p = page([{ id: 's', duree: 6, html: '<figure data-code="formule" data-start="0.3"></figure>', code: { formule: FORMULE } }], { deroule: allure ? { allure } : {} });
    await poserVoix(p.dir, 's', wavSinus({ secondes: 4 }), 'on fait la somme puis on prend la moyenne des ventes');
    const { c, a } = await ouvrir(p);
    const tm = instantMot(a, 'moyenne');
    const etat = (t) => json(c, `M.seek(${t}).then(function () {
      var j = {}; document.querySelectorAll('.pm-code-jeton').forEach(function (s) { j[s.textContent] = { op: s.style.opacity === '' ? 1 : Number(s.style.opacity), col: Number(s.style.getPropertyValue('--col')) }; });
      var b = document.querySelector('.pm-code-bande'); return { j: j, bande: Number(b.style.opacity) }; })`);
    try { return { tm, avant: await etat(tm - 0.04), d: [await etat(tm + 0.12), await etat(tm + 0.25), await etat(tm + 0.45), await etat(tm + 0.52), await etat(tm + 0.82)] }; } finally { await c.fermer(); }
  };
  const lent = await mesurer(null);
  // Avant le mot : la première étape.
  assert.deepEqual([lent.avant.j.SOMME.op, lent.avant.j.MOYENNE.op, lent.avant.j['B2:B13'].col], [1, 0, 7]);
  // Le jeton commun glisse ; le retiré s'efface sur la première moitié ; le nouveau apparaît sur la seconde (0,8 s).
  const [a12, a25, a45, , a82] = lent.d;
  assert.ok(a12.j.SOMME.op < 1 && a12.j.SOMME.op > 0 && a12.j.MOYENNE.op === 0, JSON.stringify(a12.j));
  assert.ok(a25.j['B2:B13'].col > 7 && a25.j['B2:B13'].col < 9);
  assert.ok(a45.j.SOMME.op === 0 && a45.j.MOYENNE.op > 0 && a45.j.MOYENNE.op < 1);
  assert.deepEqual([a82.j.MOYENNE.op, a82.j['B2:B13'].col, a82.j.SOMME.op], [1, 9, 0]);
  assert.ok(a82.bande === 1 && lent.avant.bande === 0, 'ligne surlignée avec la seconde étape');
  // Allure 1,6 : le passage dure 0,5 s, toujours à partir du mot.
  const vif = await mesurer(1.6);
  assert.equal(vif.avant.j.MOYENNE.op, 0);
  assert.ok(vif.d[2].j['B2:B13'].col < 9, 'encore en route à 0,45 s');
  assert.deepEqual([vif.d[3].j.MOYENNE.op, vif.d[3].j['B2:B13'].col], [1, 9]);
  assert.ok(lent.d[3].j['B2:B13'].col < 9, 'sans allure, encore en route à 0,52 s');
});

test('code : ligne trop large → code-trop-large ; frappe par paquets ; police à chasse fixe chargée', { ...SANS, timeout: 240000 }, async () => {
  const long = { langage: 'js', etapes: [{ code: 'const total = lignes.reduce((somme, ligne) => somme + ligne.montant, 0);' }] };
  const p = page([{ id: 's', html: '<figure data-code="long" data-start="0.3" style="width: 40cqh"></figure><figure data-code="court" data-code-entree="frappe" data-start="0.3" style="position: absolute; left: 90cqh; top: 60cqh"></figure>',
    code: { long, court: { langage: 'sh', etapes: [{ code: 'npm test' }] } } }]);
  const { a, fichier } = p.assembler();
  const r = await controlerRendu({ html: a.html, ratio: '16:9', duree: 5, navigateur });
  const e = r.problemes.filter((x) => x.regle === 'code-trop-large');
  assert.equal(e.length, 1, JSON.stringify(r.problemes.map((x) => [x.regle, x.message])));
  assert.equal(e[0].gravite, 'erreur');
  assert.match(e[0].message, /une ligne du code « long » fait 72 caractères, plus large que sa fenêtre/);
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur: L, hauteur: H, navigateur, delai: 60000 });
  try {
    const vis = (t) => json(c, `M.seek(${t}).then(function () { return Array.prototype.map.call(document.querySelectorAll('[data-code="court"] .pm-code-jeton'), function (s) { return s.style.getPropertyValue('--vis'); }); })`);
    const debut = await vis(0.5), milieu = await vis(0.9), fin = await vis(3);
    assert.deepEqual(debut.map(Number), [0, 0]);
    assert.ok(milieu.some((v) => Number(v) > 0) && JSON.stringify(milieu) !== JSON.stringify(fin), JSON.stringify(milieu));
    assert.deepEqual(fin.map(Number), [3, 4], 'tout est tapé');
    assert.ok(await json(c, `document.fonts.ready.then(function () { return document.fonts.check('20px "JetBrains Mono"') && getComputedStyle(document.querySelector('.pm-code-corps')).fontFamily.indexOf('JetBrains Mono') === 1; })`));
  } finally { await c.fermer(); }
});

// --- 5.10 Formules ---------------------------------------------------------------------------------------------------------

test('formule : \\pi r^2 s\'affiche avec la police mathématique embarquée ; voie navigateur et voie fidèle donnent la même image à 2 % près', { ...SANS, timeout: 180000 }, async () => {
  const p = page([{ id: 's', html: '<p style="font-size: 12cqh; margin: 20cqh 0 0 30cqh"><span data-formule="aire" class="pm-m-pop" data-start="0.4"></span> <span data-formule="interets" data-start="0.6"></span></p>',
    formules: { aire: '\\pi r^2', interets: 'C_n = C_0 \\times \\left(1 + \\frac{t}{100}\\right)^n' } }]);
  const { c } = await ouvrir(p);
  try {
    const r = await json(c, `M.seek(2).then(function () { return document.fonts.ready; }).then(function () {
      var m = document.querySelector('[data-formule="aire"] math'), b = m.getBoundingClientRect();
      return { police: document.fonts.check('20px "Libertinus Math"'), famille: getComputedStyle(m).fontFamily, l: b.width, h: b.height, frac: !!document.querySelector('[data-formule="interets"] mfrac'), texte: m.textContent }; })`);
    assert.equal(r.police, true, 'police mathématique chargée depuis la page');
    assert.match(r.famille, /^"?Libertinus Math"?/);
    assert.ok(r.l > 20 && r.h > 20 && r.frac, JSON.stringify(r));
    assert.equal(r.texte, 'πr2');
    await c.evaluer(`${CAPTURE}; true`);
    for (const t of [0.5, 2]) {
      const f = decoder(await c.capturer(t));
      await c.evaluer(`M.seek(${t})`);
      const e = ecart(f, await rapide(c));
      assert.ok(e <= 0.02, `t = ${t} : ${(100 * e).toFixed(2)} %`);
    }
  } finally { await c.fermer(); }
});

// --- 5.7 Moyeu et schéma dans les styles livrés ---------------------------------------------------------------------------------

const TEXTES_MOYEU = { titre: 'Le trajet d\'une facture', centre: 'Facture', partie1: 'Devis', partie2: 'Envoi', partie3: 'Relance', partie4: 'Paiement', partie5: 'Archive' };
const dedans = (b, Lg) => b.x - b.l / 2 >= -0.01 && b.x + b.l / 2 <= Lg + 0.01 && b.y - b.h / 2 >= -0.01 && b.y + b.h / 2 <= 100.01;

test('moyeu : en 9:16, les parties sont sous le centre et aucune ne sort de l\'image ; en 16:9, en couronne ; dans les styles livrés', { ...SANS, timeout: 600000 }, async () => {
  for (const style of STYLES) {
    const html = lire('styles', style, 'scenes', 'moyeu.html').replace(/^<!--[\s\S]*?-->\s*/, '').replace('data-scene="moyeu"', 'data-scene="s"');
    for (const [ratio, l, h] of [['9:16', 360, 640], ['16:9', L, H]]) {
      const p = page([{ id: 's', html, duree: 10, textes: TEXTES_MOYEU }], { style, deroule: { format: { ratio, ips: 30 } } });
      const { c } = await ouvrir(p, { largeur: l, hauteur: h });
      try {
        const r = await releve(c);
        const el = (id) => r.elements.find((e) => e.id === id);
        const centre = el('centre').boite;
        const parties = [1, 2, 3, 4, 5].map((k) => el(`partie${k}`).boite);
        for (const b of [centre, ...parties]) assert.ok(dedans(b, r.largeur), `${style} ${ratio} : ${JSON.stringify(b)} hors de ${r.largeur} × 100`);
        if (ratio === '9:16') {
          for (const b of parties) assert.ok(b.y - b.h / 2 > centre.y + centre.h / 2, `${style} 9:16 : partie au-dessus du bas du centre ${JSON.stringify([b, centre])}`);
          const ys = parties.map((b) => b.y);
          assert.ok(Math.max(...ys) - Math.min(...ys) < 1, `${style} 9:16 : en rangée ${ys}`);
        } else {
          assert.ok(parties.some((b) => b.x < centre.x - centre.l / 2) && parties.some((b) => b.x > centre.x + centre.l / 2), `${style} 16:9 : de part et d'autre`);
        }
        // Les parties ne se chevauchent pas, ni le centre.
        const boites = [centre, ...parties];
        for (let i = 0; i < boites.length; i++) for (let j = i + 1; j < boites.length; j++) {
          const a = boites[i], b = boites[j];
          const recouvre = Math.abs(a.x - b.x) < (a.l + b.l) / 2 - 0.2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 0.2;
          assert.ok(!recouvre, `${style} ${ratio} : ${i} et ${j} se chevauchent`);
        }
        // Une flèche vers chaque partie, tracée à la fin.
        const fl = (await traces(c, 9.5)).filter((x) => x.genre === 'fleche' && !/pointe/.test(x.cle));
        assert.equal(fl.length, 5, `${style} ${ratio}`);
        assert.ok(fl.every((x) => x.part === 1));
      } finally { await c.fermer(); }
    }
  }
});

test('schema : les flèches visent les boîtes dans les styles livrés', { ...SANS, timeout: 600000 }, async () => {
  for (const style of STYLES) {
    const html = lire('styles', style, 'scenes', 'schema.html').replace(/^<!--[\s\S]*?-->\s*/, '').replace('data-scene="schema"', 'data-scene="s"');
    const p = page([{ id: 's', html, duree: 8, textes: { titre: 'Le trajet', a: 'Devis', b: 'Facture', c: 'Paiement' } }], { style });
    const { c } = await ouvrir(p);
    try {
      const r = await releve(c);
      const el = (id) => r.elements.find((e) => e.id === id).boite;
      const fl = (await traces(c, 7.5)).filter((x) => x.genre === 'fleche' && !/pointe/.test(x.cle));
      assert.equal(fl.length, 2, style);
      for (const [k, [de, vers]] of [['a', 'b'], ['b', 'c']].entries()) {
        const n = fl[k].d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        const p0 = [n[0], n[1]], p1 = [n[n.length - 2], n[n.length - 1]];
        const A = el(de), B = el(vers);
        // Chaque bout est à l'écart (1,3 cqh) du bord de sa boîte, vers l'autre boîte.
        const bord = (pt, b) => Math.max(Math.abs(pt[0] - b.x) - b.l / 2, Math.abs(pt[1] - b.y) - b.h / 2);
        assert.ok(Math.abs(bord(p0, A) - 1.3) < 0.15, `${style} ${de} : ${bord(p0, A)}`);
        assert.ok(Math.abs(bord(p1, B) - 1.3) < 0.15, `${style} ${vers} : ${bord(p1, B)}`);
        assert.equal(fl[k].part, 1, style);
      }
    } finally { await c.fermer(); }
  }
});

// --- Déterminisme et coût (D8) --------------------------------------------------------------------------------------------

test('donnees : deux rendus identiques et preuve du déterminisme (graphiques, code, formule ; deux pages, deux ordres)', { ...SANS, timeout: 240000 }, async () => {
  const p = page([{ id: 's', duree: 5, html: '<style>@scope { :scope { --pm-trait: main; --pm-ebullition: 6; } }</style><figure data-graphique="ventes" data-start="0.2" style="position: absolute; left: 4cqh; top: 6cqh; width: 80cqh; height: 50cqh"></figure><figure data-graphique="parts" data-start="0.3" style="position: absolute; left: 92cqh; top: 6cqh; width: 80cqh; height: 50cqh"></figure><figure data-code="formule" data-start="0.4" style="position: absolute; left: 20cqh; top: 64cqh"></figure><span data-formule="aire" data-start="0.5" style="position: absolute; left: 120cqh; top: 70cqh; font-size: 8cqh"></span>',
    graphiques: { ventes: SANS_MOTS(VENTES), parts: ANNEAU }, code: { formule: { ...FORMULE, etapes: [FORMULE.etapes[0], { ...FORMULE.etapes[1], debut: 2 }] } }, formules: { aire: '\\pi r^2' } }]);
  const { fichier } = p.assembler();
  const r = await prouver({ fichierHtml: fichier, instants: [{ scene: 's', t: 0.8 }, { scene: 's', t: 1.5 }, { scene: 's', t: 2.4 }, { scene: 's', t: 4.2 }], ouvrir: ouvrirCapture, navigateur, psnrMin: Infinity });
  assert.deepEqual(r.problemes, []);
  assert.deepEqual([...r.nonFaites], []);
});

test('donnees : coût de rendu par image et poids de la page mesurés (D8)', { ...SANS, timeout: 180000 }, async (t) => {
  const avec = page([{ id: 's', html: '<figure data-graphique="ventes" data-start="0.2" style="position: absolute; left: 4cqh; top: 6cqh; width: 80cqh; height: 50cqh"></figure><figure data-graphique="mois" data-start="0.3" style="position: absolute; left: 92cqh; top: 6cqh; width: 80cqh; height: 50cqh"></figure><figure data-code="formule" data-start="0.4" style="position: absolute; left: 20cqh; top: 64cqh"></figure>',
    graphiques: { ventes: SANS_MOTS(VENTES), mois: COURBE }, code: { formule: { ...FORMULE, etapes: [FORMULE.etapes[0], { ...FORMULE.etapes[1], debut: 2 }] } } }]);
  const sans = page([{ id: 's', html: '<h2 data-texte="titre" data-start="0.2"></h2>', textes: { titre: 'Un titre' } }]);
  const formule = page([{ id: 's', html: '<span data-formule="aire" data-start="0.5"></span>', formules: { aire: '\\pi r^2' } }]);
  const A = await ouvrir(avec), B = await ouvrir(sans);
  try {
    const mesure = (c) => json(c, 'M.seek(0).then(function () { var n = 150, h = M.reel.now, t0 = h(); for (var i = 0; i < n; i++) M.rendre(i / 30); return (h() - t0) / n; })');
    await mesure(A.c); await mesure(B.c);
    const ms = await mesure(A.c), base = await mesure(B.c);
    t.diagnostic(`rendu par image : ${ms.toFixed(2)} ms avec 2 graphiques et un code, ${base.toFixed(2)} ms sans (${(ms - base).toFixed(2)} ms de plus)`);
    assert.ok(ms - base < 10, `${(ms - base).toFixed(2)} ms par image`);
    const poids = (f) => Math.round(fs.statSync(f).size / 1024);
    t.diagnostic(`poids de la page : ${poids(A.fichier)} Ko avec graphiques et code, ${poids(B.fichier)} Ko sans, ${poids(formule.assembler().fichier)} Ko avec une formule`);
  } finally { await A.c.fermer(); await B.c.fermer(); }
});
