#!/usr/bin/env node
'use strict';
/* Pulse Motion – vocabulaire : le lexique (mots de l'outil expliqués à la personne, notés une fois).
 *
 *   node scripts/vocabulaire.js lexique                                                    affiche le lexique
 *   node scripts/vocabulaire.js lexique noter "<terme>" "<phrase>" "<comme…>" "<commande>"   ajoute un mot
 *
 * Le lexique vit dans ~/.pulse-motion/lexique.md (ou $PULSE_MOTION_DOSSIER/lexique.md), créé depuis
 * modeles/lexique.md au premier ajout. Une ligne par terme, triée, sans doublon (casse et accents ignorés).
 */
const fs = require('node:fs');
const path = require('node:path');
const { dossierPersonnel } = require('./lib/personnel.js');

const MODELE = path.join(__dirname, '..', 'modeles', 'lexique.md');
const EN_TETE = '| Terme | En une phrase | Comme… | Vu le | Statut |';
const SEPARATEUR = '|---|---|---|---|---|';
const EST_EN_TETE = /^\|\s*Terme\s*\|/;

const cheminLexique = () => path.join(dossierPersonnel(), 'lexique.md');
const cellule = (t) => String(t ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim();
const cleTri = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function lireTableau(lignes) {
  const i = lignes.findIndex((l) => EST_EN_TETE.test(l));
  if (i < 0) return { debut: -1, fin: -1, termes: [] };
  const termes = [];
  let j = i + 2;
  for (; j < lignes.length && lignes[j].startsWith('|'); j++) {
    const [terme = '', phrase = '', comme = '', vuLe = '', statut = ''] = lignes[j].split('|').slice(1, -1).map((c) => c.trim());
    termes.push({ terme, phrase, comme, vuLe, statut });
  }
  return { debut: i, fin: j, termes };
}

function lireLexique() {
  const fichier = cheminLexique();
  const texte = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : fs.readFileSync(MODELE, 'utf8');
  return { fichier, texte, termes: lireTableau(texte.split(/\r?\n/)).termes };
}

function noterLexique({ terme, phrase, comme = '', commande = '', date = new Date().toISOString().slice(0, 10) }) {
  if (!terme || !String(terme).trim() || !phrase || !String(phrase).trim()) {
    throw new Error('Il faut au moins un terme et une phrase d\'explication.');
  }
  const { fichier, texte } = lireLexique();
  let lignes = texte.split(/\r?\n/);
  let tableau = lireTableau(lignes);
  if (tableau.debut < 0) {
    while (lignes.length && lignes[lignes.length - 1].trim() === '') lignes.pop();
    lignes = [...lignes, '', EN_TETE, SEPARATEUR, ''];
    tableau = lireTableau(lignes);
  }
  if (tableau.termes.some((t) => cleTri(t.terme) === cleTri(terme))) return { ajoute: false, fichier };
  const nouveau = { terme: cellule(terme), phrase: cellule(phrase), comme: cellule(comme), vuLe: cellule(commande ? `${date} · ${commande}` : date), statut: 'vu' };
  const tous = [...tableau.termes, nouveau].sort((a, b) => cleTri(a.terme).localeCompare(cleTri(b.terme), 'fr'));
  const rangees = tous.map((t) => `| ${t.terme} | ${t.phrase} | ${t.comme} | ${t.vuLe} | ${t.statut} |`);
  const resultat = [...lignes.slice(0, tableau.debut + 2), ...rangees, ...lignes.slice(tableau.fin)].join('\n');
  try {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    const temporaire = `${fichier}.${process.pid}.tmp`;
    fs.writeFileSync(temporaire, resultat);
    fs.renameSync(temporaire, fichier);
  } catch (e) {
    throw new Error(`Impossible d'écrire le lexique « ${fichier} » (${e.code || e.message}) : vérifiez les droits de ce dossier, ou indiquez un autre dossier avec la variable PULSE_MOTION_DOSSIER.`);
  }
  return { ajoute: true, fichier };
}

if (require.main === module) {
  const [quoi, action, ...args] = process.argv.slice(2);
  try {
    if (quoi === 'lexique' && !action) {
      process.stdout.write(lireLexique().texte);
      process.exit(0);
    }
    if (quoi === 'lexique' && action === 'noter') {
      console.log(JSON.stringify(noterLexique({ terme: args[0], phrase: args[1], comme: args[2], commande: args[3] }), null, 2));
      process.exit(0);
    }
    console.error('Usage : pulse-motion lexique [noter "<terme>" "<phrase>" "<comme…>" "<commande>"]');
    process.exit(2);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { cheminLexique, lireLexique, noterLexique };
