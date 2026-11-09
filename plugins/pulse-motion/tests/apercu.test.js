'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { demarrerApercu, injecterApercu } = require('../scripts/apercu.js');
const { assembler } = require('../scripts/assembler.js');
const { FIXTURES, STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

function obtenir(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { corps += d; });
      res.on('end', () => resolve({ statut: res.statusCode, corps }));
    }).on('error', reject);
  });
}

/** Ouvre le flux d'événements ; attendre(nom) résout au prochain événement de ce nom. */
function ecouterEvenements(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let tampon = '';
      const attentes = [];
      res.setEncoding('utf8');
      res.on('data', (d) => {
        tampon += d;
        let i;
        while ((i = tampon.indexOf('\n\n')) >= 0) {
          const bloc = tampon.slice(0, i);
          tampon = tampon.slice(i + 2);
          const nom = /^event: (.*)$/m.exec(bloc);
          const donnees = /^data: (.*)$/m.exec(bloc);
          if (!nom) continue;
          const k = attentes.findIndex((a) => a.nom === nom[1]);
          if (k >= 0) attentes.splice(k, 1)[0].resolve(JSON.parse(donnees[1]));
        }
      });
      resolve({
        attendre: (nom, ms = 5000) => new Promise((ok, ko) => {
          const minuterie = setTimeout(() => ko(new Error(`événement « ${nom} » non reçu`)), ms);
          attentes.push({ nom, resolve: (v) => { clearTimeout(minuterie); ok(v); } });
        }),
        fermer: () => req.destroy(),
      });
    });
    req.on('error', reject);
  });
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

test('sert la page avec le marqueur d\'aperçu et écrit etat.json', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47210, dossierStyles: STYLES });
  try {
    const { statut, corps } = await obtenir(apercu.url);
    assert.equal(statut, 200);
    assert.match(corps, /window\.__PM_APERCU__ = true; window\.__PM_ERREURS__ = \[\];/);
    assert.match(corps, /<title>La chaîne du froid<\/title>/);
    assert.equal((await obtenir(apercu.url + 'rien')).statut, 404);
    const etat = JSON.parse(fs.readFileSync(path.join(dir, '.pulse-motion', 'etat.json'), 'utf8'));
    assert.deepEqual(etat.apercu, { port: apercu.port, url: apercu.url, pid: process.pid });
  } finally { await apercu.fermer(); }
});

test('requête avec un autre nom d\'hôte (DNS rebinding) : refusée', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47290, dossierStyles: STYLES });
  const requete = (hote, methode = 'GET', chemin = '/') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: apercu.port, path: chemin, method: methode, headers: { Host: hote, 'Content-Type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(methode === 'POST' ? '{"debordements":[]}' : undefined);
  });
  try {
    assert.equal(await requete('pirate.example:47290'), 403);
    assert.equal(await requete('pirate.example', 'POST', '/_pm/controle'), 403);
    assert.equal(fs.existsSync(path.join(dir, 'sortie', 'controle-page.json')), false);
    assert.equal(await requete(`127.0.0.1:${apercu.port}`), 200);
    assert.equal(await requete(`localhost:${apercu.port}`), 200);
  } finally { await apercu.fermer(); }
});

/** Un port libre au moment de l'appel (choisi par le système, donc hors des plages qu'il réserve). */
async function portLibre() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

test('port déjà pris : le suivant est utilisé', async () => {
  // Le port occupé est choisi par le système : un port fixe peut tomber dans une plage réservée (Windows, Hyper-V).
  const occupant = net.createServer();
  await new Promise((r) => occupant.listen(0, '127.0.0.1', r));
  const pris = occupant.address().port;
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: pris, dossierStyles: STYLES });
  try {
    assert.ok(apercu.port > pris && apercu.port < pris + 20, `port ${apercu.port}`);
    assert.equal(apercu.url, `http://127.0.0.1:${apercu.port}/`);
  } finally {
    await apercu.fermer();
    await new Promise((r) => occupant.close(r));
  }
});

/** Remplace l'écoute des serveurs HTTP : refuser(port) -> code d'erreur à simuler, ou null pour écouter vraiment. */
function simulerRefus(refuser) {
  const listen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (port, ...reste) {
    const code = refuser(port);
    if (!code) return listen.call(this, port, ...reste);
    process.nextTick(() => this.emit('error', Object.assign(new Error(`listen ${code} 127.0.0.1:${port}`), { code })));
    return this;
  };
  return () => { http.Server.prototype.listen = listen; };
}

test('port réservé par le système (EACCES, plages exclues de Windows) : le suivant est utilisé', async () => {
  const depart = await portLibre();
  const retablir = simulerRefus((p) => (p === depart || p === depart + 1 ? 'EACCES' : null));
  const dir = copierProjet('projet-simple');
  let apercu;
  try {
    apercu = await demarrerApercu({ dossier: dir, port: depart, dossierStyles: STYLES });
  } finally { retablir(); }
  try {
    assert.ok(apercu.port >= depart + 2 && apercu.port < depart + 20, `port ${apercu.port}`);
    const etat = JSON.parse(fs.readFileSync(path.join(dir, '.pulse-motion', 'etat.json'), 'utf8'));
    assert.equal(etat.apercu.port, apercu.port);
  } finally { await apercu.fermer(); }
});

/** Lance demarrerApercu dans un processus à part dont l'écoute renvoie toujours `code` ; le processus doit se terminer seul. */
function demarrerSansPort(code) {
  const { spawnSync } = require('node:child_process');
  const dir = copierProjet('projet-simple');
  const script = `
    const http = require('node:http');
    http.Server.prototype.listen = function (port) { process.nextTick(() => this.emit('error', Object.assign(new Error('refus'), { code: ${JSON.stringify(code)} }))); return this; };
    require(${JSON.stringify(path.join(__dirname, '..', 'scripts', 'apercu.js'))})
      .demarrerApercu({ dossier: ${JSON.stringify(dir)}, port: 4321, dossierStyles: ${JSON.stringify(STYLES)} })
      .then(() => console.log('démarré'), (e) => console.log(e.message));`;
  // Sans process.exit : le processus ne se termine que si rien n'est resté ouvert (minuterie, serveur, surveillance).
  return spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 20000 });
}

test('tous les ports réservés : message clair, et rien ne reste ouvert (le processus se termine)', () => {
  const r = demarrerSansPort('EACCES');
  assert.equal(r.error, undefined, "le processus ne s'est pas terminé seul");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Aucun port libre entre 4321 et 4340\./);
});

test("autre erreur d'écoute : arrêt aussitôt, message clair, rien ne reste ouvert", () => {
  const r = demarrerSansPort('EPERM');
  assert.equal(r.error, undefined, "le processus ne s'est pas terminé seul");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /L'aperçu n'a pas pu démarrer : l'ordinateur refuse le port 4321 \(EPERM\)\./);
});

test('une modification recharge la page ; un déroulé cassé envoie une erreur', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47230, dossierStyles: STYLES, delai: 50 });
  const flux = await ecouterEvenements(apercu.url + '_pm/evenements');
  try {
    await attendre(200);
    const recharge = flux.attendre('recharger');
    modifierDeroule(dir, (d) => { d.titre = 'Nouveau titre'; });
    await recharge;
    assert.match((await obtenir(apercu.url)).corps, /<title>Nouveau titre<\/title>/);

    const erreur = flux.attendre('erreur');
    fs.writeFileSync(path.join(dir, 'deroule.json'), '{ cassé');
    assert.match((await erreur).message, /n'est pas un JSON valide/);
    assert.match((await obtenir(apercu.url)).corps, /<title>Nouveau titre<\/title>/, 'la dernière page valide reste servie');

    const retour = flux.attendre('recharger');
    fs.writeFileSync(path.join(dir, 'deroule.json'), fs.readFileSync(path.join(FIXTURES, 'projet-simple', 'deroule.json')));
    await retour;
    assert.match((await obtenir(apercu.url)).corps, /<title>La chaîne du froid<\/title>/, 'rétabli après correction');
  } finally {
    flux.fermer();
    await apercu.fermer();
  }
});

test('une erreur inattendue pendant le réassemblage n\'arrête pas l\'aperçu', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47270, dossierStyles: STYLES, delai: 50 });
  const flux = await ecouterEvenements(apercu.url + '_pm/evenements');
  try {
    await attendre(200);
    const erreur = flux.attendre('erreur');
    // Le dossier de scènes devient illisible : lecture impossible (EISDIR).
    fs.rmSync(path.join(dir, 'scenes', '02-chiffre.html'));
    fs.mkdirSync(path.join(dir, 'scenes', '02-chiffre.html'));
    const recu = await Promise.race([erreur, flux.attendre('recharger')]);
    assert.ok(recu);
    assert.equal((await obtenir(apercu.url)).statut, 200, 'le serveur répond encore');
  } finally {
    flux.fermer();
    await apercu.fermer();
  }
});

function envoyer(url, corps, type = 'application/json') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': type, Origin: new URL(url).origin } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(corps);
  });
}

test('rapport de débordement : écrit dans sortie/, refusé s\'il n\'est pas du JSON, effacé au réassemblage', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47280, dossierStyles: STYLES, delai: 50 });
  const flux = await ecouterEvenements(apercu.url + '_pm/evenements');
  const rapport = path.join(dir, 'sortie', 'controle-page.json');
  try {
    const d = [{ scene: 'intro', element: 'titre', message: 'Scène « intro » : le texte « titre » déborde de son cadre (vers 1 s).' }];
    assert.equal(await envoyer(apercu.url + '_pm/controle', JSON.stringify({ debordements: d })), 204);
    assert.deepEqual(JSON.parse(fs.readFileSync(rapport, 'utf8')), { debordements: d });
    assert.equal(await envoyer(apercu.url + '_pm/controle', 'debordements=1', 'text/plain'), 415);
    assert.equal(await envoyer(apercu.url + '_pm/controle', '{"debordements": 3}'), 400);

    await attendre(200);
    const recharge = flux.attendre('recharger');
    modifierDeroule(dir, (x) => { x.titre = 'Autre'; });
    await recharge;
    assert.equal(fs.existsSync(rapport), false);
  } finally {
    flux.fermer();
    await apercu.fermer();
  }
});

test('les écritures dans sortie/ ne déclenchent pas de rechargement', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47240, dossierStyles: STYLES, delai: 50 });
  const flux = await ecouterEvenements(apercu.url + '_pm/evenements');
  try {
    await attendre(200);
    const recharge = flux.attendre('recharger', 600);
    fs.writeFileSync(path.join(dir, 'sortie', 'autre.txt'), 'x');
    await assert.rejects(recharge, /non reçu/);
  } finally {
    flux.fermer();
    await apercu.fermer();
  }
});

test('projet invalide dès le départ : page d\'erreur lisible', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.genre = 'tuto'; });
  const apercu = await demarrerApercu({ dossier: dir, port: 47250, dossierStyles: STYLES });
  try {
    const { corps } = await obtenir(apercu.url);
    assert.match(corps, /La vidéo n'a pas pu être assemblée/);
    assert.match(corps, /« genre » doit être l'un de/);
  } finally { await apercu.fermer(); }
});

const navigateur = trouverNavigateur();
test("dans le navigateur, la page d'aperçu affiche les erreurs d'assemblage", { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  // Sous file://, le flux d'événements échoue tout de suite : Chrome peut rendre la page.
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].textes = { titre: 'T' }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  const fichier = path.join(dir, 'sortie', 'apercu.html');
  fs.writeFileSync(fichier, injecterApercu(r.html, r.erreurs));
  const dom = await rendreDOM(navigateur, fichier);
  assert.match(dom, /<div id="pm-bandeau">[^<]*data-texte="sous" n'a pas de texte/);
});
