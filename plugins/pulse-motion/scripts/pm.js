#!/usr/bin/env node
'use strict';
/* Pulse Motion – point d'entrée unique des skills (bin/pulse-motion).
 *
 *   pulse-motion etat <dossier> [--accord deroule|style|video] [--parcours rapide|accompagne]
 *   pulse-motion assembler <dossier>
 *   pulse-motion controler <dossier>
 *   pulse-motion apercu <dossier> [--port 4321] [--ouvrir]
 *   pulse-motion historique sauvegarder|annuler <dossier>
 *   pulse-motion reference <nom>          affiche references/<nom>.md (ex. moteur, rythme, styles/clair-pedagogique)
 *   pulse-motion scene <style> <nom>      affiche une scène toute faite d'un style
 *   pulse-motion styles                   liste les styles et leur catalogue (JSON)
 *   pulse-motion consignes <skill>        affiche les consignes d'un skill (ex. creer)
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RACINE = path.resolve(__dirname, '..');
const NOM_SUR = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/;

const SCRIPTS = {
  etat: 'etat.js',
  assembler: 'assembler.js',
  controler: 'controler.js',
  apercu: 'apercu.js',
  historique: 'historique.js',
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
  if (commande === 'reference') {
    const nom = reste[0] || '';
    if (!NOM_SUR.test(nom)) { console.error('Usage : pulse-motion reference <nom> (ex. moteur, rythme, styles/clair-pedagogique)'); return 2; }
    return afficherFichier(path.join(RACINE, 'references', `${nom}.md`), `Référence « ${nom} »`);
  }
  if (commande === 'scene') {
    const [style, nom] = reste;
    if (!NOM_SUR.test(style || '') || !NOM_SUR.test(nom || '') || nom.includes('/')) { console.error('Usage : pulse-motion scene <style> <nom>'); return 2; }
    return afficherFichier(path.join(RACINE, 'styles', style, 'scenes', `${nom}.html`), `Scène « ${nom} » du style « ${style} »`);
  }
  if (commande === 'consignes') {
    const nom = reste[0] || '';
    if (!/^[a-z0-9-]+$/.test(nom)) { console.error('Usage : pulse-motion consignes <skill> (ex. creer)'); return 2; }
    return afficherFichier(path.join(RACINE, 'skills', nom, 'SKILL.md'), `Consignes « ${nom} »`);
  }
  if (commande === 'styles') {
    const dossier = path.join(RACINE, 'styles');
    const styles = fs.readdirSync(dossier).filter((n) => fs.existsSync(path.join(dossier, n, 'catalogue.json')))
      .map((n) => JSON.parse(fs.readFileSync(path.join(dossier, n, 'catalogue.json'), 'utf8')));
    console.log(JSON.stringify(styles, null, 2));
    return 0;
  }
  console.error([
    'Usage : pulse-motion <commande> …',
    '  etat <dossier> [--accord deroule|style|video] [--parcours rapide|accompagne]',
    '  assembler <dossier>      controler <dossier>      apercu <dossier> [--port N] [--ouvrir]',
    '  historique sauvegarder|annuler <dossier>',
    '  reference <nom>          scene <style> <nom>      styles      consignes <skill>',
  ].join('\n'));
  return 2;
}

if (require.main === module) process.exit(lancer(process.argv.slice(2)));

module.exports = { lancer };
