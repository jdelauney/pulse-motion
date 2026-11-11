'use strict';
/* Spec S6, plan 3 (sites en ligne, connexion, confidentialité) : accord réseau, profil d'un site hors du projet, connexion
 * par la personne (même processus), page qui redemande l'identifiant, flou des données personnelles dans les pixels,
 * flou ajouté après coup, film.json sans données personnelles. Jamais d'internet : l'appli d'essai sur 127.0.0.1, et un
 * « site en ligne » simulé par un nom en .test rebranché sur 127.0.0.1. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const FL = require('../scripts/lib/flou.js');
const Pa = require('../scripts/lib/parcours.js');
const F = require('../scripts/lib/film.js');
const C = require('../scripts/lib/connexions.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { scriptAvec } = require('../scripts/lib/tournage-page.js');
const { servirAppliEssai, DOSSIER } = require('../scripts/lib/appli-essai.js');
const { tourner } = require('../scripts/lib/tournage.js');
const { flouter, lireZone } = require('../scripts/lib/flouter.js');
const { principal } = require('../scripts/filmer.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { ecrireFilm } = require('./aide/film.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const ROUGE = [179, 38, 30];   // .contact de l'appli d'essai

function ecrireParcours(dir, nom, p) {
  fs.mkdirSync(path.join(dir, 'films', nom), { recursive: true });
  fs.writeFileSync(path.join(dir, 'films', nom, 'parcours.json'), JSON.stringify({ nom, ...p }, null, 2));
}

/** Données personnelles de la personne : un dossier à part pour chaque test (profils des sites). */
function dossierPersonnelTemporaire() {
  const d = dossierTemporaire('pm-perso-');
  process.env.PULSE_MOTION_DOSSIER = d;
  return d;
}

/** Faux « site en ligne » : l'appli d'essai servie sous n'importe quel nom d'hôte (Chrome le rebranche sur 127.0.0.1). */
function fauxSite() {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const serveur = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/sortie.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><body style="font:20px sans-serif"><a href="http://ailleurs.test:${serveur.address().port}/index.html">Un autre site</a></body>`);
      return;
    }
    const nom = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
    const f = path.join(DOSSIER, nom);
    if (!/^[a-z.-]+$/.test(nom) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(nom)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok({ port: serveur.address().port, fermer: () => new Promise((f) => { serveur.closeAllConnections?.(); serveur.close(() => f()); }) })));
}

/** Pixels proches d'une couleur dans des images (décodées dans Chrome) : -> [compte par image]. */
async function comptesCouleur(page, fichiers, rgb, ecart = 48) {
  const r = [];
  for (const f of fichiers) {
    const mime = f.endsWith('.webp') ? 'image/webp' : f.endsWith('.png') ? 'image/png' : 'image/jpeg';
    r.push(await page.evaluer(`(async () => {
      const b = await createImageBitmap(await (await fetch('data:${mime};base64,${fs.readFileSync(f).toString('base64')}')).blob());
      const c = new OffscreenCanvas(b.width, b.height); const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(b, 0, 0);
      const d = x.getImageData(0, 0, b.width, b.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - ${rgb[0]}) + Math.abs(d[i + 1] - ${rgb[1]}) + Math.abs(d[i + 2] - ${rgb[2]}) < ${ecart}) n++;
      return n;
    })()`));
  }
  return r;
}

// --- Purs -----------------------------------------------------------------------------------------------------------

test('flou : motifs reconnus (courriel, téléphone, IBAN, carte validée par Luhn, sécurité sociale) ; film.json masqué', () => {
  const cats = (t) => FL.trouverTextes(t).map((p) => p.categorie);
  assert.deepEqual(cats('Écrire à compta@facturo-demo.fr'), ['courriel']);
  assert.deepEqual(cats('Tél. 06 12 34 56 78'), ['telephone']);
  assert.deepEqual(cats('+33 1 23 45 67 89'), ['telephone']);
  assert.ok(cats('IBAN FR76 3000 6000 0112 3456 7890 189').includes('iban'));
  assert.deepEqual(cats('Carte 4111 1111 1111 1111'), ['carte']);
  assert.deepEqual(cats('Mandat 4970 1012 3456 7890'), [], 'un numéro qui échoue à Luhn n\'est pas une carte');
  assert.ok(cats('N° 1 85 05 78 006 084 36').includes('secu'));
  assert.deepEqual(cats('Total 34775,12 € · F-2041 · 01/10/2026 · 1618,74 €'), []);
  assert.equal(FL.luhn('4111111111111111'), true);
  assert.equal(FL.luhn('4970101234567890'), false);
  assert.equal(FL.masquerTexte('Écrire à camille.durand@facturo-demo.fr ou au 06 12 34 56 78'), 'Écrire à ••• ou au •••');
  assert.equal(FL.categorieChamp({ type: 'password' }), 'mot-de-passe');
  assert.equal(FL.categorieChamp({ type: 'text', autocomplete: 'cc-number' }), 'carte');
  assert.equal(FL.categorieChamp({ type: 'text', autocomplete: 'street-address' }), 'adresse');
  // « ne floute pas les adresses, elles sont fausses » ; un mot de passe reste toujours flouté.
  const r = FL.lireFlou({ auto: false });
  assert.equal(r.actives.courriel, false);
  assert.equal(r.actives['mot-de-passe'], true);
  assert.equal(FL.lireFlou({ categories: { adresse: false } }).actives.adresse, false);
});

test('parcours : flou validé ; un seul site en ligne ; domaine et nom réduit', () => {
  const base = { nom: 'a', depart: 'https://app.exemple.fr/', etapes: [{ faire: 'attendre', secondes: 1 }] };
  assert.deepEqual(Pa.validerParcours({ ...base, flou: { auto: true, mode: 'masque', cibles: ['Nom', { colonne: 'Client' }, { selecteur: 'td.nom' }], categories: { adresse: false } } }).erreurs, []);
  const e = Pa.validerParcours({ ...base, flou: { mode: 'gris', categories: { 'mot-de-passe': false, inconnue: false }, cibles: [{ colonne: '' }] } }).erreurs.join(' ');
  for (const m of ['flou.mode', 'toujours flouté', 'catégorie « inconnue »', 'colonne']) assert.ok(e.includes(m), m);
  assert.match(Pa.validerParcours({ ...base, etapes: [{ faire: 'aller', url: 'https://autre.org/' }] }).erreurs.join(' '), /un seul site en ligne/);
  assert.deepEqual(Pa.validerParcours({ ...base, etapes: [{ faire: 'aller', url: 'https://compte.exemple.fr/x' }] }).erreurs, [], 'même domaine');
  assert.equal(Pa.domaineDe('app.exemple.fr'), 'exemple.fr');
  assert.equal(Pa.domaineDe('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(Pa.siteReduit('App.Exemple.fr'), 'app-exemple-fr');
});

test('connexion : les préférences du profil désactivent l\'enregistrement des mots de passe ; oublier supprime le profil du site', async () => {
  const perso = dossierPersonnelTemporaire();
  const profil = C.profilSite('app.exemple.fr');
  assert.equal(profil, path.join(perso, 'navigateur', 'app-exemple-fr'));
  const p = JSON.parse(fs.readFileSync(path.join(profil, 'Default', 'Preferences'), 'utf8'));
  assert.equal(p.credentials_enable_service, false);
  assert.equal(p.profile.password_manager_enabled, false);
  assert.equal(p.autofill.profile_enabled, false);
  assert.deepEqual(C.connexions().map((x) => x.site), ['app.exemple.fr']);
  const sortie = [];
  const ecrire = process.stdout.write;
  process.stdout.write = (t) => { sortie.push(String(t)); return true; };
  try { await principal(['connexions', 'oublier', 'app.exemple.fr']); } finally { process.stdout.write = ecrire; }
  assert.equal(JSON.parse(sortie.join('')).oublie, true);
  assert.ok(!fs.existsSync(profil));
  assert.deepEqual(C.connexions(), []);
});

test('bibliotheque : ~/.pulse-motion/navigateur n\'est jamais exporté ni importé', () => {
  assert.ok(C.EXCLUS_BIBLIOTHEQUE.includes('navigateur'));
  assert.ok(C.dossierConnexions().endsWith(`${path.sep}navigateur`));
});

test('flou : flouter --zone modifie les images des étapes visées et seulement elles ; aucune copie nette ne reste dans le projet', { ...SANS, timeout: 120000 }, async () => {
  const dir = dossierTemporaire('pm-flouter-');
  ecrireFilm(dir);
  const prise = path.join(dir, 'films', 'essai', 'prise-01');
  const avant = Object.fromEntries(fs.readdirSync(path.join(prise, 'images')).map((f) => [f, sha(fs.readFileSync(path.join(prise, 'images', f)))]));
  const filmAvant = JSON.parse(fs.readFileSync(path.join(prise, 'film.json'), 'utf8'));
  assert.deepEqual(lireZone('10,20,30,40'), [10, 20, 30, 40]);
  assert.equal(lireZone('80,0,30,10'), null);
  // Un motif net dans l'image de l'étape 3 (sinon une image unie resterait la même une fois floutée).
  const { encoder } = require('../scripts/lib/png.js');
  const L = 640, H = 400, donnees = Buffer.alloc(L * H * 3);
  for (let i = 0; i < L * H; i++) { const v = ((i % L) >> 2) % 2 ? 255 : 0; donnees.fill(v, i * 3, i * 3 + 3); }
  for (const n of ['0005.png', 'r03-0001.png']) fs.writeFileSync(path.join(prise, 'images', n), encoder({ largeur: L, hauteur: H, canaux: 3, donnees }));
  const lignes = Buffer.alloc(L * H * 3);
  for (let i = 0; i < L * H; i++) { const v = (Math.floor(i / L) >> 2) % 2 ? 255 : 0; lignes.fill(v, i * 3, i * 3 + 3); }
  fs.writeFileSync(path.join(prise, 'images', '0004.png'), encoder({ largeur: L, hauteur: H, canaux: 3, donnees: lignes }));
  const nets = Object.fromEntries(fs.readdirSync(path.join(prise, 'images')).map((f) => [f, sha(fs.readFileSync(path.join(prise, 'images', f)))]));
  const r = await flouter({ projet: dir, nom: 'essai', etapes: '3', zone: [0, 0, 50, 50], navigateur });
  assert.equal(r.ok, true, JSON.stringify(r));
  const film = JSON.parse(fs.readFileSync(path.join(prise, 'film.json'), 'utf8'));
  // Étapes 1 et 2 : mêmes images, mêmes octets (0004.png, partagée avec l'étape 2, reste nette pour elle).
  for (const e of film.etapes.slice(0, 2)) {
    for (const k of ['avant', 'survol', 'apres']) if (e[k]) assert.equal(sha(fs.readFileSync(path.join(prise, 'images', e[k]))), nets[e[k]], `étape ${e.n}, ${k}`);
  }
  assert.equal(film.etapes[1].apres, '0004.png');
  // Étape 3 : chaque image floutée (copie pour l'image partagée), le flou compté.
  const e3 = film.etapes[2];
  assert.notEqual(e3.avant, '0004.png');
  for (const n of [e3.avant, e3.survol, e3.apres, e3.reaction[0][1]]) assert.notEqual(sha(fs.readFileSync(path.join(prise, 'images', n))), nets[n] || nets['0004.png'], n);
  assert.equal(e3.flous.apres, 1);
  assert.equal(filmAvant.etapes[2].flous.apres, 0);
  assert.deepEqual(F.validerFilm(film, { dossier: prise }), []);
  // Aucune copie nette : ni dans la prise, ni ailleurs dans le projet (planche refaite).
  const netsEtape3 = new Set([nets['0005.png'], nets['r03-0001.png']]);
  const tous = fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());
  for (const f of tous) assert.ok(!netsEtape3.has(sha(fs.readFileSync(f))), `copie nette : ${path.relative(dir, f)}`);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'planche-film', 'essai-prise-01', 'etape-03.png')));
  assert.ok(Object.keys(avant).length > 0);
});

// --- Dans Chrome ----------------------------------------------------------------------------------------------------

test('flou : le champ de mot de passe et un IBAN sont floutés ; un numéro qui échoue à Luhn ne l\'est pas ; une cible de flou désignée suit le défilement', { ...SANS, timeout: 90000 }, async () => {
  const essai = await servirAppliEssai();
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 600, options: ['--disable-threaded-scrolling'] });
  try {
    await page.envoyer('Page.addScriptToEvaluateOnNewDocument', { source: scriptAvec({ flou: { cibles: [{ colonne: 'Client' }] } }) });
    await page.aller(`${essai.url}index.html`);
    await page.evaluer('__pm.flouPret()');
    const boite = (sel) => page.evaluer(`(function () { var r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
    const couvre = (zones, b) => zones.some((z) => z.boite[0] <= b[0] + 1 && z.boite[1] <= b[1] + 1 && z.boite[0] + z.boite[2] >= b[0] + b[2] - 1 && z.boite[1] + z.boite[3] >= b[1] + b[3] - 1);
    let zones = await page.evaluer('__pm.zonesFlou()');
    assert.ok(couvre(zones, await boite('#secret')), 'mot de passe');
    assert.ok(couvre(zones, await boite('#identifiant')), 'adresse électronique');
    await page.aller(`${essai.url}clients.html`);
    await page.evaluer('document.getElementById("paiement").scrollIntoView(); __pm.flouPret()');
    zones = await page.evaluer('__pm.zonesFlou()');
    assert.ok(couvre(zones, await boite('#paiement p:nth-child(2) .contact')), 'IBAN');
    assert.ok(couvre(zones, await boite('#paiement p:nth-child(3) .contact')), 'carte');
    assert.ok(!couvre(zones, await boite('.reference')), 'numéro qui échoue à Luhn : pas flouté');
    // Cible désignée (la colonne Client) : après un défilement, le voile est sur la cellule, dans l'image même.
    await page.evaluer('window.scrollTo(0, 0); window.scrollBy(0, 260); new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))');
    const cellule = await boite('#clients tbody tr:nth-child(8) td:nth-child(1)');
    const ville = await boite('#clients tbody tr:nth-child(8) td:nth-child(4)');
    zones = await page.evaluer('__pm.zonesFlou()');
    assert.ok(zones.some((z) => z.origine === 'cible') && couvre(zones.filter((z) => z.origine === 'cible'), cellule), 'cible suivie');
    const { decoder } = require('../scripts/lib/png.js');
    const png = decoder(await page.capturer({ format: 'png' }));
    const ecart = (b) => {
      const v = [];
      for (let y = Math.round(b[1] + 4); y < b[1] + b[3] - 4; y++) for (let x = Math.round(b[0] + 6); x < b[0] + Math.min(b[2], 120); x++) v.push(png.donnees[(y * png.largeur + x) * png.canaux]);
      const m = v.reduce((a, c) => a + c, 0) / v.length;
      return Math.sqrt(v.reduce((a, c) => a + (c - m) ** 2, 0) / v.length);
    };
    assert.ok(ecart(cellule) < ecart(ville) * 0.5, `cellule floutée ${ecart(cellule).toFixed(1)} / ville nette ${ecart(ville).toFixed(1)}`);
  } finally { await page.fermer(); await essai.fermer(); }
});

test('flou : l\'adresse électronique de l\'application de démonstration est floutée dans toutes les images de la prise, défilement compris', { ...SANS, timeout: 180000 }, async () => {
  const dir = dossierTemporaire('pm-flou-prise-');
  ecrireParcours(dir, 'clients', { depart: 'appli-essai/clients.html', etapes: [
    { faire: 'defiler', ecrans: 0.5, dit: 'Descendez un peu.' },
    { faire: 'defiler', vers: 'Paiement des abonnements', dit: 'Jusqu\'au paiement.' },
  ] });
  const r = await tourner({ projet: dir, nom: 'clients', navigateur, calme: { attente: 300 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const prise = path.join(dir, 'films', 'clients', r.prise);
  const film = JSON.parse(fs.readFileSync(path.join(prise, 'film.json'), 'utf8'));
  const images = fs.readdirSync(path.join(prise, 'images')).map((f) => path.join(prise, 'images', f));
  assert.ok(film.etapes.some((e) => e.reaction.length > 2), 'des images de défilement');
  assert.ok(film.etapes.every((e) => e.flous.auto > 0), JSON.stringify(film.etapes.map((e) => e.flous)));
  const page = await ouvrirPage({ navigateur, largeur: 400, hauteur: 300 });
  try {
    const comptes = await comptesCouleur(page, images, ROUGE);
    assert.ok(comptes.every((n) => n < 30), `pixels rouges des coordonnées : ${comptes.join(', ')}`);
    // Témoin : la même page sans flou montre bien ces pixels.
    const essai = await servirAppliEssai();
    const temoin = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800, echelle: 1.5 });
    try {
      await temoin.aller(`${essai.url}clients.html`);
      const f = path.join(dir, 'temoin.webp');
      fs.writeFileSync(f, await temoin.capturer({ format: 'webp', qualite: 90 }));
      const [n] = await comptesCouleur(page, [f], ROUGE);
      assert.ok(n > 300, `témoin : ${n}`);
    } finally { await temoin.fermer(); await essai.fermer(); }
  } finally { await page.fermer(); }
});

test('film : film.json ne contient ni paramètre d\'adresse, ni texte reconnu comme personnel', { ...SANS, timeout: 120000 }, async () => {
  const dir = dossierTemporaire('pm-film-perso-');
  fs.writeFileSync(path.join(dir, 'page.html'), `<!doctype html><meta charset="utf-8"><body style="font:18px sans-serif">
<button id="b" onclick="confirm('Appeler le 06 12 34 56 78 ?'); this.textContent = 'Écrit'">Écrire à jean.dupont@exemple.fr</button>
<label>Destinataire <select id="s"><option>Choisir</option><option>marie.curie@exemple.fr</option></select></label>
<a href="suite.html?client=12&jeton=abc#haut">Suite</a></body>`);
  fs.writeFileSync(path.join(dir, 'suite.html'), '<!doctype html><meta charset="utf-8"><p>Suite</p>');
  ecrireParcours(dir, 'perso', { depart: 'page.html', etapes: [
    { faire: 'cliquer', cible: 'Écrire à jean.dupont@exemple.fr', dit: 'Cliquez sur Écrire à jean.dupont@exemple.fr.' },
    { faire: 'choisir', cible: 'Destinataire', option: 'marie.curie@exemple.fr', dit: 'Choisissez Marie.' },
    { faire: 'cliquer', cible: 'Suite', dit: 'Suite.' },
  ] });
  const r = await tourner({ projet: dir, nom: 'perso', navigateur, calme: { attente: 300 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const texte = fs.readFileSync(path.join(dir, 'films', 'perso', r.prise, 'film.json'), 'utf8');
  const film = JSON.parse(texte);
  assert.equal(film.etapes[2].url, 'suite.html');
  for (const e of film.etapes) assert.doesNotMatch(e.url, /[?#]/);
  assert.doesNotMatch(texte, /jeton|client=|#haut/);
  assert.deepEqual(FL.trouverTextes(texte), [], 'aucun texte reconnu comme personnel');
  assert.doesNotMatch(texte, /@exemple|06 12 34/);
  assert.ok(film.etapes[0].dialogue && /•••/.test(film.etapes[0].dialogue.message));
  assert.ok(film.etapes[1].options.libelles.includes('•••'));
});

test('filmer : un site en ligne se filme après l\'accord, sur son seul site ; profil créé sous ~/.pulse-motion/navigateur/ et jamais dans le projet', { ...SANS, timeout: 180000 }, async () => {
  const perso = dossierPersonnelTemporaire();
  const site = await fauxSite();
  const dir = dossierTemporaire('pm-en-ligne-');
  const hote = 'facturo.exemple.test';
  ecrireParcours(dir, 'enligne', { depart: `http://${hote}:${site.port}/factures.html`, etapes: [
    { faire: 'cliquer', cible: 'Actualiser', dit: 'Actualisez.' },
    { faire: 'aller', url: `http://compta.exemple.test:${site.port}/clients.html`, dit: 'Allez sur les clients.' },
  ] });
  const resolutions = { [hote]: '127.0.0.1', 'compta.exemple.test': '127.0.0.1', 'ailleurs.test': '127.0.0.1' };
  try {
    assert.deepEqual(await tourner({ projet: dir, nom: 'enligne', navigateur, resolutions }), { ok: false, besoin: 'accord', site: hote });
    const r = await tourner({ projet: dir, nom: 'enligne', navigateur, accord: true, resolutions, calme: { attente: 300 } });
    assert.equal(r.ok, true, JSON.stringify(r));
    const parcours = JSON.parse(fs.readFileSync(path.join(dir, 'films', 'enligne', 'parcours.json'), 'utf8'));
    assert.equal(parcours.accord.site, hote);
    const film = JSON.parse(fs.readFileSync(path.join(dir, 'films', 'enligne', r.prise, 'film.json'), 'utf8'));
    assert.equal(film.site, hote);
    assert.equal(film.etapes[1].url, `http://compta.exemple.test:${site.port}/clients.html`);
    // Profil du site : hors du projet, préférences gardées après le passage de Chrome.
    const profil = path.join(perso, 'navigateur', 'facturo-exemple-test');
    assert.ok(fs.existsSync(path.join(profil, 'Default')), 'profil du site');
    const pref = JSON.parse(fs.readFileSync(path.join(profil, 'Default', 'Preferences'), 'utf8'));
    assert.equal(pref.credentials_enable_service, false);
    const projet = fs.readdirSync(dir, { recursive: true });
    assert.ok(!projet.some((f) => /(^|[\\/])(Default|Local State|Cookies)([\\/]|$)/.test(f)), 'aucun profil dans le projet');
    // Prise suivante : l'accord noté suffit ; une navigation vers un autre site est bloquée (et dite).
    fs.writeFileSync(path.join(dir, 'films', 'enligne', 'parcours.json'), JSON.stringify({ ...parcours, depart: `http://${hote}:${site.port}/sortie.html`, etapes: [
      { faire: 'cliquer', cible: 'Un autre site', dit: 'Cliquez sur le lien.' },
    ] }));
    const r2 = await tourner({ projet: dir, nom: 'enligne', navigateur, resolutions, calme: { attente: 300 } });
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.ok(r2.alertes.some((a) => /autre site \(ailleurs\.test\)/.test(a)), JSON.stringify(r2.alertes));
    const film2 = JSON.parse(fs.readFileSync(path.join(dir, 'films', 'enligne', r2.prise, 'film.json'), 'utf8'));
    assert.doesNotMatch(film2.etapes[0].url, /ailleurs/);
  } finally { await site.fermer(); }
});

test('connexion : filmer continuer reprend le tournage dans le même processus (session de l\'application de démonstration gardée)', { ...SANS, timeout: 180000 }, async () => {
  const dir = dossierTemporaire('pm-connexion-');
  ecrireParcours(dir, 'compte', { depart: 'appli-essai/compte.html', connexion: true, etapes: [
    { faire: 'attendre', texte: 'Compte de Camille Durand', dit: 'Voici votre compte.' },
    { faire: 'cliquer', cible: 'Mes factures', dit: 'Ouvrez vos factures.' },
  ] });
  const progression = [];
  const r = await tourner({ projet: dir, nom: 'compte', navigateur, fenetre: false, calme: { attente: 300 }, surEtape: (x) => progression.push(x),
    // La personne se connecte elle-même, puis va sur la page de départ et dit « c'est fait ».
    personne: async ({ evaluer }) => {
      await evaluer('document.getElementById("secret").value = "x"; document.getElementById("connexion").requestSubmit(); true');
      await pause(800);
      await evaluer('location.href = "compte.html"; true');
      await pause(800);
      const sortie = [];
      const ecrire = process.stdout.write;
      process.stdout.write = (t) => { sortie.push(String(t)); return true; };
      try { await principal(['continuer', dir, 'compte']); } finally { process.stdout.write = ecrire; }
      assert.equal(JSON.parse(sortie.join('')).ok, true);
    } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(progression[0], { attente: 'connexion', site: 'appli-essai' });
  const film = JSON.parse(fs.readFileSync(path.join(dir, 'films', 'compte', r.prise, 'film.json'), 'utf8'));
  assert.equal(film.etapes[0].url, 'appli-essai/compte.html', 'la session ouverte par la personne sert au tournage');
  assert.equal(film.etapes[1].url, 'appli-essai/factures.html');
  assert.ok(!fs.existsSync(path.join(dir, 'films', 'compte', '.continuer')));
  // Sans réponse : besoin « connexion » au bout du délai.
  const r2 = await tourner({ projet: dir, nom: 'compte', navigateur, fenetre: false, delaiConnexion: 1500 });
  assert.equal(r2.besoin, 'connexion');
});

test('connexion : une page qui redemande l\'identifiant rend besoin « connexion »', { ...SANS, timeout: 120000 }, async () => {
  const dir = dossierTemporaire('pm-identifiant-');
  ecrireParcours(dir, 'compte', { depart: 'appli-essai/compte.html', etapes: [{ faire: 'cliquer', cible: 'Mes factures', dit: 'Ouvrez vos factures.' }] });
  const r = await tourner({ projet: dir, nom: 'compte', navigateur, calme: { attente: 300 } });
  assert.equal(r.ok, false);
  assert.equal(r.besoin, 'connexion', JSON.stringify(r));
  assert.deepEqual(fs.readdirSync(path.join(dir, 'films', 'compte')), ['parcours.json'], 'aucune prise incomplète');
});
