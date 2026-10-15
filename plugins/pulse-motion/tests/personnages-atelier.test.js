'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const P = require('../scripts/lib/personnages.js');

const navigateur = trouverNavigateur();
const sauter = !navigateur && 'Chrome ou Edge introuvable';

function preparer() {
  const bib = path.join(dossierTemporaire(), 'personnages');
  fs.cpSync(P.BIBLIOTHEQUE, bib, { recursive: true });
  const video = dossierTemporaire();
  fs.writeFileSync(path.join(video, 'deroule.json'), '{}');
  return { bib, video };
}

async function attendrePret(page) {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluer('!!(window.__atelier && window.__atelier.pret)')) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('atelier jamais prêt : ' + await page.evaluer('document.querySelector("#message") && document.querySelector("#message").textContent'));
}

async function glisser(page, de, vers, modificateurs = 0) {
  const souris = (type, p) => page.envoyer('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, modifiers: modificateurs });
  await souris('mousePressed', de);
  for (let k = 1; k <= 5; k++) await souris('mouseMoved', { x: de.x + (vers.x - de.x) * k / 5, y: de.y + (vers.y - de.y) * k / 5 });
  await souris('mouseReleased', vers);
}

test('page : page servie avec les modules du moteur', async () => {
  const { bib, video } = preparer();
  const a = await demarrerApercu({ dossier: video, port: 47611, bibliothequePersonnages: bib });
  try {
    const r = await fetch(`${a.url}_pm/personnages`);
    const html = await r.text();
    assert.equal(r.status, 200);
    for (const m of ['courbes', 'squelette', 'clips', 'habillage-batonnets']) assert.match(html, new RegExp(`<script src="/_pm/personnages/modules/${m}\\.js"></script>`));
    assert.match(html, /<script type="module" src="\/_pm\/personnages\/atelier\.mjs"><\/script>/);
  } finally { await a.fermer(); }
});

test('page : charger la marche, déplacer une clé, enregistrer sous un autre nom ; nom déjà pris', { skip: sauter }, async () => {
  const { bib, video } = preparer();
  const a = await demarrerApercu({ dossier: video, port: 47621, bibliothequePersonnages: bib });
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 900 });
  try {
    await page.aller(`${a.url}_pm/personnages?nom=marche`);
    await attendrePret(page);
    const etat = await page.evaluer(`(() => { const ed = __atelier.ed(); return { type: ed.type, cles: ed.objet.cles.length, marqueurs: document.querySelectorAll('#piste .cle').length, nom: document.querySelector('#nom').value }; })()`);
    assert.deepEqual(etat, { type: 'clip', cles: 8, marqueurs: 8, nom: 'marche' });
    const r = await page.evaluer(`(async () => {
      const ed = __atelier.ed();
      ed.deplacerCle(1, 0.2);
      __atelier.rendre();
      document.querySelector('#nom').value = 'marche-lente';
      return __atelier.enregistrer();
    })()`);
    assert.equal(r.ok, true, JSON.stringify(r));
    const ecrit = JSON.parse(fs.readFileSync(path.join(video, 'personnages', 'clips', 'marche-lente.json'), 'utf8'));
    const origine = JSON.parse(fs.readFileSync(path.join(bib, 'clips', 'marche.json'), 'utf8'));
    assert.equal(ecrit.cles[1].t, 0.2);
    assert.deepEqual(ecrit.cles[1].angles, origine.cles[1].angles);
    assert.deepEqual(ecrit.cles.slice(2), origine.cles.slice(2));
    assert.equal(ecrit.nom, 'marche-lente');
    const refuse = await page.evaluer(`(async () => { window.__atelierConfirmer = () => false; __atelier.ed().regler('torse', 9); return __atelier.enregistrer(); })()`);
    assert.equal(refuse.existe, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(video, 'personnages', 'clips', 'marche-lente.json'), 'utf8')).cles[1].t, 0.2, 'pas écrasé');
    const accepte = await page.evaluer(`(async () => { window.__atelierConfirmer = () => true; return __atelier.enregistrer(); })()`);
    assert.equal(accepte.ok, true);
    assert.match(await page.evaluer('document.querySelector("#message").textContent'), /Enregistré/);
  } finally { await page.fermer(); await a.fermer(); }
});

test('page : glisser le genou fait tourner la cuisse ; Maj + glisser la main l\'amène vers la souris', { skip: sauter }, async () => {
  const { bib, video } = preparer();
  const a = await demarrerApercu({ dossier: video, port: 47631, bibliothequePersonnages: bib });
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 900 });
  try {
    await page.aller(`${a.url}_pm/personnages?nom=montrer`);
    await attendrePret(page);
    assert.equal(await page.evaluer('__atelier.ed().type'), 'pose');
    const avant = await page.evaluer('__atelier.ed().valeurs().cuisseAvant');
    const genou = await page.evaluer('__atelier.poignee("genouAvant")');
    await glisser(page, genou, { x: genou.x + 40, y: genou.y - 30 });
    const apres = await page.evaluer('__atelier.ed().valeurs().cuisseAvant');
    assert.ok(apres < avant - 5, `cuisse ${avant} → ${apres} (portée vers l'avant)`);
    assert.equal(await page.evaluer('__atelier.ed().annuler() && __atelier.ed().valeurs().cuisseAvant'), avant, 'un glissement = un pas d\'annulation');
    const main = await page.evaluer('__atelier.poignee("mainAvant")');
    const cible = { x: main.x - 30, y: main.y + 60 };
    await glisser(page, main, cible, 8);
    await page.evaluer('__atelier.rendre()');
    const nouvelle = await page.evaluer('__atelier.poignee("mainAvant")');
    assert.ok(Math.hypot(nouvelle.x - cible.x, nouvelle.y - cible.y) < Math.hypot(main.x - cible.x, main.y - cible.y) / 3, JSON.stringify({ main, cible, nouvelle }));
  } finally { await page.fermer(); await a.fermer(); }
});

test('page : curseur, vues, butée en orange', { skip: sauter }, async () => {
  const { bib, video } = preparer();
  const a = await demarrerApercu({ dossier: video, port: 47641, bibliothequePersonnages: bib });
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 900 });
  try {
    await page.aller(`${a.url}_pm/personnages?nom=debout`);
    await attendrePret(page);
    const r = await page.evaluer(`(() => {
      const c = document.querySelector('#curseurs input[type=range][data-curseur="tibiaAvant"]');
      c.value = c.min; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true }));
      const bute = document.querySelector('[data-poignee="chevilleAvant"]').classList.contains('bute');
      document.querySelector('[data-vue="90"]').click();
      return { tibia: __atelier.ed().valeurs().tibiaAvant, min: +c.min, bute, vueActive: document.querySelector('[data-vue="90"]').getAttribute('aria-pressed') };
    })()`);
    assert.equal(r.tibia, r.min);
    assert.equal(r.bute, true);
    assert.equal(r.vueActive, 'true');
  } finally { await page.fermer(); await a.fermer(); }
});

test('page : hors d\'une vidéo, bouton Enregistrer désactivé et message', { skip: sauter }, async () => {
  const bib = path.join(dossierTemporaire(), 'personnages');
  fs.cpSync(P.BIBLIOTHEQUE, bib, { recursive: true });
  const a = await demarrerApercu({ dossier: dossierTemporaire(), port: 47651, bibliothequePersonnages: bib });
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 900 });
  try {
    await page.aller(`${a.url}_pm/personnages`);
    await attendrePret(page);
    const r = await page.evaluer(`({ desactive: document.querySelector('#enregistrer').disabled, message: document.querySelector('#cible').textContent, type: __atelier.ed().type })`);
    assert.equal(r.desactive, true);
    assert.match(r.message, /Aucune vidéo ouverte/);
    assert.equal(r.type, 'clip', 'sans nom : nouveau clip');
  } finally { await page.fermer(); await a.fermer(); }
});

test('page : habillage dessiné, expression d\'une clé enregistrée ; changer d\'habillage garde le travail', { skip: sauter }, async () => {
  const { bib, video } = preparer();
  const a = await demarrerApercu({ dossier: video, port: 47661, bibliothequePersonnages: bib });
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 900 });
  try {
    await page.aller(`${a.url}_pm/personnages?nom=coucou&dessin=touffu`);
    await attendrePret(page);
    const r = await page.evaluer(`(async () => {
      const ed = __atelier.ed();
      const avant = { habillage: __atelier.habillage(), pieces: !!document.querySelector('#perso [data-piece="cuisseAvant"]'), sourcils: !!document.querySelector('#curseurs [data-curseur="sourcilsAngle"]'), gabaritBloque: document.querySelector('#gabarit').disabled };
      ed.allerA(0.5); __atelier.rendre();
      const s = document.querySelector('#expression'); s.value = 'joie'; s.dispatchEvent(new Event('change', { bubbles: true }));
      const cles = ed.objet.cles.length;
      const h = document.querySelector('#habillage'); h.value = 'batonnets'; h.dispatchEvent(new Event('change', { bubbles: true }));
      const apres = { habillage: __atelier.habillage(), batonnets: !!document.querySelector('#perso [data-os="cuisseAvant"]'), cles: ed.objet.cles.length, peutAnnuler: ed.annuler() && ed.retablir() };
      document.querySelector('#nom').value = 'coucou-joyeux';
      const enr = await __atelier.enregistrer();
      return { avant, cles, apres, enr, visage: !!document.querySelector('#bouche') };
    })()`);
    assert.deepEqual(r.avant, { habillage: 'touffu', pieces: true, sourcils: true, gabaritBloque: true });
    assert.equal(r.apres.habillage, 'batonnets');
    assert.equal(r.apres.batonnets, true);
    assert.equal(r.apres.cles, r.cles, 'les clés sont gardées');
    assert.equal(r.apres.peutAnnuler, true);
    assert.equal(r.enr.ok, true, JSON.stringify(r.enr));
    const ecrit = JSON.parse(fs.readFileSync(path.join(video, 'personnages', 'clips', 'coucou-joyeux.json'), 'utf8'));
    assert.ok(ecrit.cles.some((k) => k.expression === 'joie'));
  } finally { await page.fermer(); await a.fermer(); }
});

test('page : dessin inconnu, bâtonnets et message ; dessin avec queue, curseurs des os en plus', { skip: sauter }, async () => {
  const { bib, video } = preparer();
  const touffu = JSON.parse(fs.readFileSync(path.join(bib, 'dessins', 'touffu.json'), 'utf8'));
  touffu.nom = 'touffu-queue'; touffu.gabarit = 'avec-queue';
  touffu.pieces.queue = { profil: "<rect x='-4' y='-4' width='8' height='48' rx='4' fill='var(--corps)'/>" };
  fs.writeFileSync(path.join(bib, 'dessins', 'touffu-queue.json'), JSON.stringify(touffu));
  const a = await demarrerApercu({ dossier: video, port: 47671, bibliothequePersonnages: bib });
  const page = await ouvrirPage({ navigateur, largeur: 1400, hauteur: 900 });
  try {
    await page.aller(`${a.url}_pm/personnages?nom=marche&dessin=geant`);
    await attendrePret(page);
    assert.equal(await page.evaluer('__atelier.habillage()'), 'batonnets');
    assert.match(await page.evaluer('document.querySelector("#message").textContent'), /dessin « geant » introuvable/i);
    const r = await page.evaluer(`(() => {
      const h = document.querySelector('#habillage'); h.value = 'touffu-queue'; h.dispatchEvent(new Event('change', { bubbles: true }));
      return { queue: !!document.querySelector('#curseurs [data-curseur="queue"]'), piece: !!document.querySelector('#perso [data-piece="queue"]') };
    })()`);
    assert.deepEqual(r, { queue: true, piece: true });
  } finally { await page.fermer(); await a.fermer(); }
});
