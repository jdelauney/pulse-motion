'use strict';
/* Spec S6, plan 2 (tournage local) : critères dans Chrome ou Edge sans fenêtre : CDP étendu, recherche des cibles, tournage
 * de l'application de démonstration de bout en bout (avant, survol, réaction, après ; page calme ; même onglet ; liste
 * déroulante ; planche ; échecs), téléphone, prises, lecture du film par l'horloge (images, vitesse, ancre sur un mot,
 * deux exports identiques, aucune requête réseau), mesures. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { optionsTournage } = require('../scripts/lib/navigateur.js');
const { SCRIPT } = require('../scripts/lib/tournage-page.js');
const { servirAppliEssai } = require('../scripts/lib/appli-essai.js');
const { tourner } = require('../scripts/lib/tournage.js');
const F = require('../scripts/lib/film.js');
const Fm = require('../moteur/film.js');
const D = require('../scripts/lib/determinisme.js');
const V = require('../scripts/lib/voix.js');
const W = require('../moteur/wav.js');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { decoder } = require('../scripts/lib/png.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { ecrireFilm, COULEURS } = require('./aide/film.js');

const RACINE = path.join(__dirname, '..');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Largeur et hauteur d'un WebP (VP8, VP8L, VP8X) ou d'un JPEG. */
function taille(b) {
  if (b.toString('ascii', 0, 4) === 'RIFF') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  }
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function ecrireParcours(dir, nom, p) {
  fs.mkdirSync(path.join(dir, 'films', nom), { recursive: true });
  fs.writeFileSync(path.join(dir, 'films', nom, 'parcours.json'), JSON.stringify({ nom, ...p }, null, 2));
}

// --- 5.1 CDP -------------------------------------------------------------------------------------------------------

test('cdp : sur() reçoit Page.screencastFrame et retirer() l\'arrête ; capturer webp, png ; échelle 1,5 : images de 1920 × 1200', { ...SANS, timeout: 90000 }, async () => {
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800, echelle: 1.5, base: optionsTournage({}) });
  try {
    await page.aller(`data:text/html,${encodeURIComponent('<body style="margin:0"><div id="b" style="width:200px;height:200px;background:red"></div><script>let x=0;setInterval(()=>{document.getElementById("b").style.marginLeft=(x++%400)+"px"},16)</script></body>')}`);
    const images = [];
    const retirer = page.sur('Page.screencastFrame', (x) => { images.push(x); page.envoyer('Page.screencastFrameAck', { sessionId: x.sessionId }).catch(() => {}); });
    await page.envoyer('Page.startScreencast', { format: 'jpeg', quality: 80 });
    await pause(1000);
    retirer();
    const n = images.length;
    assert.ok(n >= 5, `${n} images`);
    await pause(500);
    assert.equal(images.length, n, 'plus rien après retirer()');
    await page.envoyer('Page.stopScreencast');
    assert.deepEqual(taille(Buffer.from(images[0].data, 'base64')), [1920, 1200]);
    const webp = await page.capturer({ format: 'webp', qualite: 90 });
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
    assert.deepEqual(taille(webp), [1920, 1200]);
    const png = await page.capturer();
    assert.equal(png.toString('hex', 1, 4), '504e47');
  } finally { await page.fermer(); }
});

test('cdp : ouvrirPage sans option supprime son profil ; un profil donné est gardé', { ...SANS, timeout: 60000 }, async () => {
  const a = await ouvrirPage({ navigateur, largeur: 400, hauteur: 300 });
  const temporaire = a.profil;
  await a.fermer();
  for (let i = 0; i < 30 && fs.existsSync(temporaire); i++) await pause(200);
  assert.ok(!fs.existsSync(temporaire), 'profil temporaire supprimé');
  const garde = path.join(dossierTemporaire('pm-profil-'), 'site');
  const b = await ouvrirPage({ navigateur, largeur: 400, hauteur: 300, profil: garde });
  await b.fermer();
  await pause(500);
  assert.ok(fs.existsSync(garde) && fs.readdirSync(garde).length > 0, 'profil gardé');
});

// --- 5.2 Recherche des cibles (monde isolé, application de démonstration) --------------------------------------------

test('filmer : la cible « nouvelle facture » trouve le bouton « Nouvelle Facture » ; rang 2 et dans « fenêtre » ; deux « Enregistrer » de même rang', { ...SANS, timeout: 90000 }, async () => {
  const essai = await servirAppliEssai();
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800 });
  try {
    await page.envoyer('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT });
    await page.aller(`${essai.url}factures.html`);
    const r = await page.evaluer('__pm.trouver("nouvelle facture")');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.libelle, 'Nouvelle Facture');
    assert.equal(r.sorte, 'a');
    const m1 = await page.evaluer('__pm.trouver({ texte: "Modifier", rang: 1 })');
    const m2 = await page.evaluer('__pm.trouver({ texte: "Modifier", rang: 2 })');
    assert.ok(m1.ok && m2.ok && m2.boite[1] > m1.boite[1] + 10, 'le 2ᵉ Modifier est sous le premier');
    const ambigu = await page.evaluer('__pm.trouver("Modifier")');
    assert.equal(ambigu.raison, 'ambigu');
    const absent = await page.evaluer('__pm.trouver("Nouveau devis")');
    assert.equal(absent.raison, 'introuvable');
    assert.ok(absent.proches.length >= 3, JSON.stringify(absent.proches));
    await page.aller(`${essai.url}nouvelle.html`);
    await page.evaluer('document.getElementById("confirmer").showModal(), true');
    const deux = await page.evaluer('__pm.trouver("Enregistrer")');
    assert.equal(deux.raison, 'ambigu');
    assert.equal(deux.candidats.length, 2);
    assert.ok(deux.candidats.some((c) => /dans la fenêtre/.test(c.position)) && deux.candidats.some((c) => !/dans la fenêtre/.test(c.position)), JSON.stringify(deux.candidats));
    const fenetre = await page.evaluer('__pm.trouver({ texte: "Enregistrer", dans: "fenêtre" })');
    assert.equal(fenetre.ok, true);
    const dialogue = await page.evaluer('(function () { var r = document.getElementById("confirmer").getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()');
    const [x, y] = [fenetre.boite[0] + fenetre.boite[2] / 2, fenetre.boite[1] + fenetre.boite[3] / 2];
    assert.ok(x > dialogue[0] && x < dialogue[2] && y > dialogue[1] && y < dialogue[3], 'l\'Enregistrer de la fenêtre');
    const champ = await page.evaluer('__pm.trouver("Client")');
    assert.equal(champ.ok && champ.sorte, 'input', 'le champ, pas son étiquette');
    const secret = await page.evaluer('(function () { var i = document.createElement("input"); i.type = "password"; i.setAttribute("aria-label", "Code"); document.body.appendChild(i); return __pm.trouver("Code"); })()');
    assert.equal(secret.motDePasse, true);
  } finally { await page.fermer(); await essai.fermer(); }
});

// --- 5.4, 5.7, 5.17 Tournage de l'application de démonstration, de bout en bout --------------------------------------

const PARCOURS = {
  depart: 'appli-essai/factures.html',
  etapes: [
    { faire: 'cliquer', cible: 'Actualiser', dit: 'Actualisez la liste.' },
    { faire: 'defiler', vers: 'Total', dit: 'Descendez jusqu\'au total.' },
    { faire: 'cliquer', cible: { texte: 'Modifier', rang: 2 }, dit: 'Cliquez sur le deuxième Modifier.' },
    { faire: 'cliquer', cible: 'Aide', dit: 'Ouvrez l\'aide.' },
    { faire: 'aller', url: 'appli-essai/nouvelle.html', dit: 'Allez sur une nouvelle facture.' },
    { faire: 'taper', cible: 'Client', texte: 'Dupont SARL', dit: 'Tapez le client.' },
    { faire: 'choisir', cible: 'Mode de paiement', option: 'Virement', dit: 'Choisissez Virement.' },
    { faire: 'cocher', cible: 'J\'accepte les conditions', dit: 'Acceptez les conditions.' },
    { faire: 'cliquer', cible: 'Supprimer le brouillon', dit: 'Supprimez le brouillon.' },
    { faire: 'taper', cible: 'Client', texte: 'Martin et fils', puis: 'Tab', dit: 'Tapez un autre client.' },
    { faire: 'cliquer', cible: 'Enregistrer', dit: 'Enregistrez.' },
    { faire: 'cliquer', cible: { texte: 'Enregistrer', dans: 'fenêtre' }, dit: 'Confirmez.' },
    { faire: 'attendre', texte: 'Facture enregistrée', dit: 'C\'est enregistré.' },
  ],
};
let demo = null;
async function tournageDemo() {
  if (demo) return demo;
  const dir = dossierTemporaire('pm-tournage-');
  ecrireParcours(dir, 'factures', PARCOURS);
  const progression = [];
  const t0 = Date.now();
  const r = await tourner({ projet: dir, nom: 'factures', navigateur, surEtape: (x) => progression.push(x) });
  demo = { dir, r, progression, duree: (Date.now() - t0) / 1000 };
  if (r.ok) demo.film = JSON.parse(fs.readFileSync(path.join(dir, 'films', 'factures', r.prise, 'film.json'), 'utf8'));
  return demo;
}

test('exemple : l\'application de démonstration se filme de bout en bout ; image avant, survol, après et une réaction par étape', { ...SANS, timeout: 240000 }, async (t) => {
  const { r, film, progression, duree, dir } = await tournageDemo();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.prise, 'prise-01');
  assert.equal(film.etapes.length, 13);
  assert.deepEqual(progression.map((x) => x.etape), Array.from({ length: 13 }, (_, k) => k + 1));
  const dossier = path.join(dir, 'films', 'factures', 'prise-01');
  assert.deepEqual(F.validerFilm(film, { dossier }), [], 'film : film.json de l\'application de démonstration est valide selon lib/film.js');
  for (const e of film.etapes) {
    assert.ok(e.avant && e.apres, `étape ${e.n}`);
    if (['cliquer', 'taper', 'choisir', 'cocher'].includes(e.faire)) {
      assert.ok(e.survol, `étape ${e.n} : survol`);
      assert.ok(e.point && e.cible && e.cible.boite, `étape ${e.n} : point et boîte`);
    }
    // « attendre » un texte déjà affiché : rien ne bouge, aucune image de réaction.
    if (e.faire !== 'aller' && e.faire !== 'attendre') assert.ok(e.reaction.length > 0, `étape ${e.n} : réaction`);
    else assert.deepEqual(e.reaction, [], 'aller : fondu, aucune image de chargement');
  }
  // L'état calme qui suit une étape est l'avant de la suivante.
  for (let k = 1; k < film.etapes.length; k++) assert.equal(film.etapes[k].avant, film.etapes[k - 1].apres);
  assert.deepEqual(taille(fs.readFileSync(path.join(dossier, 'images', film.etapes[0].avant))), [1920, 1200]);
  t.diagnostic(`tournage de 13 étapes : ${duree.toFixed(1)} s, ${(r.poids / 1024 / 1024).toFixed(2)} Mo d'images`);
});

test('filmer : l\'image « après » n\'est prise qu\'une fois la page calme (requête lente simulée)', { ...SANS, timeout: 240000 }, async () => {
  const { r, film } = await tournageDemo();
  assert.equal(r.ok, true);
  const e = film.etapes[0];
  // La réponse lente (1,5 s) est attendue : la réaction dure plus de 1,5 s, coupée après ses 0,6 premières secondes.
  assert.ok(e.coupes.length === 1 && e.coupes[0][1] >= 1500, JSON.stringify(e.coupes));
  assert.ok(e.reaction[e.reaction.length - 1][0] <= e.coupes[0][0] + 1000 / 30 + 1, JSON.stringify(e.reaction.slice(-2)));
  assert.deepEqual(e.alertes, []);
  assert.deepEqual(film.alertes, []);
  // Le message lent de la dernière étape (« Facture enregistrée ») est attendu de même.
  assert.ok(film.etapes[11].coupes.length === 0 || film.etapes[11].coupes[0][1] >= 1200);
});

test('filmer : un lien target=_blank s\'ouvre dans le même onglet et la prise continue ; un select natif relève ses options', { ...SANS, timeout: 240000 }, async () => {
  const { r, film } = await tournageDemo();
  assert.equal(r.ok, true);
  assert.equal(film.etapes[3].url, 'appli-essai/aide.html');
  assert.equal(film.etapes[4].url, 'appli-essai/nouvelle.html');
  assert.deepEqual(film.etapes[6].options, { libelles: ['Carte bancaire', 'Virement', 'Chèque', 'Espèces'], choisie: 1, etiquette: 'Mode de paiement' });
  assert.deepEqual(film.etapes[8].dialogue, { type: 'confirm', message: 'Supprimer le brouillon de cette facture ?' });
  // Adresses : origine et chemin seulement.
  for (const e of film.etapes) assert.doesNotMatch(e.url, /[?#]|127\.0\.0\.1/);
  // La cible hors de la vue est amenée au centre avant le trajet du pointeur.
  assert.ok(film.etapes[2].approche && film.etapes[2].approche.length && film.etapes[2].vue, 'approche du 2ᵉ Modifier');
});

test('film : deux images identiques ne sont écrites qu\'une fois', { ...SANS, timeout: 240000 }, async () => {
  const { r, dir } = await tournageDemo();
  assert.equal(r.ok, true);
  const images = path.join(dir, 'films', 'factures', 'prise-01', 'images');
  const vus = new Map();
  for (const f of fs.readdirSync(images)) {
    const h = sha(fs.readFileSync(path.join(images, f)));
    assert.ok(!vus.has(h), `${f} et ${vus.get(h)} sont identiques`);
    vus.set(h, f);
  }
});

test('filmer : la planche montre la cible et le point visé de chaque étape', { ...SANS, timeout: 240000 }, async () => {
  const { r, film, dir } = await tournageDemo();
  assert.equal(r.ok, true);
  const planche = path.join(dir, r.planche);
  assert.deepEqual(fs.readdirSync(planche).sort(), film.etapes.map((e) => `etape-${String(e.n).padStart(2, '0')}.png`));
  const e = film.etapes[0];
  const png = decoder(fs.readFileSync(path.join(planche, 'etape-01.png')));
  assert.equal(png.largeur, 1280);
  const k = 1280 / film.largeur;
  const p = (x, y) => { const i = (Math.round(y) * png.largeur + Math.round(x)) * png.canaux; return [png.donnees[i], png.donnees[i + 1], png.donnees[i + 2]]; };
  const rouge = (c) => c[0] > 200 && c[1] < 90 && c[2] > 50 && c[2] < 130;
  assert.ok(rouge(p(e.point[0] * k, e.point[1] * k)), `point visé : ${p(e.point[0] * k, e.point[1] * k)}`);
  assert.ok(rouge(p(e.cible.boite[0] * k, e.cible.boite[1] * k + e.cible.boite[3] * k / 2)), 'bord de la cible');
});

test('mesures : tournage de démonstration au plus 60 s et au plus 12 Mo par minute', { ...SANS, timeout: 240000 }, async (t) => {
  const { r, duree } = await tournageDemo();
  assert.equal(r.ok, true);
  // 13 étapes montrées en 2 minutes de vidéo : au plus 24 Mo d'images.
  const parMinute = r.poids / 2 / 1024 / 1024;
  t.diagnostic(`mesure : tournage ${duree.toFixed(1)} s (film.json : ${r.duree} s) ; ${parMinute.toFixed(2)} Mo par minute pour 2 min de vidéo`);
  assert.ok(duree <= 60, `${duree} s`);
  assert.ok(parMinute <= 12, `${parMinute} Mo par minute`);
});

test('filmer : une cible introuvable arrête la prise, écrit tournage-echec.webp et liste les textes proches ; deux « Enregistrer » sont listés', { ...SANS, timeout: 120000 }, async () => {
  const dir = dossierTemporaire('pm-echec-');
  ecrireParcours(dir, 'x', { depart: 'appli-essai/factures.html', etapes: [{ faire: 'cliquer', cible: 'Actualiser' }, { faire: 'cliquer', cible: 'Nouveau devis' }] });
  const r = await tourner({ projet: dir, nom: 'x', navigateur, calme: { attente: 300 } });
  assert.equal(r.ok, false);
  assert.equal(r.erreur, 'etape');
  assert.equal(r.etape, 2);
  assert.match(r.message, /^Je ne trouve pas « Nouveau devis » à l'étape 2\. Je vois : « [^»]+ »(, « [^»]+ »)+\.$/);
  assert.match(r.rappel, /ne sont pas annulées/);
  assert.equal(taille(fs.readFileSync(path.join(dir, 'sortie', 'tournage-echec.webp')))[0], 1920);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'films', 'x')), ['parcours.json'], 'aucune prise incomplète');
  ecrireParcours(dir, 'y', { depart: 'appli-essai/nouvelle.html', etapes: [{ faire: 'cliquer', cible: 'Enregistrer' }, { faire: 'cliquer', cible: 'Enregistrer' }] });
  const deux = await tourner({ projet: dir, nom: 'y', navigateur, calme: { attente: 300 } });
  assert.equal(deux.etape, 2);
  assert.match(deux.message, /plusieurs éléments correspondent à « Enregistrer » : « Enregistrer » \([^)]+\), « Enregistrer » \([^)]*dans la fenêtre\)/);
});

test('filmer : appareil telephone filme à 390 × 844 en mode tactile ; refilmer crée prise-02 sans toucher prise-01', { ...SANS, timeout: 120000 }, async () => {
  const dir = dossierTemporaire('pm-telephone-');
  fs.writeFileSync(path.join(dir, 'tactile.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:20px sans-serif">
<p id="t"></p><button id="b" style="padding:20px 40px">Valider</button>
<script>document.getElementById('t').textContent = navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches ? 'Écran tactile' : 'Souris';
document.getElementById('b').addEventListener('touchend', function () { document.getElementById('t').textContent = 'Touché du doigt'; });</script></body>`);
  ecrireParcours(dir, 'tel', { depart: 'tactile.html', appareil: 'telephone', etapes: [{ faire: 'attendre', texte: 'Écran tactile' }, { faire: 'cliquer', cible: 'Valider' }, { faire: 'attendre', texte: 'Touché du doigt' }] });
  const r = await tourner({ projet: dir, nom: 'tel', navigateur, calme: { attente: 300 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const film = JSON.parse(fs.readFileSync(path.join(dir, 'films', 'tel', 'prise-01', 'film.json'), 'utf8'));
  assert.deepEqual([film.appareil, film.largeur, film.hauteur, film.echelle], ['telephone', 390, 844, 2]);
  assert.deepEqual(taille(fs.readFileSync(path.join(dir, 'films', 'tel', 'prise-01', 'images', film.etapes[0].avant))), [780, 1688]);
  assert.equal(film.etapes[1].survol, undefined, 'au doigt : pas d\'état de survol');
  const empreinte = (d) => fs.readdirSync(d, { recursive: true }).filter((f) => fs.statSync(path.join(d, f)).isFile()).sort().map((f) => `${f}:${sha(fs.readFileSync(path.join(d, f)))}`).join('\n');
  const avant = empreinte(path.join(dir, 'films', 'tel', 'prise-01'));
  const r2 = await tourner({ projet: dir, nom: 'tel', navigateur, calme: { attente: 300 } });
  assert.equal(r2.prise, 'prise-02');
  assert.equal(empreinte(path.join(dir, 'films', 'tel', 'prise-01')), avant);
  assert.equal(F.prises(dir, 'tel').length, 2);
});

// --- 5.8 Lecture du film dans une scène ---------------------------------------------------------------------------

const L = 640, H = 360;
function projetFilm({ marques = '<i class="pm-etape" data-etape="1" data-start="2"></i>', attrs = '', duree = 8, voix = null } = {}) {
  const dir = miniProjet({ scenes: [{ id: 's', html: `<div class="pm-ecran" data-film="essai" data-cadre="aucun" data-start="0" style="--pm-ecran-l: 100cqh"${attrs}>${marques}</div>`, duree, textes: {}, transition: 'coupe', ...(voix ? { voix } : {}) }] });
  ecrireFilm(dir);
  return dir;
}
async function ouvrir(dir) {
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, a.html);
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur: L, hauteur: H, navigateur, delai: 60000 });
  return { c, a, fichier };
}
/** Couleur de l'image du film, près du coin haut gauche de l'écran (loin du pointeur). */
async function couleurA(c, t) {
  const png = decoder(await c.capturer(t));
  const b = await c.evaluer('(function () { var r = document.querySelector(".pm-ecran-surface").getBoundingClientRect(); var s = document.getElementById("pm-scene").getBoundingClientRect(); return [r.left - s.left, r.top - s.top, r.width, r.height]; })()');
  const x = Math.round(b[0] + b[2] * 0.06), y = Math.round(b[1] + b[3] * 0.06);
  const i = (y * png.largeur + x) * png.canaux;
  return [png.donnees[i], png.donnees[i + 1], png.donnees[i + 2]];
}
const nomDe = (rgb) => Object.entries(COULEURS).sort((a, b) => a[1].reduce((s, v, k) => s + Math.abs(v - rgb[k]), 0) - b[1].reduce((s, v, k) => s + Math.abs(v - rgb[k]), 0))[0][0];

test('film : dans la page, avant, survol, réaction puis après ; la pointe au point relevé à l\'instant de l\'action ; data-vitesse x2 joue la réaction deux fois plus vite', { ...SANS, timeout: 150000 }, async () => {
  const { c, a } = await ouvrir(projetFilm());
  try {
    const plan = Fm.planifierFilm(JSON.parse(/id="pm-film-essai">([\s\S]*?)<\/script>/.exec(a.html)[1]), { 1: 2 }, { duree: 8 });
    const p = plan.etapes[0];
    assert.equal(nomDe(await couleurA(c, 1)), '0001.png');
    assert.equal(nomDe(await couleurA(c, p.arrivee + 0.15)), '0002.png');
    assert.equal(nomDe(await couleurA(c, 2.2)), 'r01-0001.png');
    assert.equal(nomDe(await couleurA(c, 2.52)), 'r01-0002.png');
    assert.equal(nomDe(await couleurA(c, p.fin + 0.05)), '0003.png');
    // Aller : fondu, puis l'image d'après.
    assert.equal(nomDe(await couleurA(c, plan.etapes[1].fin + 0.1)), '0004.png');
    // Retour en arrière : la même image.
    assert.equal(nomDe(await couleurA(c, 2.2)), 'r01-0001.png');
    // La pointe au point relevé (409,6 ; 289 px de la page de 640 × 400) à l'instant de l'action.
    await c.capturer(2);
    const pointe = await c.evaluer('(function () { var r = document.querySelector(".pm-pointeur").getBoundingClientRect(); var s = document.querySelector(".pm-ecran-surface").getBoundingClientRect(); return [(r.left - s.left) / s.width * 640, (r.top - s.top) / s.height * 400]; })()');
    assert.ok(Math.abs(pointe[0] - 409.6) < 3 && Math.abs(pointe[1] - 289) < 3, JSON.stringify(pointe));
  } finally { await c.fermer(); }
  const { c: c2 } = await ouvrir(projetFilm({ attrs: ' data-vitesse="2+0.6 x2"' }));
  try {
    // Sans accéléré, à 2,26 s : encore la première image de la réaction (260 ms) ; à × 2 : la seconde (520 ms ≥ 500).
    assert.equal(nomDe(await couleurA(c2, 2.26)), 'r01-0002.png');
    assert.equal(nomDe(await couleurA(c2, 2.2)), 'r01-0001.png');
  } finally { await c2.fermer(); }
});

test('film : une étape ancrée sur mot:enregistrez clique quand la voix dit « enregistrez »', { ...SANS, timeout: 120000 }, async () => {
  const dir = projetFilm({ marques: '<i class="pm-etape" data-etape="1" data-start="mot:enregistrez"></i>', voix: { texte: 'Maintenant enregistrez la facture' } });
  const taux = 48000;
  const x = new Float32Array(Math.round(4 * taux));
  for (let i = taux / 2; i < 3.5 * taux; i++) x[i] = 0.3 * Math.sin(i / 5);
  const r = await V.ecrirePrise({ projet: dir, scene: 's', octets: W.ecrire({ taux, canaux: [x] }), texte: 'Maintenant enregistrez la facture' });
  const f = path.join(dir, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.scenes[0].voix.fichier = r.relatif;
  fs.writeFileSync(f, JSON.stringify(d));
  const { c, a } = await ouvrir(dir);
  try {
    const mot = a.donnees.scenes[0].voix.mots.find((m) => /enregistrez/i.test(m.w));
    assert.ok(mot, JSON.stringify(a.donnees.scenes[0].voix.mots));
    // L'instant de la marque, calculé par le minutage de la page, est celui du mot dit.
    const debutMot = await c.evaluer('(function () { var m = document.querySelector(".pm-etape"); return M.minutage.elements.s[m.getAttribute("data-pm-cle")].debut; })()');
    assert.ok(Math.abs(debutMot - ((a.donnees.scenes[0].voix.debut || 0) + mot.t0)) < 0.02, `${debutMot} / ${mot.t0}`);
    const etat = (t) => c.evaluer(`M.seek(${t}).then(function () { return [Array.prototype.filter.call(document.querySelectorAll('.pm-onde'), function (o) { return Number(o.style.opacity) > 0; }).length, document.querySelector('.pm-pointeur').style.getPropertyValue('--pm-k')]; })`);
    assert.deepEqual(await etat(debutMot - 0.05), [0, '1']);
    const pendant = await etat(debutMot + 0.05);
    assert.equal(pendant[0], 1, 'le cercle du clic part avec le mot');
    assert.equal(pendant[1], '0.9');
  } finally { await c.fermer(); }
});

test('film : étapes trop rapprochées : etapes-trop-rapprochees dans la vidéo rendue, avec l\'écart minimal', { ...SANS, timeout: 90000 }, async () => {
  const { c } = await ouvrir(projetFilm({ marques: '<i class="pm-etape" data-etape="1" data-start="2"></i><i class="pm-etape" data-etape="3" data-start="2.6"></i>' }));
  try {
    const constats = JSON.parse(await c.evaluer('JSON.stringify(M.mesurerEcrans({}))'));
    const e = constats.find((x) => x.regle === 'etapes-trop-rapprochees');
    assert.ok(e && e.valeur.film && e.valeur.b === 3 && e.valeur.minimum > 0.6, JSON.stringify(constats));
    const { traduireConstats } = require('../scripts/lib/rendu-controle.js');
    const [t] = traduireConstats([{ ...e, scene: 's3', valeur: { ...e.valeur, a: 3, b: 4, minimum: 1.6 } }]);
    assert.equal(t.gravite, 'erreur');
    assert.match(t.message, /^Scène « s3 » : les étapes 3 et 4 sont trop rapprochées\. Il faut au moins 1,6 s entre elles \(le temps de voir la page réagir puis d'aller cliquer\)\.$/);
  } finally { await c.fermer(); }
});

test('film : deux exports fidèles de la vidéo de démonstration donnent des images identiques (preuve du déterminisme)', { ...SANS, timeout: 180000 }, async () => {
  const dir = projetFilm({ marques: '<i class="pm-etape" data-etape="1" data-start="2"></i><i class="pm-zoom" data-cible="etape:3" data-start="5" data-dur="2"></i>', attrs: ' data-film-camera="suivre"' });
  const { c, a, fichier } = await ouvrir(dir);
  await c.fermer();
  const concernees = D.concernees(a);
  assert.ok(concernees.some((x) => x.raisons.includes('film')), JSON.stringify(concernees));
  const instants = Array.from({ length: 16 }, (_, k) => ({ scene: 's', t: Math.round((0.5 + k * 0.45) * 30) / 30 }));
  const preuve = await D.prouver({ fichierHtml: fichier, instants, largeur: L, hauteur: H, navigateur, ouvrir: ouvrirCapture });
  assert.deepEqual(preuve.problemes, []);
  // Deux pages, mêmes instants dans deux ordres : mêmes octets.
  const capturer = async (ordre) => {
    const p = await ouvrirCapture({ fichierHtml: fichier, largeur: L, hauteur: H, navigateur, delai: 60000 });
    const r = {};
    try { for (const x of ordre) r[x.t] = sha(await p.capturer(x.t)); } finally { await p.fermer(); }
    return r;
  };
  assert.deepEqual(await capturer(instants), await capturer(instants.slice().reverse()));
});

test('film : aucune requête autre que data:, file: ou 127.0.0.1 pendant l\'aperçu, le contrôle et l\'export d\'une vidéo filmée', { ...SANS, timeout: 120000 }, async () => {
  const { c, a, fichier } = await ouvrir(projetFilm());
  await c.fermer();
  assert.doesNotMatch(a.html, /(src|href)\s*=\s*["']https?:/);
  const page = await ouvrirPage({ navigateur, largeur: L, hauteur: H });
  const adresses = [];
  try {
    page.sur('Network.requestWillBeSent', (x) => adresses.push(x.request.url));
    await page.envoyer('Network.enable');
    await page.aller(pathToFileURL(fichier).href);
    await page.evaluer(`${fs.readFileSync(path.join(RACINE, 'moteur', 'capture.js'), 'utf8')}; true`);
    for (const t of [0.5, 1.9, 2.2, 2.6, 4, 6]) {
      await page.evaluer(`(async function () { await M.seek(${t}); var c = document.createElement('canvas'); c.width = ${L}; c.height = ${H}; await M.capturer(c.getContext('2d'), ${L}, ${H}); return true; })()`);
    }
    await page.evaluer('new Promise(function (ok) { M.lire && M.lire(); setTimeout(ok, 1500); })');
  } finally { await page.fermer(); }
  const distantes = adresses.filter((u) => !/^(data:|file:|blob:|about:|http:\/\/127\.0\.0\.1[:/])/.test(u));
  assert.deepEqual(distantes, []);
  assert.ok(adresses.length > 0);
});

test('film : export rapide égal à l\'export fidèle (écart au plus 2 %)', { ...SANS, timeout: 90000 }, async () => {
  const { c } = await ouvrir(projetFilm({ attrs: ' data-cadre="navigateur"' }));
  try {
    await c.evaluer(`${fs.readFileSync(path.join(RACINE, 'moteur', 'capture.js'), 'utf8')}; true`);
    for (const t of [1, 2.2, 4]) {
      const fidele = decoder(await c.capturer(t));
      const rapide = decoder(Buffer.from(await c.evaluer(`(async () => { await M.seek(${t}); const k = document.createElement('canvas'); k.width = ${L}; k.height = ${H}; await M.capturer(k.getContext('2d'), ${L}, ${H}); return k.toDataURL('image/png').split(',')[1]; })()`), 'base64'));
      let s = 0;
      for (let i = 0; i < L * H; i++) for (let k = 0; k < 3; k++) s += Math.abs(fidele.donnees[i * fidele.canaux + k] - rapide.donnees[i * rapide.canaux + k]);
      assert.ok(s / (L * H * 3 * 255) <= 0.02, `t = ${t} : ${(100 * s / (L * H * 3 * 255)).toFixed(2)} %`);
    }
  } finally { await c.fermer(); }
});
