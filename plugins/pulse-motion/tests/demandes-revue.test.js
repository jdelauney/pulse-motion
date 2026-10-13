'use strict';
/* Revue de la branche « demandes » : aperçu rouvert sans second serveur, voix de l'ordinateur détectée,
 * consignes des skills cohérentes, en-têtes YAML sûrs, smoke tests sans attente fausse. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const ESSAIS = path.join(RACINE, '..', '..', 'docs', 'essais');

test('aperçu déjà actif : « --ouvrir » rouvre son adresse, sans second serveur', async () => {
  const { lancerApercu } = require('../scripts/apercu.js');
  const ouverts = [];
  let demarres = 0;
  const actif = await lancerApercu({ dossier: '.', ouvrir: true, etat: () => ({ apercu: { actif: true, url: 'http://localhost:4321/' } }),
    demarrer: async () => { demarres++; return { url: 'http://localhost:4322/' }; }, ouvrirUrl: (u) => ouverts.push(u) });
  assert.deepEqual(actif, { url: 'http://localhost:4321/', deja: true });
  assert.equal(demarres, 0);
  assert.deepEqual(ouverts, ['http://localhost:4321/']);
  const neuf = await lancerApercu({ dossier: '.', ouvrir: true, etat: () => ({ apercu: null }),
    demarrer: async () => { demarres++; return { url: 'http://localhost:4322/' }; }, ouvrirUrl: (u) => ouverts.push(u) });
  assert.deepEqual(neuf, { url: 'http://localhost:4322/', deja: false });
  assert.equal(demarres, 1);
  assert.deepEqual(ouverts, ['http://localhost:4321/', 'http://localhost:4322/']);
});

test('voix de l\'ordinateur : Windows (nombre de voix), macOS, Linux sans espeak-ng', () => {
  const { voixSysteme } = require('../scripts/outils.js');
  assert.equal(voixSysteme({ plateforme: 'win32', lancer: () => ({ status: 0, stdout: '2\n' }) }).ok, true);
  const aucune = voixSysteme({ plateforme: 'win32', lancer: () => ({ status: 0, stdout: '0\n' }) });
  assert.equal(aucune.ok, false);
  assert.match(aucune.message, /Paramètres/);
  assert.equal(voixSysteme({ plateforme: 'darwin', lancer: () => ({ status: 0, stdout: 'Thomas fr_FR' }) }).ok, true);
  const linux = voixSysteme({ plateforme: 'linux', lancer: () => ({ error: Object.assign(new Error('absent'), { code: 'ENOENT' }) }) });
  assert.equal(linux.ok, false);
  assert.match(linux.message, /sudo apt install espeak-ng/);
});

test('outils : un message pour chaque outil (Python compris), même quand une détection lève', () => {
  const { etatOutils } = require('../scripts/outils.js');
  const e = etatOutils({
    trouverNavigateur: () => { throw new Error('boum'); },
    trouverFfmpeg: () => ({ present: true, versionOk: true, version: 'récente', commande: null, message: 'ffmpeg (version récente) est prêt.' }),
    etatWhisper: () => ({ python: null, venv: false, modele: null, pret: false, message: 'Python introuvable', commandeSysteme: { commande: 'winget …', message: 'Python s\'installe avec winget.' } }),
    pythonAncien: () => null,
    voixSysteme: () => ({ ok: true, message: 'ok' }),
  });
  for (const k of ['navigateur', 'ffmpeg', 'python', 'transcription', 'voixSysteme']) assert.ok(e[k].message, k);
  assert.match(e.navigateur.message, /boum/);
  assert.equal(e.ffmpeg.message, 'ffmpeg (version récente) est prêt.');
});

test('consignes : aperçu ouvert sans condition, musique écoutable sans voix, import sans copie, renvois justes', () => {
  const retoucher = lire('skills', 'retoucher', 'SKILL.md');
  const reprendre = lire('skills', 'reprendre', 'SKILL.md');
  const voix = lire('skills', 'voix', 'SKILL.md');
  for (const [nom, t] of [['retoucher', retoucher], ['reprendre', reprendre], ['voix', voix]]) {
    assert.doesNotMatch(t, /s'il n'est pas actif/, nom);
  }
  // La vérification « aucune scène à dire » ne bloque pas l'écoute de la musique.
  assert.match(voix, /sauf pour écouter la musique/);
  // Import : le chemin donné par la personne, sans copie préalable.
  assert.match(voix, /pulse-motion voix importer "<chemin>"/);
  assert.doesNotMatch(voix, /copier dans `assets\/`/);
  assert.match(retoucher, /\| Voix \|[^\n]*toute la vidéo[^\n]*\/pulse-motion:voix/);
  assert.match(retoucher, /« ajoute une voix à la vidéo »/);
  assert.match(retoucher, /pulse-motion musique ecouter \. --ouvrir/);
  assert.match(lire('skills', 'exporter', 'SKILL.md'), /« j'enregistre la scène 1 »/);
});

test('en-têtes des skills : chaque valeur contenant « : » est entre guillemets (YAML strict)', () => {
  for (const s of fs.readdirSync(path.join(RACINE, 'skills'))) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(lire('skills', s, 'SKILL.md'));
    for (const ligne of m[1].split(/\r?\n/)) {
      const i = ligne.indexOf(':');
      const valeur = ligne.slice(i + 1).trim();
      if (/: /.test(valeur)) assert.match(valeur, /^".*"$/, `${s} : ${ligne.slice(0, 40)}…`);
    }
  }
});

test('smoke tests : pas d\'attente invérifiable ni de skill inadapté', () => {
  const complet = fs.readFileSync(path.join(ESSAIS, 'smoke-test-complet.md'), 'utf8');
  const son = fs.readFileSync(path.join(ESSAIS, 'smoke-test-son.md'), 'utf8');
  assert.doesNotMatch(son, /quelle est la sonie du MP4/);
  assert.doesNotMatch(complet, /\/pulse-motion:retoucher J'ai un enregistrement de toute ma voix/);
  assert.doesNotMatch(complet, /Il propose de recaler les mots des prises existantes/);
  for (const t of [complet, son]) assert.doesNotMatch(t, /(^|\s)pulse-motion (voix|apercu|exporter|whisper|musique|assembler|controler|ffmpeg|outils) /m);
});
