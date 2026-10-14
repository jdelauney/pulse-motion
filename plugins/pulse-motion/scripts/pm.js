#!/usr/bin/env node
'use strict';
/* Pulse Motion – point d'entrée unique des skills (bin/pulse-motion).
 *
 *   pulse-motion etat <dossier> [--accord deroule|style|video] [--parcours rapide|accompagne]
 *   pulse-motion assembler <dossier>
 *   pulse-motion controler <dossier> [--sans-correction] [--sans-rendu] [--gpu]   contrôle ; corrige seul les cas sûrs
 *   pulse-motion apercu <dossier> [--port 4321] [--ouvrir]
 *   pulse-motion atelier [<recette>] [--dossier <d>]   atelier des effets de particules (page de l'aperçu) : régler, enregistrer
 *   pulse-motion historique sauvegarder|annuler <dossier>
 *   pulse-motion exporter <dossier> [--qualite 1080p|720p] [--ips 30|60] [--rapide] [--avec-provisoire]   MP4 fidèle (ffmpeg) ou dans le navigateur
 *   pulse-motion ffmpeg                  ffmpeg présent ? commande pour l'installer
 *   pulse-motion voix importer <fichier> [--scene <id>] [dossier] | provisoire [--scene <id>] [dossier] | transcrire [--scene <id>] [dossier] | studio <scène> [dossier]   voix d'une scène, voix provisoire, transcription, studio
 *   pulse-motion musique ecouter [dossier] [--ouvrir]   musique seule dans sortie/musique.wav (pour l'écouter)
 *   pulse-motion whisper [installer [--modele small]]   transcription des voix (Python, faster-whisper) : état ou installation
 *   pulse-motion outils                  état de l'ordinateur : Node, Chrome ou Edge, ffmpeg, Python, transcription, voix du système
 *   pulse-motion planche <dossier> [id1,id2] [--ouvrir]   images clés PNG dans sortie/planche/
 *   pulse-motion reference <nom>          affiche references/<nom>.md (ex. moteur, rythme, styles/clair-pedagogique)
 *   pulse-motion scene <style> <nom>      affiche une scène toute faite d'un style
 *   pulse-motion effet <nom>              affiche la recette d'un effet de particules de la bibliothèque
 *   pulse-motion styles [--genre <genre>] liste les styles (JSON), classée pour le genre
 *   pulse-motion styles verifier <nom>    vérifie le contrat d'un style
 *   pulse-motion changer-style <dossier> <style>   recopie les scènes toutes faites du nouveau style
 *   pulse-motion comparer <dossier> <s1,s2,s3> [--scenes a,b] [--ouvrir]   comparaison des styles sur le déroulé
 *   pulse-motion charte enregistrer <nom> <dossier> | liste | appliquer <nom> <dossier> | depuis-logo <fichier> [--style s] [--ton clair|sombre]
 *   pulse-motion police "<famille>" [--graisses 400,700] [--italique] | <fichier> [--famille "<nom>"] [--confirmer] [--style <style> --role titres|texte]   police de la charte (Bunny Fonts ou fichier)
 *   pulse-motion style nouveau <nom> [--depuis <style>] | verifier <nom> | planche <nom> [--scenes a,b] [--ratio r] [--ton t] [--textes exemple|maximum] [--ouvrir]   style personnel
 *   pulse-motion glossaire <dossier> | glossaire noter <dossier> "<terme>" "<sens>" ["<à éviter>"]   mots du métier (charte/glossaire.md)
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
  atelier: 'atelier.js',
  historique: 'historique.js',
  exporter: 'exporter.js',
  styles: 'styles.js',
  'changer-style': 'changer-style.js',
  comparer: 'comparer.js',
  charte: 'charte.js',
  police: 'polices.js',
  style: 'style-perso.js',
  ffmpeg: 'ffmpeg.js',
  voix: 'voix.js',
  whisper: 'whisper.js',
  outils: 'outils.js',
  musique: 'musique.js',
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
  if (commande === 'glossaire') {
    return spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'vocabulaire.js'), 'glossaire', ...reste], { stdio: 'inherit' }).status ?? 1;
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
    const fichier = path.join(RACINE, 'references', `${nom}.md`);
    const m = /^styles\/([a-z0-9-]+)$/.exec(nom);
    if (m && !fs.existsSync(fichier)) {
      // Guide d'un style personnel : rangé avec le style (guide.md).
      const st = trouverStyle(m[1]);
      if (st && st.personnel) return afficherFichier(path.join(st.dossier, 'guide.md'), `Guide du style « ${m[1]} »`);
    }
    return afficherFichier(fichier, `Référence « ${nom} »`);
  }
  if (commande === 'scene') {
    const [style, nom] = reste;
    if (!/^[a-z0-9-]+$/.test(style || '') || !/^[a-z0-9-]+$/.test(nom || '')) { console.error('Usage : pulse-motion scene <style> <nom>'); return 2; }
    const st = trouverStyle(style);
    if (!st) { console.error(messageStyleInconnu(style)); return 1; }
    return afficherFichier(path.join(st.dossier, 'scenes', `${nom}.html`), `Scène « ${nom} » du style « ${style} »`);
  }
  if (commande === 'effet') {
    const nom = reste[0] || '';
    if (!/^[a-z0-9-]+$/.test(nom)) { console.error('Usage : pulse-motion effet <nom> (ex. etincelles, confettis)'); return 2; }
    return afficherFichier(path.join(RACINE, 'effets', `${nom}.json`), `Effet « ${nom} »`);
  }
  if (commande === 'consignes') {
    const nom = reste[0] || '';
    if (!/^[a-z0-9-]+$/.test(nom)) { console.error('Usage : pulse-motion consignes <skill> (ex. creer)'); return 2; }
    return afficherFichier(path.join(RACINE, 'skills', nom, 'SKILL.md'), `Consignes « ${nom} »`);
  }
  console.error([
    'Usage : pulse-motion <commande> …',
    '  etat <dossier> [--accord deroule|style|video] [--parcours rapide|accompagne]',
    '  assembler <dossier>      controler <dossier> [--sans-correction] [--sans-rendu] [--gpu]      apercu <dossier> [--port N] [--ouvrir]',
    '  historique sauvegarder|annuler <dossier>',
    '  atelier [<recette>] [--dossier <dossier>]   atelier des effets de particules : régler à l\'œil, enregistrer dans effets/',
    '  exporter <dossier> [--qualite 1080p|720p] [--ips 30|60] [--rapide] [--avec-provisoire]       planche <dossier> [id1,id2]',
    '  ffmpeg                   ffmpeg présent ? commande pour l\'installer',
    '  voix importer <fichier> [--scene <id>] [dossier] | provisoire [--scene <id>] [dossier] | transcrire [--scene <id>] [dossier] | studio <scène> [dossier]',
    '  whisper [installer [--modele small]]   transcription des voix',
    '  outils                   état de l\'ordinateur (ce qui est prêt, ce qui manque)',
    '  musique ecouter [dossier]   musique seule dans sortie/musique.wav',
    '  reference <nom>          scene <style> <nom>      effet <nom>      consignes <skill>',
    '  styles [--genre <genre>]                         styles verifier <nom>',
    '  changer-style <dossier> <style>                  comparer <dossier> <s1,s2,s3> [--scenes a,b] [--ouvrir]',
    '  charte enregistrer <nom> <dossier> | liste | appliquer <nom> <dossier> | depuis-logo <fichier> [--style s] [--ton clair|sombre]',
    '  police "<famille>" [--graisses 400,700] [--italique] | <fichier> [--famille "<nom>"] [--confirmer] [--style <style> --role titres|texte] [--dans <dossier>]',
    '  style nouveau <nom> [--depuis <style>] | verifier <nom> | planche <nom> [--scenes a,b] [--ratio r] [--ton t] [--textes exemple|maximum] [--ouvrir]',
    '  glossaire <dossier> | glossaire noter <dossier> "<terme>" "<sens>" ["<à éviter>"] ["<prononciation>"]',
    '  lexique [noter "<terme>" "<phrase>" "<comme…>" "<commande>"]',
  ].join('\n'));
  return 2;
}

if (require.main === module) process.exit(lancer(process.argv.slice(2)));

module.exports = { lancer };
