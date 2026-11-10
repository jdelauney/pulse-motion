'use strict';
/* Spec « Explication narrée » (S7), plan J1 « Diagrammes » : critères rendus dans Chrome ou Edge sans fenêtre. Relevé de mise
 * en page (5.1), calque de dessin (5.2), main levée (5.3), flèches (5.4), annotations (5.5), deux voies d'export, preuve du
 * déterminisme, contrôle de la vidéo rendue, coût par image (D8). */
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

const BOITES = `<style>@scope { .b { position: absolute; width: 30cqh; height: 12cqh; display: flex; align-items: center; justify-content: center;
  background: var(--c-primaire); color: var(--c-sur-primaire); font-size: 4cqh; } }</style>
<div id="client" class="b" style="left: 20cqh; top: 40cqh" data-texte="client" data-start="0.2"></div>
<div id="serveur" class="b" style="left: 120cqh; top: 40cqh" data-texte="serveur" data-start="0.4"></div>
<div id="rond" style="position: absolute; left: 80cqh; top: 72cqh; width: 14cqh; height: 14cqh; border-radius: 50%; background: var(--c-accent)" data-start="0.2"></div>`;
const TEXTES = { client: 'Client', serveur: 'Serveur', requete: 'requête', titre: 'Un titre', prix: '12 €' };

/** Projet d'une scène (ou plusieurs : [{ id, html, duree }]), assemblé, page écrite. -> { dir, a, fichier } */
function page(scenes, { groupes = null, voix = null } = {}) {
  const liste = (Array.isArray(scenes) ? scenes : [{ id: 's', html: scenes }]).map((s) => ({ duree: 5, textes: TEXTES, transition: 'coupe', ...s }));
  const dir = miniProjet({ scenes: liste });
  return { dir, assembler: () => {
    const a = assembler({ dossier: dir, ecrire: false, ...(groupes ? { groupes } : {}) });
    assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
    const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(fichier, a.html);
    return { a, fichier };
  }, voix };
}
async function ouvrir(p, { largeur = L, hauteur = H } = {}) {
  const { a, fichier } = p.assembler();
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur, hauteur, navigateur, delai: 60000 });
  return { c, a, fichier };
}
const evaluer = (c, code) => c.evaluer(code);
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));
const releve = (c, t = 0, id = 's') => json(c, `M.seek(${t}).then(function () { return M.relever(${JSON.stringify(id)}); })`);
const traces = (c, t, id = 's') => json(c, `M.seek(${t}).then(function () { return M.dessin.traces(${JSON.stringify(id)}); })`);
const element = (r, id) => r.elements.find((e) => e.id === id);
const pixel = (p, x, y) => { const i = (Math.round(y) * p.largeur + Math.round(x)) * p.canaux; return [p.donnees[i], p.donnees[i + 1], p.donnees[i + 2]]; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function ecart(a, b) {
  let s = 0;
  const n = a.largeur * a.hauteur;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) s += Math.abs(a.donnees[i * a.canaux + k] - b.donnees[i * b.canaux + k]);
  return s / (n * 3 * 255);
}
const rapide = async (c) => decoder(Buffer.from(await c.evaluer(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${L}; canvas.height = ${H};
  await M.capturer(canvas.getContext('2d'), ${L}, ${H});
  return canvas.toDataURL('image/png').split(',')[1];
})()`), 'base64'));
/** Extrémités [x, y] d'un tracé net « M x y L x y ». */
const bouts = (d) => { const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number); return [[n[0], n[1]], [n[n.length - 2], n[n.length - 1]]]; };

// --- 5.1 Relevé ----------------------------------------------------------------------------------------------------------

test('releve : boîtes en cqh, identiques à 640 et à 1080 px de haut à 0,2 cqh près', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`${BOITES}<p id="phrase" style="position: absolute; left: 20cqh; top: 10cqh; font-size: 5cqh" data-texte="titre" data-start="0.3"></p><i data-fleche="#client → #serveur" data-start="1"><span data-texte="requete"></span></i>`);
  const petit = await ouvrir(p);
  const grand = await ouvrir(p, { largeur: 1920, hauteur: 1080 });
  try {
    const a = await releve(petit.c), b = await releve(grand.c);
    assert.equal(a.largeur, 177.78);
    assert.equal(a.hauteur, 100);
    const client = element(a, 'client');
    assert.deepEqual([client.genre, client.forme], ['carte', 'rect']);
    for (const [k, v] of Object.entries({ x: 35, y: 46, l: 30, h: 12 })) assert.ok(Math.abs(client.boite[k] - v) < 0.05, `${k} ${client.boite[k]}`);
    assert.equal(element(a, 'rond').forme, 'ellipse');
    assert.equal(element(a, 'phrase').genre, 'texte');
    // Genres du calque : la flèche (coupable par la caméra) et son étiquette (jamais coupée).
    assert.ok(a.elements.some((e) => e.genre === 'fleche') && a.elements.some((e) => e.genre === 'etiquette'));
    assert.equal(a.elements.length, b.elements.length);
    for (const e of a.elements) {
      const f = b.elements.find((x) => x.cle === e.cle);
      assert.ok(f, e.cle);
      for (const k of ['x', 'y', 'l', 'h']) assert.ok(Math.abs(e.boite[k] - f.boite[k]) <= 0.2, `${e.cle} ${k} : ${e.boite[k]} / ${f.boite[k]}`);
    }
  } finally { await petit.c.fermer(); await grand.c.fermer(); }
});

test('releve : une caméra zoomée ne change pas les boîtes relevées ; un élément qui entre en glissant est mesuré à sa place d\'arrivée', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`<div data-camera="zoom 1→2.2 0+0.5; x 50→30 0+0.5" style="position: absolute; inset: 0">${BOITES}
<p id="glisse" class="pm-m-glisse-gauche" style="position: absolute; left: 60cqh; top: 15cqh; width: 30cqh; height: 8cqh; margin: 0; --pm-ampleur: 40; --pm-dur: 1.5s" data-start="0.5" data-dur="1.5" data-texte="titre"></p>
<i data-fleche="#client → #serveur" data-start="1"></i></div>`);
  const { c } = await ouvrir(p);
  try {
    // Pendant le glissement et sous la caméra zoomée : les boîtes restent celles de la mise en page.
    const r = await releve(c, 0.8);
    for (const [k, v] of Object.entries({ x: 35, y: 46, l: 30, h: 12 })) assert.ok(Math.abs(element(r, 'client').boite[k] - v) < 0.05, `${k} ${element(r, 'client').boite[k]}`);
    const g = element(r, 'glisse');
    // Texte : l'étendue de ses lettres, calée à gauche à 60 cqh (sa place d'arrivée, pas celle du départ, 40 cqh plus à gauche).
    assert.ok(Math.abs(g.boite.x - g.boite.l / 2 - 60) < 0.6 && g.boite.y > 15 && g.boite.y < 23, JSON.stringify(g.boite));
    assert.ok(Math.abs(g.fin - 2) < 0.01, `mesuré à la fin de son entrée (${g.fin} s)`);
    // La caméra est bien zoomée dans l'image, et rétablie après le relevé.
    assert.match(await evaluer(c, 'M.seek(1).then(function () { return document.querySelector("[data-camera]").style.transform; })'), /scale\(2\.2\)/);
    // Le calque suit la caméra : il est dans son conteneur.
    assert.equal(await evaluer(c, 'document.querySelector("[data-camera] > .pm-calque[data-calque=dessus]") !== null'), true);
  } finally { await c.fermer(); }
});

test('releve : le décor et un fond plein cadre sont exclus ; deux chargements de la même page donnent le même relevé', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`<div id="fond" style="position: absolute; inset: 0; background: #eef2f7"></div><div class="decor"><span id="deco" style="position: absolute; left: 5cqh; top: 5cqh; width: 10cqh; height: 10cqh; background: red"></span></div>
<div id="ornement" data-decor style="position: absolute; right: 5cqh; top: 5cqh; width: 10cqh; height: 10cqh; background: blue"></div>${BOITES}<i data-fleche="#client → #serveur" data-start="1"></i>`);
  const un = await ouvrir(p), deux = await ouvrir(p);
  try {
    const a = await releve(un.c), b = await releve(deux.c);
    for (const id of ['fond', 'deco', 'ornement']) assert.equal(element(a, id), undefined, id);
    assert.ok(element(a, 'client'));
    assert.deepEqual(a, b);
  } finally { await un.c.fermer(); await deux.c.fermer(); }
});

test('releve : M.seek attend le relevé, le premier rendu exporté a déjà ses flèches', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`${BOITES}<i data-fleche="#client → #serveur" data-start="1" data-epaisseur="1"></i>`);
  const { c } = await ouvrir(p);
  try {
    // Toute première image capturée : la flèche est là.
    const img = decoder(await c.capturer(2));
    const y = 46 * H / 100, x = 85 * H / 100;
    const fond = pixel(img, 85 * H / 100, 20 * H / 100);
    assert.ok(Math.abs(lum(pixel(img, x, y)) - lum(fond)) > 60, `trait ${pixel(img, x, y)} / fond ${fond}`);
    assert.ok((await traces(c, 2)).length >= 2);
  } finally { await c.fermer(); }
});

// --- 5.2 Calque ----------------------------------------------------------------------------------------------------------

test('calque : une flèche reste nette sous une caméra à zoom 2,2 (bords mesurés sur la capture)', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`<div data-camera="zoom 2.2→2.2 0+0.1; x 50→50 0+0.1; y 46→46 0+0.1" style="position: absolute; inset: 0">${BOITES}
<i data-fleche="#client → #serveur" data-start="0.5" data-epaisseur="0.5"></i></div>`);
  const { c } = await ouvrir(p);
  try {
    const img = decoder(await c.capturer(2));
    // Colonne au centre de l'image : le trait horizontal (0,5 cqh × 2,2 ≈ 4 px) ; bords francs, comme un tracé vectoriel.
    const x = L / 2;
    const col = Array.from({ length: H }, (_, y) => lum(pixel(img, x, y)));
    const fond = col[Math.round(H * 0.15)];
    const trait = Math.min(...col.slice(Math.round(H * 0.3), Math.round(H * 0.7)));
    const milieu = (fond + trait) / 2;
    const entre = col.filter((v) => Math.abs(v - fond) > 0.15 * (fond - trait) && Math.abs(v - trait) > 0.15 * (fond - trait)).length;
    const pleins = col.filter((v) => v < milieu).length;
    assert.ok(pleins >= 3, `épaisseur ${pleins} px`);
    assert.ok(entre <= 4, `${entre} px de transition (net : 2 au plus par bord)`);
  } finally { await c.fermer(); }
});

test('calque : le rendu au même t est identique, quel que soit l\'ordre des seek ; les nœuds sont réutilisés (aucune création après la première image d\'un tracé immobile)', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`${BOITES}<i data-fleche="#client → #serveur" data-start="1"><span data-texte="requete"></span></i><i data-fleche="#client → #rond" data-start="0.5" data-fleche-courbe="0.4"></i>
<i data-annoter="entoure" data-cible="#serveur" data-start="1.8"></i><i data-annoter="surligne" data-cible="#client" data-start="2.2"></i>
<script>M.dessin('s', function (d) { d.trait([[10, 90], [60, 90]], { debut: 1.2, couleur: 'accent' }); d.ellipse({ x: 150, y: 85, rx: 8, ry: 5, debut: 0.3, entree: 'pop' }); });</script>`);
  const { c } = await ouvrir(p);
  try {
    const a = await c.capturer(1.35);
    const svgA = await evaluer(c, 'document.querySelector("section").innerHTML');
    for (const t of [4, 0.2, 2.9, 1.1]) await c.capturer(t);
    assert.ok(a.equals(await c.capturer(1.35)), 'mêmes pixels');
    assert.equal(await evaluer(c, 'document.querySelector("section").innerHTML'), svgA, 'même calque');
    // Tracés immobiles (après 3 s) : aucune création ni écriture d'une image à l'autre.
    await c.capturer(3.2);
    await evaluer(c, `(function () { window.__mut = { ajouts: 0, attributs: 0 };
      window.__obs = new MutationObserver(function (l) { l.forEach(function (m) { if (m.type === 'childList') window.__mut.ajouts += m.addedNodes.length; else window.__mut.attributs++; }); });
      document.querySelectorAll('.pm-calque').forEach(function (s) { window.__obs.observe(s, { childList: true, subtree: true, attributes: true }); }); return true; })()`);
    for (const t of [3.3, 3.5, 3.8, 4.2]) await evaluer(c, `M.seek(${t})`);
    const mut = await json(c, 'new Promise(function (r) { setTimeout(function () { r(window.__mut); }, 50); })');
    assert.deepEqual(mut, { ajouts: 0, attributs: 0 });
  } finally { await c.fermer(); }
});

test('calque : un arrêt sur image (data-gel) fige aussi le calque', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`<section data-scene="s" data-gel="1.2+1.5">${BOITES}<i data-fleche="#client → #serveur" data-start="1" data-dur="1"></i></section>`);
  const { c } = await ouvrir(p);
  try {
    const avant = await traces(c, 1.3), pendant = await traces(c, 2.5);
    const part = (l) => l.find((x) => x.genre === 'fleche' && !/pointe/.test(x.cle)).part;
    assert.ok(part(avant) > 0 && part(avant) < 1);
    assert.equal(part(pendant), part(await traces(c, 1.4)), 'figé à 1,2 s');
    assert.ok(part(await traces(c, 3.1)) > part(pendant), 'reprend après le gel');
  } finally { await c.fermer(); }
});

test('calque : une erreur dans M.dessin devient la règle dessin-erreur et la scène reste visible', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`<h2 id="t" data-texte="titre" data-start="0.2"></h2>${BOITES}<i data-fleche="#client → #serveur" data-start="0.5"></i>
<script>M.dessin('s', function (d) { if (d.t > 1) d.boite('#serveru'); });</script>`);
  const { c } = await ouvrir(p);
  try {
    const r = await json(c, 'M.seek(2).then(function () { return { erreurs: M.erreurs.filter(function (e) { return e.regle === "dessin-erreur"; }), constats: M.mesurerDessin().constats, op: getComputedStyle(document.getElementById("t")).opacity, traces: M.dessin.traces("s").length }; })');
    assert.equal(r.erreurs.length, 1);
    assert.match(r.erreurs[0].message, /^Scène « s », à 4,9 s : « #serveru » n'est pas un élément de la scène ; vouliez-vous dire « #serveur » \?$|^Scène « s », à [\d,]+ s : « #serveru » n'est pas un élément de la scène ; vouliez-vous dire « #serveur » \?$/);
    assert.equal(r.constats[0].regle, 'dessin-erreur');
    assert.equal(r.op, '1');
    assert.ok(r.traces >= 1, 'la flèche déclarée reste dessinée');
  } finally { await c.fermer(); }
});

test('calque : une étiquette est un data-texte rempli depuis le déroulé ; voie navigateur et voie fidèle donnent la même image à 2 % près', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`${BOITES}<i data-fleche="#client → #serveur" data-start="0.5"><span data-texte="requete"></span></i><i data-annoter="souligne" data-cible="#rond" data-start="1"></i>
<script>M.dessin('s', function (d) { d.icone('truck', { x: 160, y: 15, taille: 10, debut: 0.5 }); d.rect({ x: 5, y: 75, l: 20, h: 15, remplir: 'accent', debut: 0.8 }); });</script>`);
  const { c } = await ouvrir(p);
  try {
    await evaluer(c, `${CAPTURE}; true`);
    const r = await json(c, 'M.seek(2).then(function () { var e = document.querySelector(".pm-calque-textes [data-texte=requete]"); return { texte: e.textContent, classe: e.className, op: e.style.opacity, text: document.querySelectorAll(".pm-calque text").length }; })');
    assert.deepEqual(r, { texte: 'requête', classe: 'pm-calque-texte', op: '1', text: 0 });
    for (const t of [0.75, 2]) {
      const f = decoder(await c.capturer(t));
      await evaluer(c, `M.seek(${t})`);
      const e = ecart(f, await rapide(c));
      assert.ok(e <= 0.02, `t = ${t} : ${(100 * e).toFixed(2)} %`);
    }
  } finally { await c.fermer(); }
});

test('calque : M.dessin.traces rend au même t les mêmes chemins, parts tracées et couleurs que le SVG dessiné', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`${BOITES}<i data-fleche="#client → #serveur" data-start="1"></i><i data-annoter="entoure" data-cible="#rond" data-start="1"></i>
<script>M.dessin('s', function (d) { d.trait([[10, 90], [60, 92]], { id: 'base', debut: 1, couleur: 'primaire' }); });</script>`);
  const { c } = await ouvrir(p);
  try {
    for (const t of [1.25, 1.5, 3]) {
      const r = await json(c, `M.seek(${t}).then(function () {
        var svg = Array.prototype.map.call(document.querySelectorAll('.pm-calque path[stroke-width]'), function (p) {
          var L = parseFloat(p.getAttribute('pathLength')), da = p.getAttribute('stroke-dasharray');
          return { d: p.getAttribute('d'), couleur: p.getAttribute('stroke'), part: p.getAttribute('fill') !== 'none' ? 1 : da ? parseFloat(da) / L : 1 };
        });
        return { svg: svg, traces: M.dessin.traces('s') };
      })`);
      const traits = r.traces.filter((x) => !x.remplissage && !/pointe/.test(x.cle));
      assert.ok(traits.length >= 3);
      for (const tr of traits) {
        const s = r.svg.find((x) => x.d === tr.d);
        assert.ok(s, `${tr.cle} absent du SVG`);
        assert.equal(s.couleur, tr.couleur, tr.cle);
        assert.ok(Math.abs(s.part - tr.part) < 0.002, `${tr.cle} : ${s.part} / ${tr.part}`);
        assert.match(tr.couleur, /^#|^rgb/);
      }
      assert.equal(r.traces.find((x) => x.cle === 'base').couleur, '#1d4ed8');
    }
  } finally { await c.fermer(); }
});

test('calque : avec data-encre="style", aucun trait n\'est peint dans le SVG ; sans canevas de style, l\'encre est opaque à 0,94, sans fusion', { ...SANS, timeout: 120000 }, async () => {
  const corps = `${BOITES}<i data-fleche="#client → #serveur" data-start="0.5"></i><i data-annoter="surligne" data-cible="#rond" data-start="0.5"></i>`;
  const avec = page(`<section data-scene="s" data-encre="style">${corps}<script>M.dessin.encreStyle(function (id, traces) { window.__peint = (window.__peint || 0) + 1; window.__vu = traces.length; });</script></section>`);
  const sans = page(`<section data-scene="s" data-encre="style">${corps}</section>`);
  const normal = page(`<section data-scene="s">${corps}</section>`);
  const A = await ouvrir(avec), B = await ouvrir(sans), C = await ouvrir(normal);
  try {
    const lireEncre = (c) => json(c, `M.seek(2).then(function () { return Array.prototype.map.call(document.querySelectorAll('.pm-calque path'), function (p) {
      var cs = getComputedStyle(p); return { vis: cs.visibility, op: p.getAttribute('opacity'), fusion: cs.mixBlendMode }; }); })`);
    const a = await lireEncre(A.c);
    assert.ok(a.length >= 3 && a.every((x) => x.vis === 'hidden'), JSON.stringify(a));
    assert.deepEqual(await json(A.c, '({ peint: window.__peint > 0, vu: window.__vu })'), { peint: true, vu: (await traces(A.c, 2)).length });
    const b = await lireEncre(B.c);
    assert.ok(b.length >= 3 && b.every((x) => x.vis === 'visible' && x.op === '0.94' && x.fusion === 'normal'), JSON.stringify(b));
    const n = await lireEncre(C.c);
    assert.ok(n.every((x) => x.vis === 'visible' && x.op === null && x.fusion === 'normal'), JSON.stringify(n));
  } finally { await A.c.fermer(); await B.c.fermer(); await C.c.fermer(); }
});

test('calque : coût de rendu par image mesuré (D8)', { ...SANS, timeout: 120000 }, async (t) => {
  const annotations = ['souligne', 'entoure', 'encadre', 'surligne', 'barre', 'croix', 'accolade'].map((x, i) => `<i data-annoter="${x}" data-cible="${['#client', '#serveur', '#rond'][i % 3]}" data-start="${0.5 + i * 0.3}"></i>`).join('');
  const avec = page(`${BOITES}<i data-fleche="#client → #serveur" data-start="0.5"><span data-texte="requete"></span></i><i data-fleche="#client → #rond" data-start="1" data-fleche-courbe="0.3"></i>${annotations}`);
  const sans = page(BOITES);
  const A = await ouvrir(avec), B = await ouvrir(sans);
  try {
    const mesure = (c) => json(c, `M.seek(0).then(function () { var n = 150, h = M.reel.now, t0 = h(); for (var i = 0; i < n; i++) M.rendre(i / 30); return (h() - t0) / n; })`);
    await mesure(A.c); await mesure(B.c);
    const ms = await mesure(A.c), base = await mesure(B.c);
    t.diagnostic(`rendu par image : ${ms.toFixed(2)} ms avec 2 flèches et 7 annotations, ${base.toFixed(2)} ms sans (${(ms - base).toFixed(2)} ms pour le calque)`);
    assert.ok(ms - base < 8, `${(ms - base).toFixed(2)} ms par image pour le calque`);
    // Poids de la page : le groupe « dessin » n'est embarqué que par la page qui dessine.
    const poids = (f) => fs.statSync(f).size;
    t.diagnostic(`poids de la page : ${Math.round(poids(A.fichier) / 1024)} Ko avec dessin, ${Math.round(poids(B.fichier) / 1024)} Ko sans`);
  } finally { await A.c.fermer(); await B.c.fermer(); }
});

// --- 5.3 Main levée -------------------------------------------------------------------------------------------------------

test('main levée : ébullition à 8 par seconde, le tracé change toutes les 0,125 s et seulement alors ; même graine, même tracé d\'une page à l\'autre', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`<style>@scope { :scope { --pm-trait: main; --pm-ebullition: 8; } }</style>${BOITES}<i data-fleche="#client → #serveur" data-start="0.5"></i>`);
  const { c } = await ouvrir(p);
  const deux = await ouvrir(p);
  try {
    const d = async (cc, t) => (await traces(cc, t)).find((x) => x.genre === 'fleche' && !/pointe/.test(x.cle)).d;
    const a = await d(c, 2.01), b = await d(c, 2.1), e = await d(c, 2.13), f = await d(c, 2.24), g = await d(c, 2.26);
    assert.equal(a, b);
    assert.notEqual(b, e);
    assert.equal(e, f);
    assert.notEqual(f, g);
    assert.ok((a.match(/C/g) || []).length >= 1, 'tracé à main levée (courbes)');
    assert.equal(await d(deux.c, 2.1), b, 'même tracé dans une autre page');
  } finally { await c.fermer(); await deux.c.fermer(); }
});

test('main levée : data-main-levee sur la flèche de la scène schema la redessine sans changer sa boîte', { ...SANS, timeout: 120000 }, async () => {
  const schema = lire('styles', 'clair-pedagogique', 'scenes', 'schema.html').replace(/^<!--[\s\S]*?-->\s*/, '');
  const textes = { titre: 'Le trajet', a: 'Devis', b: 'Facture', c: 'Paiement' };
  const net = page([{ id: 'schema', html: schema, duree: 8, textes }]);
  const main = page([{ id: 'schema', html: schema.replace(/<path pathLength/g, '<path data-main-levee pathLength'), duree: 8, textes }]);
  const A = await ouvrir(net), B = await ouvrir(main);
  try {
    const lireFleche = (c) => json(c, `M.seek(7).then(function () { var s = document.getElementById('fleche1'), r = s.getBoundingClientRect(), p = s.querySelector('path'), b = p.getBBox();
      return { boite: [r.left, r.top, r.width, r.height], bbox: [b.x, b.y, b.width, b.height], d: p.getAttribute('d'), main: p.hasAttribute('data-pm-main-levee'), pl: p.getAttribute('pathLength') }; })`);
    const a = await lireFleche(A.c), b = await lireFleche(B.c);
    assert.deepEqual(b.boite, a.boite, 'même boîte');
    assert.ok(b.main && !a.main);
    assert.notEqual(b.d, a.d);
    assert.equal(b.pl, '100', 'pathLength gardé : le tracé de la scène se révèle comme avant');
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(b.bbox[k] - a.bbox[k]) < 1.5, `bbox ${k} : ${b.bbox[k]} / ${a.bbox[k]}`);
  } finally { await A.c.fermer(); await B.c.fermer(); }
});

// --- 5.4 Flèches ----------------------------------------------------------------------------------------------------------

test('flèche : s\'arrête à 1,3 cqh du bord de chaque boîte ; vers une cible ronde, au bord du cercle ; étiquette du côté extérieur, sans chevaucher la flèche', { ...SANS, timeout: 120000 }, async () => {
  const p = page(`${BOITES}<i data-fleche="#client → #serveur" data-start="0.5"><span data-texte="requete"></span></i><i id="vers-rond" data-fleche="#client → #rond" data-start="0.5"></i>
<i data-fleche="#serveur → #rond" data-start="0.5" data-fleche-courbe="0.6"><span data-texte="titre"></span></i>`);
  const { c } = await ouvrir(p);
  try {
    const liste = await traces(c, 3);
    const r = await releve(c, 3);
    const fl = liste.filter((x) => x.genre === 'fleche' && !/pointe/.test(x.cle));
    const [d0, d1] = bouts(fl[0].d);
    assert.ok(Math.abs(d0[0] - (35 + 15 + 1.3)) < 0.02 && Math.abs(d1[0] - (135 - 15 - 1.3)) < 0.02, JSON.stringify([d0, d1]));
    const rond = element(r, 'rond').boite;
    const [, e1] = bouts(fl[1].d);
    assert.ok(Math.abs(Math.hypot(e1[0] - rond.x, e1[1] - rond.y) - (rond.l / 2 + 1.3)) < 0.05, `${Math.hypot(e1[0] - rond.x, e1[1] - rond.y)}`);
    // Étiquettes : au-dessus de la flèche droite ; du côté extérieur de la courbe ; aucun point du tracé dans leur boîte.
    const geo = await json(c, `M.seek(3).then(function () {
      var sec = document.querySelector('section').getBoundingClientRect(), k = 100 / sec.height;
      var etq = Array.prototype.map.call(document.querySelectorAll('.pm-calque-texte'), function (e) { var b = e.getBoundingClientRect(); return [(b.left - sec.left) * k, (b.top - sec.top) * k, b.width * k, b.height * k]; });
      var chemins = Array.prototype.map.call(document.querySelectorAll('.pm-calque [data-cle] > path:first-child'), function (p) { var L = p.getTotalLength(), pts = []; for (var i = 0; i <= 60; i++) { var q = p.getPointAtLength(L * i / 60); pts.push([q.x, q.y]); } return pts; });
      return { etq: etq, chemins: chemins };
    })`);
    assert.equal(geo.etq.length, 2);
    const [ex, ey, el, eh] = geo.etq[0];
    assert.ok(ey + eh < 46, 'au-dessus de la flèche droite');
    for (const [i, boite] of geo.etq.entries()) {
      for (const ch of [geo.chemins[i === 0 ? 0 : 2]]) for (const [x, y] of ch) assert.ok(!(x > boite[0] && x < boite[0] + boite[2] && y > boite[1] && y < boite[1] + boite[3]), `étiquette ${i} sur une flèche (${x}, ${y})`);
    }
    // Courbe : l'étiquette est du côté du point de contrôle (extérieur).
    const serveur = element(r, 'serveur').boite;
    const milieu = [(serveur.x + rond.x) / 2, (serveur.y + rond.y) / 2];
    const centre = [geo.etq[1][0] + geo.etq[1][2] / 2, geo.etq[1][1] + geo.etq[1][3] / 2];
    const courbe = geo.chemins[2];
    const sommet = courbe[30];
    assert.ok(Math.hypot(centre[0] - milieu[0], centre[1] - milieu[1]) > Math.hypot(sommet[0] - milieu[0], sommet[1] - milieu[1]), 'extérieur de la courbe');
    void ex; void el;
  } finally { await c.fermer(); }
});

test('flèche : se trace en 0,7 s à partir du mot dit ; annotation : commence au mot dit, à l\'image près', { ...SANS, timeout: 180000 }, async () => {
  const p = page(`${BOITES}<i data-fleche="#client → #serveur" data-start="mot:serveur"></i><i data-annoter="souligne" data-cible="#client" data-start="mot:client"></i>`);
  await poserVoix(p.dir, 's', wavSinus({ secondes: 3 }), 'le client envoie sa commande au serveur');
  const { c, a } = await ouvrir(p);
  try {
    const v = a.donnees.scenes[0].voix;
    const instant = (mot) => v.debut + v.mots.find((m) => m.w.toLowerCase().includes(mot)).t0;
    const tS = instant('serveur'), tC = instant('client');
    const part = async (t, genre) => { const l = (await traces(c, t)).filter((x) => x.genre === genre && !/pointe/.test(x.cle)); return l.length ? l[0].part : 0; };
    assert.equal(await part(tS - 0.04, 'fleche'), 0);
    const mi = await part(tS + 0.35, 'fleche');
    assert.ok(mi > 0.2 && mi < 0.8, `à mi-parcours : ${mi}`);
    assert.ok((await part(tS + 0.68, 'fleche')) < 1);
    assert.equal(await part(tS + 0.71, 'fleche'), 1);
    // Annotation : rien une image avant le mot, déjà tracée une image après.
    assert.equal(await part(tC - 1 / 30, 'annotation'), 0);
    assert.ok((await part(tC + 1 / 30, 'annotation')) > 0);
  } finally { await c.fermer(); }
});

test('flèche : data-fleche-suivre suit un élément qui glisse', { ...SANS, timeout: 120000 }, async () => {
  const mobile = '<div id="mobile" style="position: absolute; left: 20cqh; top: 75cqh; width: 16cqh; height: 10cqh; background: var(--c-accent); translate: var(--dx, 0cqh) 0" data-start="0" data-dur="4" data-tween="--dx 0cqh→100cqh linear"></div>';
  const p = page(`${BOITES}${mobile}<i data-fleche="#client → #mobile" data-start="0.2" data-dur="0.3" data-fleche-suivre></i><i data-fleche="#serveur → #mobile" data-start="0.2" data-dur="0.3"></i>`);
  const { c } = await ouvrir(p);
  try {
    const fin = async (t) => (await traces(c, t)).filter((x) => x.genre === 'fleche' && !/pointe/.test(x.cle)).map((x) => bouts(x.d)[1]);
    const [s1, f1] = await fin(1), [s3, f3] = await fin(3);
    assert.ok(s3[0] - s1[0] > 30, `suit : ${s1[0]} → ${s3[0]}`);
    assert.deepEqual(f3, f1, 'sans suivre : place d\'arrivée du relevé');
  } finally { await c.fermer(); }
});

// --- 5.5 Annotations ------------------------------------------------------------------------------------------------------

test('annotation : les sept types se dessinent autour de la boîte de la cible ; surligne passe sous le texte et garde son contraste ; l\'annotation et sa cible ne déclenchent pas chevauchement', { ...SANS, timeout: 180000 }, async () => {
  const types = ['souligne', 'entoure', 'encadre', 'surligne', 'barre', 'croix', 'accolade'];
  const cibles = types.map((t, i) => `<span id="c${i}" style="position: absolute; left: ${15 + (i % 4) * 40}cqh; top: ${20 + Math.floor(i / 4) * 40}cqh; font-size: 5cqh" data-texte="titre" data-start="0.2"></span><i id="a${i}" data-annoter="${t}" data-cible="#c${i}" data-start="0.5"></i>`).join('');
  const p = page(cibles, { groupes: 'tous' });
  const { c } = await ouvrir(p);
  try {
    const r = await json(c, `M.seek(3).then(function () {
      var rel = M.relever('s');
      return { rel: rel, boites: Array.prototype.map.call(document.querySelectorAll('.pm-calque [data-cle^="annoter:"]'), function (g) { var b = g.getBBox(); return { cle: g.getAttribute('data-cle'), calque: g.closest('svg').getAttribute('data-calque'), b: [b.x, b.y, b.width, b.height] }; }) };
    })`);
    assert.equal(r.boites.length, 7);
    types.forEach((t, i) => {
      const cible = element(r.rel, `c${i}`).boite;
      const g = r.boites.find((x) => x.cle === `annoter:a${i}`);
      const [x0, y0, w, h] = g.b;
      const m = 1.3;
      if (['entoure', 'encadre'].includes(t)) assert.ok(x0 <= cible.x - cible.l / 2 - m + 0.3 && x0 + w >= cible.x + cible.l / 2 + m - 0.3 && y0 <= cible.y - cible.h / 2 - m + 0.3 && y0 + h >= cible.y + cible.h / 2 + m - 0.3, `${t} ${g.b}`);
      if (['souligne', 'barre', 'surligne'].includes(t)) assert.ok(Math.abs(x0 - (cible.x - cible.l / 2 - m)) < 0.5 && Math.abs(x0 + w - (cible.x + cible.l / 2 + m)) < 0.5, `${t} ${g.b}`);
      if (t === 'souligne') assert.ok(y0 > cible.y + cible.h / 2 - m, 'souligne sous le texte');
      if (t === 'accolade') assert.ok(x0 + w <= cible.x - cible.l / 2 + 0.6 && x0 < cible.x - cible.l / 2 - 1.3, `accolade à gauche ${g.b}`);
      assert.equal(g.calque, t === 'surligne' ? 'dessous' : 'dessus', t);
    });
    // Surligne : le calque du dessous est peint sous le texte.
    const ordre = await json(c, `(function () { var s = document.getElementById('c3'), b = s.getBoundingClientRect(); var pile = document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      var dessous = document.querySelector('.pm-calque[data-calque=dessous]'); return { texte: pile.indexOf(s), dessous: pile.indexOf(dessous) }; })()`);
    assert.ok(ordre.texte >= 0 && (ordre.dessous < 0 || ordre.texte < ordre.dessous), JSON.stringify(ordre));
    // Contraste : le texte sur l'aplat (accent à 0,38 sur le fond) reste au-dessus de 4,5:1.
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lumi = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [accent, fond, texte] = ['#b45309', '#f8fafc', '#0f172a'].map(hex);
    const melange = fond.map((v, k) => v + 0.38 * (accent[k] - v));
    const contraste = (a, b) => { const [x, y] = [lumi(a), lumi(b)].sort((u, v) => v - u); return (x + 0.05) / (y + 0.05); };
    assert.ok(contraste(texte, melange) >= 4.5, `${contraste(texte, melange)}`);
    const img = decoder(await c.capturer(3));
    const s3 = element(r.rel, 'c3').boite;
    const px = pixel(img, (s3.x - s3.l / 2 - 0.6) * H / 100, s3.y * H / 100);
    assert.ok(px.every((v, k) => Math.abs(v - melange[k]) < 12), `aplat ${px} / attendu ${melange.map(Math.round)}`);
    // Contrôle : aucune annotation ne chevauche sa cible aux yeux du contrôle.
    const constats = await json(c, `M.seek(0).then(function () { return M.mesurer({ ratio: '16:9', seuils: {} }).filter(function (x) { return x.regle === 'chevauchement'; }); })`);
    assert.deepEqual(constats, []);
  } finally { await c.fermer(); }
});

// --- Contrôle de la vidéo rendue, déterminisme ---------------------------------------------------------------------------

test('calque : une étiquette est jugée par le contrôle de contraste ; l\'ébullition ne déclenche pas la règle des flashs ; relevés dans le résultat', { ...SANS, timeout: 240000 }, async () => {
  const p = page(`<style>@scope { :scope { --pm-trait: main; --pm-ebullition: 12; } #lbl#lbl { color: #eef1f5; } }</style>${BOITES}
<i data-fleche="#client → #serveur" data-start="0.5" data-epaisseur="1.2"><span id="lbl" data-texte="requete"></span></i><i data-annoter="entoure" data-cible="#rond" data-start="0.8" data-epaisseur="1.2"></i>`);
  const { a } = p.assembler();
  const r = await controlerRendu({ html: a.html, ratio: '16:9', duree: 5, navigateur });
  assert.equal(r.renduVerifie, true, JSON.stringify(r.problemes));
  assert.ok(r.problemes.some((x) => x.regle === 'contraste-reel' && x.element === 'lbl'), JSON.stringify(r.problemes.map((x) => [x.regle, x.element])));
  assert.ok(!r.problemes.some((x) => x.regle === 'flash'), 'aucun flash');
  assert.ok(!r.problemes.some((x) => x.regle === 'dessin-erreur' || x.regle === 'erreur-de-scene'));
  assert.ok(r.releves && r.releves.s && r.releves.s.elements.some((e) => e.id === 'client'));
});

test('calque : deux rendus identiques et preuve du déterminisme (deux pages, deux ordres)', { ...SANS, timeout: 240000 }, async () => {
  const p = page(`<style>@scope { :scope { --pm-trait: main; --pm-ebullition: 6; } }</style>${BOITES}<i data-fleche="#client → #serveur" data-start="0.5"><span data-texte="requete"></span></i>
<i data-annoter="surligne" data-cible="#rond" data-start="1"></i><script>M.dessin('s', function (d) { d.ellipse({ x: 150 + d.ondule(2, 0.5), y: 20, rx: 6, ry: 4, debut: 0.4, remplir: 'accent' }); d.trait([[10, 90], [10 + 40 * d.hasard(3), 90]], { debut: 0.6 }); });</script>`);
  const { fichier } = p.assembler();
  const r = await prouver({ fichierHtml: fichier, instants: [{ scene: 's', t: 0.9 }, { scene: 's', t: 1.6 }, { scene: 's', t: 2.7 }, { scene: 's', t: 4.1 }], ouvrir: ouvrirCapture, navigateur, psnrMin: Infinity });
  assert.deepEqual(r.problemes, []);
  assert.deepEqual([...r.nonFaites], []);
});
