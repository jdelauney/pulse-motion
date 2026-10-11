'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(64, 1)]);
const RELU = { ok: true, duree: 7.27, images: 218, erreurs: [], audio: false };

function requete(url, { methode = 'GET', type, corps, entetes = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: methode, headers: { ...(type ? { 'Content-Type': type } : {}), ...entetes } }, (res) => {
      const morceaux = [];
      res.on('data', (d) => morceaux.push(d));
      res.on('end', () => {
        const texte = Buffer.concat(morceaux).toString('utf8');
        let json = null;
        try { json = JSON.parse(texte); } catch { /* pas du JSON */ }
        resolve({ statut: res.statusCode, type: res.headers['content-type'], texte, json });
      });
    });
    req.on('error', reject);
    req.end(corps);
  });
}

async function avecApercu(port, fn) {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port, dossierStyles: STYLES });
  try { await fn(dir, apercu.url); } finally { await apercu.fermer(); }
}

const lireEtatExport = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'export.json'), 'utf8'));
const relecture = (r) => ({ 'X-PM-Relecture': encodeURIComponent(JSON.stringify(r)) });

test('la page d\'aperçu charge la capture et l\'interface d\'export ; les modules sont servis', async () => {
  await avecApercu(47310, async (dir, url) => {
    const page = await requete(url);
    assert.match(page.texte, /<script src="\/_pm\/capture\.js"><\/script>/);
    assert.match(page.texte, /<script type="module" src="\/_pm\/export-ui\.mjs"><\/script>/);
    for (const chemin of ['_pm/capture.js', '_pm/export.mjs', '_pm/export-ui.mjs', '_pm/vendor/mediabunny.min.mjs']) {
      const r = await requete(url + chemin);
      assert.equal(r.statut, 200, chemin);
      assert.match(r.type, /^text\/javascript/, chemin);
    }
  });
});

test('MP4 relu : écrit sous le nom du titre, export.json « fini », ancien fichier remplacé', async () => {
  await avecApercu(47311, async (dir, url) => {
    fs.mkdirSync(path.join(dir, 'sortie'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.mp4'), 'ancien');
    const r = await requete(url + '_pm/export', { methode: 'POST', type: 'video/mp4', corps: MP4, entetes: relecture(RELU) });
    assert.equal(r.statut, 200, r.texte);
    assert.deepEqual(r.json, { fichier: 'sortie/la-chaine-du-froid.mp4' });
    assert.deepEqual(fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.mp4')), MP4);
    assert.equal(fs.existsSync(path.join(dir, 'sortie', '.la-chaine-du-froid.mp4.part')), false);
    const etat = lireEtatExport(dir);
    assert.equal(etat.etat, 'fini');
    assert.equal(etat.images, 218);
  });
});

test('MP4 refusé : type, relecture absente ou en échec, fichier qui n\'est pas un MP4 — rien dans sortie/', async () => {
  await avecApercu(47312, async (dir, url) => {
    const envoi = (corps, entetes, type = 'video/mp4') => requete(url + '_pm/export', { methode: 'POST', type, corps, entetes });
    assert.equal((await envoi(MP4, relecture(RELU), 'application/octet-stream')).statut, 415);
    assert.equal((await envoi(MP4, {})).statut, 400);
    const echec = await envoi(MP4, relecture({ ok: false, erreurs: ['la première image est noire.'] }));
    assert.equal(echec.statut, 422);
    assert.match(echec.json.message, /relecture de la vidéo a échoué : la première image est noire\./);
    assert.equal(lireEtatExport(dir).etat, 'erreur');
    assert.equal((await envoi(Buffer.from('pas une vidéo du tout'), relecture(RELU))).statut, 422);
    const fichiers = fs.readdirSync(path.join(dir, 'sortie'));
    assert.ok(!fichiers.some((f) => f.endsWith('.mp4') || f.endsWith('.part')), fichiers.join(', '));
  });
});

test('renommage impossible (ancienne vidéo bloquée) : erreur en français, aperçu toujours en vie, pas de .part', async () => {
  await avecApercu(47316, async (dir, url) => {
    // Un dossier non vide à la place de la vidéo finale rend le renommage impossible.
    fs.mkdirSync(path.join(dir, 'sortie', 'la-chaine-du-froid.mp4'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.mp4', 'x'), 'x');
    const r = await requete(url + '_pm/export', { methode: 'POST', type: 'video/mp4', corps: MP4, entetes: relecture(RELU) });
    assert.equal(r.statut, 500);
    assert.match(r.json.message, /n'a pas pu être enregistrée/);
    assert.equal(lireEtatExport(dir).etat, 'erreur');
    assert.equal(fs.readdirSync(path.join(dir, 'sortie')).some((f) => f.endsWith('.part')), false);
    assert.equal((await requete(url)).statut, 200, 'l\'aperçu répond encore');
    // Même chose pour une image de planche : un fichier à la place du dossier planche/.
    fs.writeFileSync(path.join(dir, 'sortie', 'planche'), 'x');
    const image = await requete(url + '_pm/planche/intro-1.png', { methode: 'POST', type: 'image/png', corps: PNG });
    assert.equal(image.statut, 500);
    assert.equal((await requete(url)).statut, 200);
  });
});

test('deux envois de vidéo en même temps : le second est refusé (409), le premier aboutit', async () => {
  await avecApercu(47317, async (dir, url) => {
    const premier = new Promise((resolve, reject) => {
      const req = http.request(url + '_pm/export', { method: 'POST', headers: { 'Content-Type': 'video/mp4', ...relecture(RELU) } }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.write(MP4.subarray(0, 20));
      setTimeout(async () => {
        const second = await requete(url + '_pm/export', { methode: 'POST', type: 'video/mp4', corps: MP4, entetes: relecture(RELU) });
        assert.equal(second.statut, 409);
        assert.match(second.json.message, /déjà en cours/);
        req.end(MP4.subarray(20));
      }, 200);
    });
    assert.equal(await premier, 200);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'sortie', 'la-chaine-du-froid.mp4')), MP4);
  });
});

test('avertissement de la relecture (musique illisible) conservé dans export.json', async () => {
  await avecApercu(47318, async (dir, url) => {
    const r = await requete(url + '_pm/export', { methode: 'POST', type: 'video/mp4', corps: MP4, entetes: relecture({ ...RELU, avertissement: 'La musique n\'a pas pu être lue : vidéo exportée sans son.' }) });
    assert.equal(r.statut, 200);
    assert.match(lireEtatExport(dir).avertissement, /musique n'a pas pu être lue/);
  });
});

test('titre accentué : nom de fichier sans accents ni espaces', async () => {
  await avecApercu(47313, async (dir, url) => {
    modifierDeroule(dir, (d) => { d.titre = 'Hygiène : les 5 règles d\'or !'; });
    const r = await requete(url + '_pm/export', { methode: 'POST', type: 'video/mp4', corps: MP4, entetes: relecture(RELU) });
    assert.equal(r.json.fichier, 'sortie/hygiene-les-5-regles-d-or.mp4');
  });
});

test('état de l\'export : en-cours, erreur, annule ; autre valeur refusée', async () => {
  await avecApercu(47314, async (dir, url) => {
    const etat = (corps) => requete(url + '_pm/export-etat', { methode: 'POST', type: 'application/json', corps: JSON.stringify(corps) });
    assert.equal((await etat({ etat: 'en-cours', images: 30, total: 218 })).statut, 200);
    assert.deepEqual([lireEtatExport(dir).etat, lireEtatExport(dir).images], ['en-cours', 30]);
    assert.equal((await etat({ etat: 'annule', message: 'Export annulé.' })).statut, 200);
    assert.equal(lireEtatExport(dir).message, 'Export annulé.');
    assert.equal((await etat({ etat: 'fini' })).statut, 400);
  });
});

test('planche : images PNG nommées sûrement, page de planche avec les seules images reçues', async () => {
  await avecApercu(47315, async (dir, url) => {
    const image = (nom, corps = PNG, type = 'image/png') => requete(`${url}_pm/planche/${nom}`, { methode: 'POST', type, corps });
    assert.equal((await image('intro-1.png')).statut, 200);
    assert.equal((await image('intro-2.png', Buffer.from('faux'))).statut, 422);
    assert.equal((await image('intro-3.png', PNG, 'image/jpeg')).statut, 415);
    assert.equal((await image('..%2Fevil.png')).statut, 404);
    assert.equal((await image('Intro.png')).statut, 404);
    const fin = await requete(url + '_pm/planche-fin', { methode: 'POST', type: 'application/json', corps: JSON.stringify({ images: ['intro-1.png', 'intro-2.png', '../../x.png'] }) });
    assert.equal(fin.statut, 200);
    const html = fs.readFileSync(path.join(dir, 'sortie', 'planche', 'planche.html'), 'utf8');
    assert.match(html, /<img src="intro-1\.png"/);
    assert.doesNotMatch(html, /intro-2|x\.png/);
    assert.deepEqual(lireEtatExport(dir).images, ['sortie/planche/intro-1.png']);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'sortie', 'planche')).sort(), ['intro-1.png', 'planche.html']);
  });
});
