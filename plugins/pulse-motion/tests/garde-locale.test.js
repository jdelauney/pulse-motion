'use strict';
// Garde commune des serveurs locaux (scripts/lib/garde-locale.js), écriture atomique (scripts/lib/fichiers.js), et leur
// branchement dans l'aperçu et la page de choix des mouvements (spec S4 § 5.1, plan R0).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { garder, fichierServi, EN_TETES } = require('../scripts/lib/garde-locale.js');
const { ecrireAtomique } = require('../scripts/lib/fichiers.js');
const { demarrerApercu, TYPES_ECRITURE } = require('../scripts/apercu.js');
const { STYLES, copierProjet } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

/** Requête brute : { statut, entetes, texte }. hote remplace l'en-tête Host. */
function requete(port, { methode = 'GET', chemin = '/', entetes = {}, corps, hote } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: chemin, method: methode, headers: { Host: hote || `127.0.0.1:${port}`, ...entetes } }, (res) => {
      let texte = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { texte += d; });
      res.on('end', () => resolve({ statut: res.statusCode, entetes: res.headers, texte }));
    });
    req.on('error', reject);
    req.end(corps);
  });
}

/** Petit serveur qui ne fait que passer la garde : 200 « ok » si elle laisse passer. */
async function serveurGarde(types) {
  const serveur = http.createServer((req, res) => {
    if (!garder(req, res, { port: serveur.address().port, types })) return;
    req.resume();
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  return { port: serveur.address().port, fermer: () => new Promise((r) => serveur.close(r)) };
}

const TYPES = [['/_pm/ecrire', ['application/json']]];
const json = (port, entetes = {}) => ({ methode: 'POST', chemin: '/_pm/ecrire', corps: '{}', entetes: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}`, ...entetes } });

test('garde : Host étranger refusé (403)', async () => {
  const s = await serveurGarde(TYPES);
  try {
    assert.equal((await requete(s.port, { hote: 'pirate.example' })).statut, 403);
    assert.equal((await requete(s.port, { hote: `pirate.example:${s.port}` })).statut, 403);
    assert.equal((await requete(s.port)).statut, 200);
    assert.equal((await requete(s.port, { hote: `localhost:${s.port}` })).statut, 200);
  } finally { await s.fermer(); }
});

test('garde : POST d\'une autre origine refusé', async () => {
  const s = await serveurGarde(TYPES);
  try {
    assert.equal((await requete(s.port, json(s.port))).statut, 200);
    assert.equal((await requete(s.port, json(s.port, { Origin: 'https://pirate.example' }))).statut, 403);
    assert.equal((await requete(s.port, json(s.port, { Origin: 'null' }))).statut, 403);
    assert.equal((await requete(s.port, json(s.port, { Origin: `http://127.0.0.1:${s.port + 1}` }))).statut, 403);
    assert.equal((await requete(s.port, json(s.port, { 'Sec-Fetch-Site': 'cross-site' }))).statut, 403);
    assert.equal((await requete(s.port, json(s.port, { 'Sec-Fetch-Site': 'same-site' }))).statut, 403);
    assert.equal((await requete(s.port, json(s.port, { 'Sec-Fetch-Site': 'same-origin' }))).statut, 200);
  } finally { await s.fermer(); }
});

test('garde : POST sans en-tête Origin refusé', async () => {
  const s = await serveurGarde(TYPES);
  try {
    const r = await requete(s.port, { methode: 'POST', chemin: '/_pm/ecrire', corps: '{}', entetes: { 'Content-Type': 'application/json' } });
    assert.equal(r.statut, 403);
    assert.match(r.texte, /ne vient pas de la page de Pulse Motion/);
  } finally { await s.fermer(); }
});

test('garde : envoi text/plain, formulaire ou multipart refusé ; type non déclaré refusé ; route inconnue 404', async () => {
  const s = await serveurGarde(TYPES);
  try {
    for (const type of ['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      assert.equal((await requete(s.port, json(s.port, { 'Content-Type': type }))).statut, 415, type);
    }
    assert.equal((await requete(s.port, json(s.port, { 'Content-Type': 'image/png' }))).statut, 415);
    assert.equal((await requete(s.port, json(s.port, { 'Content-Type': 'application/json; charset=utf-8' }))).statut, 200);
    assert.equal((await requete(s.port, Object.assign(json(s.port), { chemin: '/_pm/autre' }))).statut, 404);
  } finally { await s.fermer(); }
});

test('garde : GET /_pm/ appelé depuis un autre site refusé (Sec-Fetch-Site cross-site)', async () => {
  const s = await serveurGarde(TYPES);
  try {
    assert.equal((await requete(s.port, { chemin: '/_pm/module.mjs', entetes: { 'Sec-Fetch-Site': 'cross-site' } })).statut, 403);
    assert.equal((await requete(s.port, { chemin: '/_pm/module.mjs', entetes: { 'Sec-Fetch-Site': 'same-site' } })).statut, 403);
    assert.equal((await requete(s.port, { chemin: '/_pm/module.mjs', entetes: { 'Sec-Fetch-Site': 'same-origin' } })).statut, 200);
    assert.equal((await requete(s.port, { chemin: '/_pm/module.mjs', entetes: { 'Sec-Fetch-Site': 'none' } })).statut, 200);
    assert.equal((await requete(s.port, { chemin: '/_pm/module.mjs' })).statut, 200);
    // La page elle-même peut être ouverte par un lien d'ailleurs (navigation) : seules les adresses /_pm/ sont protégées.
    assert.equal((await requete(s.port, { chemin: '/', entetes: { 'Sec-Fetch-Site': 'cross-site' } })).statut, 200);
  } finally { await s.fermer(); }
});

test('garde : OPTIONS sans en-tête CORS', async () => {
  const s = await serveurGarde(TYPES);
  try {
    const r = await requete(s.port, { methode: 'OPTIONS', chemin: '/_pm/ecrire', entetes: { Origin: 'https://pirate.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(r.statut, 403);
    assert.ok(!Object.keys(r.entetes).some((k) => k.startsWith('access-control-')), 'aucun en-tête CORS');
  } finally { await s.fermer(); }
});

test('garde : nosniff et CORP sur toutes les réponses (acceptées comme refusées)', async () => {
  const s = await serveurGarde(TYPES);
  try {
    const reponses = [
      await requete(s.port),
      await requete(s.port, { hote: 'pirate.example' }),
      await requete(s.port, json(s.port, { Origin: 'https://pirate.example' })),
      await requete(s.port, { methode: 'OPTIONS' }),
    ];
    for (const r of reponses) {
      assert.equal(r.entetes['x-content-type-options'], 'nosniff');
      assert.equal(r.entetes['cross-origin-resource-policy'], 'same-origin');
      assert.equal(r.entetes['referrer-policy'], EN_TETES['Referrer-Policy']);
      assert.equal(r.entetes['cache-control'], 'no-store');
    }
    // no-referrer ferait envoyer « Origin: null » par Chrome sur les envois de la page elle-même, que la garde refuserait.
    assert.notEqual(EN_TETES['Referrer-Policy'], 'no-referrer');
  } finally { await s.fermer(); }
});

test('fichierServi : fichier caché, JSON et Markdown du projet refusés', () => {
  const projet = dossierTemporaire('pm-garde-');
  fs.mkdirSync(path.join(projet, 'assets', '.cache'), { recursive: true });
  for (const f of ['assets/photo.png', 'assets/.cache/x.png', 'assets/notes.md', 'assets/donnees.json', 'assets/page.html', 'assets/code.js', 'deroule.json', '.env']) {
    fs.writeFileSync(path.join(projet, f), 'x');
  }
  assert.equal(fichierServi(projet, 'assets/photo.png', { dossiers: ['assets'] }), fs.realpathSync(path.join(projet, 'assets', 'photo.png')));
  for (const f of ['assets/.cache/x.png', 'assets/notes.md', 'assets/donnees.json', 'assets/page.html', 'assets/code.js', 'deroule.json', '.env']) {
    assert.equal(fichierServi(projet, f), null, f);
  }
  assert.equal(fichierServi(projet, '../assets/photo.png'), null);
  assert.equal(fichierServi(projet, 'assets/../../photo.png'), null);
  assert.equal(fichierServi(projet, path.join(projet, 'assets', 'photo.png')), null, 'chemin absolu');
  assert.equal(fichierServi(projet, 'scenes/photo.png', { dossiers: ['assets'] }), null, 'hors des dossiers permis');
  assert.equal(fichierServi(projet, 'assets/absente.png'), null);
  assert.equal(fichierServi(projet, 'assets'), null, 'un dossier n\'est pas servi');
});

test('fichierServi : lien symbolique sortant refusé', (t) => {
  const projet = dossierTemporaire('pm-garde-');
  const dehors = dossierTemporaire('pm-dehors-');
  fs.writeFileSync(path.join(dehors, 'secret.png'), 'x');
  fs.mkdirSync(path.join(projet, 'assets'));
  fs.writeFileSync(path.join(projet, 'assets', 'vraie.png'), 'x');
  // Une jonction (lien de dossier) se crée partout, même sous Windows sans droits particuliers.
  fs.symlinkSync(dehors, path.join(projet, 'assets', 'dossier'), 'junction');
  assert.equal(fichierServi(projet, 'assets/dossier/secret.png'), null, 'dossier lié hors du projet');
  // Un lien de fichier demande, sous Windows, le mode développeur : vérifié seulement s'il peut être créé.
  try {
    fs.symlinkSync(path.join(dehors, 'secret.png'), path.join(projet, 'assets', 'lien.png'), 'file');
    fs.symlinkSync(path.join(projet, 'assets', 'vraie.png'), path.join(projet, 'assets', 'interne.png'), 'file');
  } catch (e) {
    if (e.code === 'EPERM') { t.diagnostic('liens de fichier non permis sur cet ordinateur : seule la jonction est vérifiée'); return; }
    throw e;
  }
  assert.equal(fichierServi(projet, 'assets/lien.png'), null);
  assert.equal(fichierServi(projet, 'assets/interne.png'), fs.realpathSync(path.join(projet, 'assets', 'vraie.png')), 'un lien qui reste dans le projet est servi');
});

test('ecrireAtomique : un lecteur concurrent ne voit jamais un fichier partiel', async () => {
  const dossier = dossierTemporaire('pm-atomique-');
  const fichier = path.join(dossier, 'etat.json');
  const grand = (n) => JSON.stringify({ n, remplissage: 'x'.repeat(400000) });
  ecrireAtomique(fichier, grand(0));
  // Un autre processus réécrit le fichier en boucle pendant que celui-ci le lit : chaque lecture doit être un JSON entier.
  // Sous Windows, renommer par-dessus un fichier qu'un lecteur tient ouvert échoue (EPERM) ; ecrireAtomique réessaie puis
  // abandonne proprement (l'ancien contenu reste) : l'écrivain compte ces abandons et continue.
  const ecrivain = spawn(process.execPath, ['-e', `
    const { ecrireAtomique } = require(${JSON.stringify(path.resolve(__dirname, '..', 'scripts', 'lib', 'fichiers.js'))});
    const fin = Date.now() + 1500;
    let reussies = 0, abandons = 0;
    for (let n = 1; Date.now() < fin; n++) {
      try { ecrireAtomique(${JSON.stringify(fichier)}, JSON.stringify({ n, remplissage: 'x'.repeat(400000) }), { pause: 5 }); reussies++; }
      catch (e) { if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; abandons++; }
    }
    process.stdout.write(JSON.stringify({ reussies, abandons }));
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  let bilan = '';
  ecrivain.stdout.on('data', (d) => { bilan += d; });
  const fini = new Promise((r) => ecrivain.on('exit', r));
  let lectures = 0;
  let enCours = true;
  fini.then(() => { enCours = false; });
  while (enCours) {
    let texte;
    try { texte = fs.readFileSync(fichier, 'utf8'); } catch (e) {
      // Sous Windows, un renommage en cours peut rendre le fichier un instant illisible : jamais partiel pour autant.
      if (['EPERM', 'EBUSY', 'EACCES', 'ENOENT'].includes(e.code)) { await new Promise((r) => setImmediate(r)); continue; }
      throw e;
    }
    assert.doesNotThrow(() => JSON.parse(texte), 'fichier lu à moitié écrit');
    lectures++;
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(await fini, 0, 'l\'écrivain s\'est arrêté sur une erreur inattendue');
  const { reussies } = JSON.parse(bilan);
  assert.ok(reussies > 5, `trop peu d'écritures réussies (${bilan})`);
  assert.ok(lectures > 5, `trop peu de lectures (${lectures})`);
  assert.deepEqual(fs.readdirSync(dossier).filter((f) => f.endsWith('.part')), [], 'aucun fichier temporaire laissé');
  assert.ok(JSON.parse(fs.readFileSync(fichier, 'utf8')).n >= 1);
});

/** Un chemin d'exemple pour chaque route d'écriture déclarée par l'aperçu. */
function cheminExemple(motif) {
  if (typeof motif === 'string') return motif;
  return {
    [String(/^\/_pm\/planche\/[a-z0-9-]+\.png$/)]: '/_pm/planche/intro-1.png',
    [String(/^\/_pm\/remarques(\/(envoyer|r-\d{4,}))?$/)]: '/_pm/remarques/envoyer',
  }[String(motif)] || String(motif).replace(/^\/\^|\$\/$/g, '').replace(/\\\//g, '/').replace(/\((\w[\w-]*)\|[^)]*\)/, '$1').replace(/\\/g, '');
}

test('apercu : chaque route d\'écriture refuse une origine étrangère et un envoi text/plain', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47390, dossierStyles: STYLES });
  try {
    assert.ok(TYPES_ECRITURE.length >= 8, 'routes d\'écriture déclarées');
    for (const [motif, types] of TYPES_ECRITURE) {
      const chemin = cheminExemple(motif);
      assert.ok(typeof motif === 'string' ? motif === chemin : motif.test(chemin), `chemin d'exemple de ${motif} : ${chemin}`);
      const base = { methode: 'POST', chemin, corps: '{}', entetes: { 'Content-Type': types[0] } };
      const etrangere = await requete(apercu.port, { ...base, entetes: { ...base.entetes, Origin: 'https://pirate.example' } });
      assert.equal(etrangere.statut, 403, `${chemin} : origine étrangère`);
      const sansOrigine = await requete(apercu.port, base);
      assert.equal(sansOrigine.statut, 403, `${chemin} : sans origine`);
      const texte = await requete(apercu.port, { ...base, entetes: { 'Content-Type': 'text/plain', Origin: `http://127.0.0.1:${apercu.port}` } });
      assert.equal(texte.statut, 415, `${chemin} : text/plain`);
    }
    assert.equal(fs.existsSync(path.join(dir, 'sortie', 'controle-page.json')), false, 'rien d\'écrit');
    // Une route d'écriture que personne n'a déclarée n'existe pas.
    assert.equal((await requete(apercu.port, { methode: 'POST', chemin: '/_pm/inconnue', corps: '{}', entetes: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${apercu.port}` } })).statut, 404);
  } finally { await apercu.fermer(); }
});

test('apercu : fermer retire l\'aperçu de l\'état, sans toucher au reste', async () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, '.pulse-motion', 'etat.json');
  const apercu = await demarrerApercu({ dossier: dir, port: 47395, dossierStyles: STYLES });
  const etat = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  assert.equal(etat.apercu.pid, process.pid);
  etat.accords = { deroule: true };
  fs.writeFileSync(fichier, JSON.stringify(etat));
  await apercu.fermer();
  const apres = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  assert.equal(apres.apercu, undefined);
  assert.deepEqual(apres.accords, { deroule: true });
});

test('apercu : arrêt sur SIGTERM retire l\'aperçu de l\'état', { skip: process.platform === 'win32' && 'Windows ne transmet pas SIGTERM à un processus Node (il est tué sans prévenir) : couvert par le test de fermer' }, async () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, '.pulse-motion', 'etat.json');
  const enfant = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'apercu.js'), dir, '--port', '47398'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let sortie = '';
    enfant.stdout.on('data', (d) => { sortie += d; if (/Aperçu : /.test(sortie)) resolve(); });
    enfant.on('exit', (code) => reject(new Error(`aperçu arrêté trop tôt (${code})`)));
  });
  assert.ok(JSON.parse(fs.readFileSync(fichier, 'utf8')).apercu);
  const code = await new Promise((r) => { enfant.removeAllListeners('exit'); enfant.on('exit', (c, s) => r(c === null ? s : c)); enfant.kill('SIGTERM'); });
  assert.ok(code === 143 || code === 'SIGTERM', `code de sortie ${code}`);
  assert.equal(JSON.parse(fs.readFileSync(fichier, 'utf8')).apercu, undefined);
});
