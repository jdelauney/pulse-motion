#!/usr/bin/env node
'use strict';
/* Pulse Motion – point d'entrée unique des skills (bin/pulse-motion).
 *
 *   pulse-motion etat <dossier> [--accord deroule|style|video] [--parcours rapide|accompagne]
 *   pulse-motion assembler <dossier>
 *   pulse-motion controler <dossier>
 *   pulse-motion apercu <dossier> [--port 4321] [--ouvrir]
 *   pulse-motion historique sauvegarder|annuler <dossier>
 *   pulse-motion exporter <dossier>       MP4 relu dans sortie/ (Chrome ou Edge sans fenêtre)
 *   pulse-motion planche <dossier> [id1,id2] [--ouvrir]   images clés PNG dans sortie/planche/
 *   pulse-motion reference <nom>          affiche references/<nom>.md (ex. moteur, rythme, styles/clair-pedagogique)
 *   pulse-motion scene <style> <nom>      affiche une scène toute faite d'un style
 *   pulse-motion styles [--genre <genre>] liste les styles (JSON), classée pour le genre
 *   pulse-motion styles verifier <nom>    vérifie le contrat d'un style
 *   pulse-motion changer-style <dossier> <style>   recopie les scènes toutes faites du nouveau style
 *   pulse-motion comparer <dossier> <s1,s2,s3> [--scenes a,b] [--ouvrir]   comparaison des styles sur le déroulé
 *   pulse-motion lexique [noter "<terme>" "<phrase>" "<comme…>" "<commande>"]   mots de l'outil expliqués à la personne
 *   pulse-motion consignes <skill>        affiche les consignes d'un skill (ex. creer)
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { trouverStyle, messageStyleInconnu } = require('./styles.js');

const RACINE = path.resolve(__dirname, '..');
const NOM_SUR = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/;

const SCRIPTS = {
  etat: 'etat.js',
  assembler: 'assembler.js',
  controler: 'controler.js',
  apercu: 'apercu.js',
  historique: 'historique.js',
  exporter: 'exporter.js',
  styles: 'styles.js',
  'changer-style': 'changer-style.js',
  comparer: 'comparer.js',
};

function afficherFichier(fichier, quoi) {
  if (!fs.existsSync(fichier)) {
    console.error(`${quoi} introuvable.`);
    return 1;
  }
  process.stdout.write(fs.readFileSync(fichier, 'utf8'));
  return 0;
}

function lancer(args) {
  const [commande, ...reste] = args;
  if (SCRIPTS[commande]) {
    const r = spawnSync(process.execPath, [path.join(RACINE, 'scripts', SCRIPTS[commande]), ...reste], { stdio: 'inherit' });
    return r.status ?? 1;
  }
  if (commande === 'lexique') {
    return spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'vocabulaire.js'), 'lexique', ...reste], { stdio: 'inherit' }).status ?? 1;
  }
  if (commande === 'planche') {
    const [dossier = '.', ...options] = reste;
    const ids = options.filter((o) => !o.startsWith('--'));
    const drapeaux = options.filter((o) => o.startsWith('--'));
    const args = [path.join(RACINE, 'scripts', 'exporter.js'), dossier, '--planche', ...ids.slice(0, 1), ...drapeaux];
    return spawnSync(process.execPath, args, { stdio: 'inherit' }).status ?? 1;
  }
  if (commande === 'reference') {
    const nom = reste[0] || '';
    if (!NOM_SUR.test(nom)) { console.error('Usage : pulse-motion reference <nom> (ex. moteur, rythme, styles/clair-pedagogique)'); return 2; }
    return afficherFichier(path.join(RACINE, 'references', `${nom}.md`), `Référence « ${nom} »`);
  }
  if (commande === 'scene') {
    const [style, nom] = reste;
    if (!/^[a-z0-9-]+$/.test(style || '') || !/^[a-z0-9-]+$/.test(nom || '')) { console.error('Usage : pulse-motion scene <style> <nom>'); return 2; }
    const st = trouverStyle(style);
    if (!st) { console.error(messageStyleInconnu(style)); return 1; }
    return afficherFichier(path.join(st.dossier, 'scenes', `${nom}.html`), `Scène « ${nom} » du style « ${style} »`);
  }
  if (commande === 'consignes') {
    const nom = reste[0] || '';
    if (!/^[a-z0-9-]+$/.test(nom)) { console.error('Usage : pulse-motion consignes <skill> (ex. creer)'); return 2; }
    return afficherFichier(path.join(RACINE, 'skills', nom, 'SKILL.md'), `Consignes « ${nom} »`);
  }
  console.error([
    'Usage : pulse-motion <commande> …',
    '  etat <dossier> [--accord deroule|style|video] [--parcours rapide|accompagne]',
    '  assembler <dossier>      controler <dossier>      apercu <dossier> [--port N] [--ouvrir]',
    '  historique sauvegarder|annuler <dossier>',
    '  exporter <dossier>       planche <dossier> [id1,id2]',
    '  reference <nom>          scene <style> <nom>      consignes <skill>',
    '  styles [--genre <genre>]                         styles verifier <nom>',
    '  changer-style <dossier> <style>                  comparer <dossier> <s1,s2,s3> [--scenes a,b] [--ouvrir]',
    '  lexique [noter "<terme>" "<phrase>" "<comme…>" "<commande>"]',
  ].join('\n'));
  return 2;
}

if (require.main === module) process.exit(lancer(process.argv.slice(2)));

module.exports = { lancer };
