'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { demarrerApercu } = require('../scripts/apercu.js');
const W = require('../moteur/wav.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

function requete(url, { methode = 'GET', type, corps } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: methode, headers: type ? { 'Content-Type': type } : {} }, (res) => {
      const morceaux = [];
      res.on('data', (d) => morceaux.push(d));
      res.on('end', () => {
        const texte = Buffer.concat(morceaux).toString('utf8');
        let json = null;
        try { json = JSON.parse(texte); } catch { /* pas du JSON */ }
        resolve({ statut: res.statusCode, texte, json });
      });
    });
    req.on('error', reject);
    req.end(corps);
  });
}
function prise(secondes = 1.5) {
  const taux = 48000;
  const x = new Float32Array(Math.round((secondes + 0.6) * taux));
  for (let i = 0.3 * taux; i < (secondes + 0.3) * taux; i++) x[i] = 0.3 * Math.sin(i / 5);
  return Buffer.from(W.ecrire({ taux, canaux: [x] }));
}
async function avecApercu(port, options, fn) {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi le froid' }; });
  const apercu = await demarrerApercu({ dossier: dir, port, dossierStyles: STYLES, ...options });
  try { await fn(dir, apercu.url); } finally { await apercu.fermer(); }
}
const lireDeroule = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));

test('liste des scènes à dire, studio servi, page d\'aperçu qui charge le studio', async () => {
  await avecApercu(47341, {}, async (dir, url) => {
    const r = await requete(`${url}_pm/voix/scenes`);
    assert.deepEqual(r.json, [{ id: 'intro', texte: 'Pourquoi le froid', etat: 'aucune', calage: null }]);
    assert.match((await requete(`${url}_pm/studio.mjs`)).texte, /studio/i);
    assert.match((await requete(url)).texte, /<script type="module" src="\/_pm\/studio\.mjs"><\/script>/);
  });
});

test('prise gardée : écrite, déroulé mis à jour, copie d\'historique, liste à jour', async () => {
  await avecApercu(47342, { whisper: { pret: false } }, async (dir, url) => {
    const r = await requete(`${url}_pm/voix?scene=intro`, { methode: 'POST', type: 'audio/wav', corps: prise() });
    assert.equal(r.statut, 200, r.texte);
    assert.equal(r.json.fichier, 'assets/voix/intro.wav');
    assert.equal(lireDeroule(dir).scenes[0].voix.fichier, 'assets/voix/intro.wav');
    assert.ok(fs.existsSync(path.join(dir, '.historique', '001')));
    const liste = await requete(`${url}_pm/voix/scenes`);
    assert.equal(liste.json[0].etat, 'enregistree');
  });
});

test('transcription en tâche de fond : réponse immédiate, mots transcrits ensuite', async () => {
  let liberer;
  const attente = new Promise((r) => { liberer = r; });
  const whisper = { pret: true, transcrire: async () => { await attente; return { ok: true, mots: [{ w: 'Pourquoi', t0: 0.05, t1: 0.4 }, { w: 'le', t0: 0.5, t1: 0.7 }, { w: 'froid', t0: 0.8, t1: 1.4 }] }; } };
  await avecApercu(47343, { whisper }, async (dir, url) => {
    const r = await requete(`${url}_pm/voix?scene=intro`, { methode: 'POST', type: 'audio/wav', corps: prise() });
    assert.equal(r.json.transcription, 'en-cours');
    liberer();
    const mots = path.join(dir, 'assets', 'voix', 'intro.mots.json');
    for (let i = 0; i < 50 && JSON.parse(fs.readFileSync(mots, 'utf8')).approche !== 'whisper'; i++) await new Promise((s) => setTimeout(s, 100));
    assert.equal(JSON.parse(fs.readFileSync(mots, 'utf8')).approche, 'whisper');
  });
});

test('revue : refus : mauvais type, scène inconnue, scène sans texte, prise illisible ou vide, trop lourde', async () => {
  await avecApercu(47344, { whisper: { pret: false }, maxPrise: 400000 }, async (dir, url) => {
    const envoyer = (scene, corps, type = 'audio/wav') => requete(`${url}_pm/voix?scene=${scene}`, { methode: 'POST', type, corps });
    assert.equal((await envoyer('intro', prise(), 'text/plain')).statut, 415);
    assert.equal((await envoyer('rien', prise())).statut, 404);
    assert.equal((await envoyer('chiffre', prise())).statut, 422);
    assert.equal((await envoyer('intro', Buffer.from('pas du son'))).statut, 422);
    const vide = await envoyer('intro', Buffer.from(W.ecrire({ taux: 48000, canaux: [new Float32Array(48000)] })));
    assert.equal(vide.statut, 422);
    assert.match(vide.json.message, /aucun son/);
    assert.equal((await envoyer('intro', prise(5))).statut, 413);
    assert.equal(fs.existsSync(path.join(dir, 'assets', 'voix', 'intro.wav')), false);
  });
});

test('revue : deux prises envoyées coup sur coup : la seconde est refusée (409), la première écrite', async () => {
  await avecApercu(47345, { whisper: { pret: false } }, async (dir, url) => {
    const [a, b] = await Promise.all([
      requete(`${url}_pm/voix?scene=intro`, { methode: 'POST', type: 'audio/wav', corps: prise(3) }),
      requete(`${url}_pm/voix?scene=intro`, { methode: 'POST', type: 'audio/wav', corps: prise(3) }),
    ]);
    assert.deepEqual([a.statut, b.statut].sort(), [200, 409]);
    assert.ok(fs.existsSync(path.join(dir, 'assets', 'voix', 'intro.wav')));
  });
});

test('revue : texte retiré du déroulé avant « Garder » : refus clair', async () => {
  await avecApercu(47346, { whisper: { pret: false } }, async (dir, url) => {
    modifierDeroule(dir, (d) => { delete d.scenes[0].voix; });
    const r = await requete(`${url}_pm/voix?scene=intro`, { methode: 'POST', type: 'audio/wav', corps: prise() });
    assert.equal(r.statut, 422);
    assert.match(r.json.message, /n'a pas de texte de voix/);
  });
});
