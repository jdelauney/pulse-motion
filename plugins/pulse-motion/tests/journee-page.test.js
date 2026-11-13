'use strict';
/* Spec S11, jalon J6 (5.9) dans Chrome ou Edge sans fenêtre : une rue au crépuscule (data-journee="0.72-0.8"), un ciel en
 * dégradé, des façades à l'encre et au papier, des fenêtres data-lampe (SVG et HTML) et un passant au trait de plume. Les six
 * variables de l'heure, la même image au même instant, l'encre de la plume pâle la nuit, les lampes dans l'ordre de leur seuil ;
 * l'encre des styles dessinés (crayon) garde son mode dans une scène à journée. Sans navigateur : journee.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../moteur/journee.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const FENETRES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];

const SCENE = `<section data-scene="chiffre" data-journee="0.72-0.8" style="background: linear-gradient(var(--pm-ciel-haut), var(--pm-ciel-bas))">
  <svg viewBox="0 0 160 90" style="position: absolute; inset: 0; width: 100%; height: 100%">
    <g style="fill: var(--pm-papier); stroke: var(--pm-encre); stroke-width: 0.6">
      <path d="M8 82 V44 L30 30 L52 44 V82 Z" /><path d="M60 82 V36 H96 V82 Z" />
      ${FENETRES.map((id, i) => `<rect id="${id}" data-lampe x="${i < 3 ? 14 + i * 11 : 64 + (i - 3) * 11}" y="${i < 3 ? 52 : 46}" width="7" height="9" />`).join('\n      ')}
    </g>
    <path d="M0 82 H160" style="fill: none; stroke: var(--pm-encre); stroke-width: 0.6" />
  </svg>
  <div id="vitrine" data-lampe style="position: absolute; left: 112cqh; top: 52cqh; width: 14cqh; height: 12cqh; border: 0.4cqh solid var(--pm-encre)"></div>
  <div id="a" data-personnage="passant" data-x="10" data-taille="45"><i data-action="marcher" data-vers="55" data-start="0.3" data-dur="6"></i></div>
</section>`;

function preparer(dir, scene, style = 'carnet') {
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), scene);
  modifierDeroule(dir, (d) => { d.style = style; d.scenes[1].duree = 8; delete d.scenes[1].rythme; });
  const r = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const fichier = path.join(dir, `page-${style}.html`);
  fs.writeFileSync(fichier, r.html);
  const s = r.minutage.scenes.find((x) => x.id === 'chiffre');
  return { fichier, debut: s.debut, fin: s.fin, groupes: r.groupes, html: r.html };
}

let page = null;
let contexte = null;
test.before(async () => {
  if (!navigateur) return;
  contexte = preparer(copierProjet('projet-simple'), SCENE);
  page = await ouvrirCapture({ fichierHtml: contexte.fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 });
});
test.after(async () => { if (page) await page.fermer(); });

const VARIABLES = `(function () {
  var s = document.querySelector('[data-scene="chiffre"]'), out = {}, charte = [];
  ${JSON.stringify(J.NOMS)}.forEach(function (n) { out[n] = s.style.getPropertyValue(n); });
  for (var i = 0; i < s.style.length; i++) if (s.style[i].indexOf('--c-') === 0) charte.push(s.style[i]);
  out.charte = charte;
  return out;
})()`;
const seek = (t) => page.evaluer(`M.seek(${t}).then(function () { return true; })`);

test('journee : même τ, mêmes variables', { ...SANS, timeout: 180000 }, async () => {
  assert.ok(contexte.groupes.includes('journee'));
  const instants = [0.4, 2.1, 3.9, 4.5, 7.6].map((x) => contexte.debut + x);
  const releve = async (liste) => { const out = {}; for (const t of liste) { await seek(t); out[t] = await page.evaluer(VARIABLES); } return out; };
  const aller = await releve(instants);
  const retour = await releve(instants.slice().reverse());
  const d = J.lire('0.72-0.8');
  for (const t of instants) {
    assert.deepEqual(retour[t], aller[t], `à ${t} s`);
    // Celles que Node calcule à la même heure ; aucune couleur de la charte écrite.
    const attendu = J.variables(J.tau(d, (t - contexte.debut) / (contexte.fin - contexte.debut)));
    for (const n of J.NOMS) assert.equal(aller[t][n], attendu[n], `${n} à ${t} s`);
    assert.deepEqual(aller[t].charte, []);
  }
  assert.notEqual(aller[instants[0]]['--pm-papier'], aller[instants[4]]['--pm-papier'], 'le soir tombe');
  // Deux captures du même instant, à l'aller et au retour : la même image.
  const a = Buffer.from(await page.capturer(instants[2])).toString('base64');
  await page.capturer(instants[4]);
  assert.ok(Buffer.from(await page.capturer(instants[2])).toString('base64') === a, 'même t, même image');
});

test('journee : encre pâle sur papier sombre à τ = 0,9, encre sombre à τ = 0,5', { ...SANS, timeout: 120000 }, async () => {
  const PLUME = `(function () {
    var g = document.querySelector('#a .pm-plume'), papier = g && g.querySelector('[data-r="papier"]'), sec = document.querySelector('[data-scene="chiffre"]');
    return { encre: g && getComputedStyle(g).color, papier: papier && getComputedStyle(papier).fill, fond: sec.style.getPropertyValue('--pm-papier') };
  })()`;
  const t = contexte.debut + 3;
  await page.evaluer('M.journee.forcer(0.9), true');
  await seek(t);
  const nuit = await page.evaluer(PLUME);
  await page.evaluer('M.journee.forcer(0.5), true');
  await seek(t);
  const jour = await page.evaluer(PLUME);
  await page.evaluer('M.journee.forcer(null), true');
  // Le passant au trait de plume prend l'encre et le papier de l'heure (habillage-plume.js lit --pm-encre et --pm-papier).
  assert.equal(nuit.encre, 'rgb(239, 230, 207)', 'encre pâle la nuit');
  assert.equal(nuit.papier, 'rgb(26, 32, 54)', 'papier indigo la nuit');
  assert.equal(nuit.fond, J.variables(0.9)['--pm-papier']);
  assert.equal(jour.encre, 'rgb(28, 28, 28)', 'encre sombre le jour');
  assert.equal(jour.papier, 'rgb(253, 252, 248)');
  assert.equal(await page.evaluer(`M.journee.instant('chiffre', ${t})`), J.tau(J.lire('0.72-0.8'), (t - contexte.debut) / (contexte.fin - contexte.debut)));
});

test('journee : les lampes s\'allument dans l\'ordre de leur seuil', { ...SANS, timeout: 180000 }, async () => {
  const ids = [...FENETRES, 'vitrine'];
  const seuils = Object.fromEntries(ids.map((id) => [id, J.seuilLampe(`chiffre|${id}`)]));
  const LAMPES = `(function () {
    var out = {};
    ${JSON.stringify(ids)}.forEach(function (id) {
      var el = document.getElementById(id), l = el.previousElementSibling;
      out[id] = { allume: Number(el.style.getPropertyValue('--pm-allume')), fenetre: el.style.getPropertyValue('--pm-fenetre'),
        lueur: l && l.classList.contains('pm-lueur') ? Number(l.getAttribute('opacity')) : null,
        apres: getComputedStyle(el, '::after').opacity, fond: getComputedStyle(el).backgroundColor, rempli: getComputedStyle(el).fill };
    });
    return out;
  })()`;
  const premiere = {};
  const ips = 30;
  let nuit = null;
  for (let k = Math.ceil(contexte.debut * ips); k / ips <= contexte.fin - 0.05; k += 2) {
    await seek(k / ips);
    const l = await page.evaluer(LAMPES);
    for (const id of ids) if (premiere[id] === undefined && l[id].allume > 0.5) premiere[id] = k;
    nuit = l;
  }
  assert.deepEqual(Object.keys(premiere).sort(), ids.slice().sort(), 'toutes allumées à la fin de la scène');
  const ordre = ids.slice().sort((a, b) => seuils[a] - seuils[b]);
  for (let i = 1; i < ordre.length; i++) assert.ok(premiere[ordre[i]] >= premiere[ordre[i - 1]], `ordre des seuils ${ordre.join(',')} : ${ordre.map((x) => premiere[x]).join(',')}`);
  assert.ok(new Set(Object.values(premiere)).size >= 3, `une à une : ${JSON.stringify(premiere)}`);
  // Allumée : la fenêtre passe à une lumière chaude ; la lueur (dégradé radial, fusion normale) suit l'allumage.
  for (const id of FENETRES) {
    assert.equal(nuit[id].lueur, Math.round(nuit[id].allume * 0.8 * 1000) / 1000, id);
    assert.equal(nuit[id].rempli, nuit[id].fenetre.replace(/,/g, ', '), `${id} rempli de --pm-fenetre`);
    const [r, , b] = nuit[id].fenetre.match(/\d+/g).map(Number);
    assert.ok(r > 200 && b < 140, `${id} : ${nuit[id].fenetre}`);
  }
  assert.ok(Math.abs(Number(nuit.vitrine.apres) - nuit.vitrine.allume * 0.8) < 0.01, `lueur de la vitrine ${nuit.vitrine.apres}`);
  assert.equal(nuit.vitrine.fond, nuit.vitrine.fenetre.replace(/,/g, ', '));
  // Au début de la scène, en plein jour : éteintes, de la couleur du papier.
  await seek(contexte.debut + 0.1);
  const jour = await page.evaluer(LAMPES);
  for (const id of ids) assert.equal(jour[id].allume, 0, id);
  assert.equal(jour.f1.fenetre, (await page.evaluer(VARIABLES))['--pm-papier']);
  // Aucune fusion de couleurs ni filtre dans la feuille des lampes.
  assert.doesNotMatch(J.FEUILLE, /blend|filter|screen/);
});

test('journee : l\'encre des styles dessinés garde son mode dans une scène à journée (crayon : cire)', { ...SANS, timeout: 240000 }, async () => {
  const corps = `<div id="g" style="position: absolute; left: 20cqh; top: 40cqh; width: 20cqh; height: 10cqh; background: var(--c-primaire)" data-start="0.2"></div>
  <div id="d" style="position: absolute; left: 120cqh; top: 40cqh; width: 20cqh; height: 10cqh; background: var(--c-accent)" data-start="0.2"></div>
  <i data-fleche="#g → #d" data-start="0.5"></i>`;
  const encre = async (attrs) => {
    const c = preparer(copierProjet('projet-simple'), `<section data-scene="chiffre"${attrs}>${corps}</section>`, 'crayon');
    const p = await ouvrirCapture({ fichierHtml: c.fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 });
    try {
      await p.evaluer(`M.seek(${c.debut + 3}).then(function () { return true; })`);
      return await p.evaluer('(function () { var c = document.querySelector(\'[data-scene="chiffre"] canvas.pm-encre\'); return c ? c.toDataURL() : null; })()');
    } finally { await p.fermer(); }
  };
  const sans = await encre('');
  const avec = await encre(' data-journee="0.5"');
  assert.ok(sans && sans.length > 1000, 'la flèche est peinte dans le canevas du style');
  assert.ok(avec === sans, 'même encre (cire) avec et sans la journée');
});
