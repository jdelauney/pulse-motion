#!/usr/bin/env node
'use strict';
/* Pulse Motion – vocabulaire : le lexique (mots de l'outil expliqués à la personne, notés une fois)
 * et le glossaire (mots du métier de la personne, rangés avec la charte).
 *
 *   node scripts/vocabulaire.js lexique                                                    affiche le lexique
 *   node scripts/vocabulaire.js lexique noter "<terme>" "<phrase>" "<comme…>" "<commande>"   ajoute un mot
 *   node scripts/vocabulaire.js glossaire <dossier>                                        affiche le glossaire
 *   node scripts/vocabulaire.js glossaire noter <dossier> "<terme>" "<sens>" ["<à éviter>"] ["<prononciation>"]
 *
 * Le lexique vit dans ~/.pulse-motion/lexique.md (ou $PULSE_MOTION_DOSSIER/lexique.md) ; le glossaire dans
 * charte/glossaire.md du projet. Créés depuis modeles/ au premier ajout. Une ligne par terme, triée,
 * sans doublon (casse et accents ignorés).
 */
const fs = require('node:fs');
const path = require('node:path');
const { dossierPersonnel } = require('./lib/personnel.js');
const { sauvegarder } = require('./historique.js');

const MODELE = path.join(__dirname, '..', 'modeles', 'lexique.md');
const MODELE_GLOSSAIRE = path.join(__dirname, '..', 'modeles', 'glossaire.md');
const EST_EN_TETE = /^\|\s*Terme\s*\|/;
const LEXIQUE = { modele: MODELE, enTete: '| Terme | En une phrase | Comme… | Vu le | Statut |', separateur: '|---|---|---|---|---|', colonnes: 5 };
const GLOSSAIRE = { modele: MODELE_GLOSSAIRE, enTete: '| Terme | Sens | À éviter | Prononciation |', separateur: '|---|---|---|---|', colonnes: 4 };

const cheminLexique = () => path.join(dossierPersonnel(), 'lexique.md');
const cheminGlossaire = (dossier) => path.join(path.resolve(dossier), 'charte', 'glossaire.md');
const cellule = (t) => String(t ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim();
const cleTri = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Rangées du tableau (cellules) et sa position dans les lignes. */
function lireTableau(lignes, colonnes) {
  const i = lignes.findIndex((l) => EST_EN_TETE.test(l));
  if (i < 0) return { debut: -1, fin: -1, rangees: [] };
  const rangees = [];
  let j = i + 2;
  for (; j < lignes.length && lignes[j].startsWith('|'); j++) {
    // Une barre échappée (« \| ») fait partie du texte ; une rangée corrigée à la main sans barre finale
    // ou au mauvais nombre de cellules est gardée telle quelle (brut), jamais réécrite.
    const morceaux = lignes[j].trimEnd().split(/(?<!\\)\|/);
    const complete = morceaux.length >= 2 && morceaux[morceaux.length - 1] === '';
    const cellules = morceaux.slice(1, complete ? -1 : undefined).map((c) => c.trim());
    const valide = complete && cellules.length === colonnes;
    while (cellules.length < colonnes) cellules.push('');
    rangees.push(Object.assign(cellules, { brut: lignes[j], valide }));
  }
  return { debut: i, fin: j, rangees };
}

const lireFichier = (fichier, sorte) => (fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : fs.readFileSync(sorte.modele, 'utf8'));

/** Ajoute une rangée (triée par première cellule, sans doublon casse et accents ignorés) ; écriture atomique. */
function ajouterRangee(fichier, sorte, cellules) {
  let lignes = lireFichier(fichier, sorte).split(/\r?\n/);
  let tableau = lireTableau(lignes, sorte.colonnes);
  if (tableau.debut < 0) {
    while (lignes.length && lignes[lignes.length - 1].trim() === '') lignes.pop();
    lignes = [...lignes, '', sorte.enTete, sorte.separateur, ''];
    tableau = lireTableau(lignes, sorte.colonnes);
  }
  if (tableau.rangees.some((r) => cleTri(r[0]) === cleTri(cellules[0]))) return { ajoute: false, fichier };
  const nouvelle = Object.assign(cellules.map(cellule), { valide: true });
  const toutes = [...tableau.rangees, nouvelle].sort((a, b) => cleTri(a[0]).localeCompare(cleTri(b[0]), 'fr'));
  const ecrire = (r) => (r.brut !== undefined ? r.brut : `| ${r.join(' | ')} |`);
  const resultat = [...lignes.slice(0, tableau.debut + 2), ...toutes.map(ecrire), ...lignes.slice(tableau.fin)].join('\n');
  try {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    const temporaire = `${fichier}.${process.pid}.tmp`;
    fs.writeFileSync(temporaire, resultat);
    fs.renameSync(temporaire, fichier);
  } catch (e) {
    throw new Error(`Impossible d'écrire « ${fichier} » (${e.code || e.message}) : vérifiez les droits de ce dossier, ou indiquez un autre dossier avec la variable PULSE_MOTION_DOSSIER.`);
  }
  return { ajoute: true, fichier };
}

function lireLexique() {
  const fichier = cheminLexique();
  const texte = lireFichier(fichier, LEXIQUE);
  const termes = lireTableau(texte.split(/\r?\n/), 5).rangees.map(([terme, phrase, comme, vuLe, statut]) => ({ terme, phrase, comme, vuLe, statut }));
  return { fichier, texte, termes };
}

function noterLexique({ terme, phrase, comme = '', commande = '', date = new Date().toISOString().slice(0, 10) }) {
  if (!terme || !String(terme).trim() || !phrase || !String(phrase).trim()) {
    throw new Error('Il faut au moins un terme et une phrase d\'explication.');
  }
  return ajouterRangee(cheminLexique(), LEXIQUE, [terme, phrase, comme, commande ? `${date} · ${commande}` : date, 'vu']);
}

function lireGlossaire(dossier) {
  const fichier = cheminGlossaire(dossier);
  const texte = lireFichier(fichier, GLOSSAIRE);
  const termes = lireTableau(texte.split(/\r?\n/), 4).rangees.filter((r) => r[0]).map(([terme, sens, eviter, prononciation]) => ({
    terme, sens, eviter: eviter.split(',').map((f) => f.trim()).filter(Boolean), prononciation,
  }));
  return { fichier, texte, termes };
}

/** sauvegarde : copie du projet avant l'ajout (« annule » le défait) ; false quand l'appelant a déjà sauvegardé. */
function noterGlossaire({ dossier, terme, sens, eviter = '', prononciation = '', sauvegarde = true }) {
  if (!terme || !String(terme).trim() || !sens || !String(sens).trim()) throw new Error('Il faut au moins un terme et son sens.');
  const dejaNote = lireGlossaire(dossier).termes.some((t) => cleTri(t.terme) === cleTri(cellule(terme)));
  if (dejaNote) return { ajoute: false, fichier: cheminGlossaire(dossier) };
  if (sauvegarde && fs.existsSync(path.join(path.resolve(dossier), 'deroule.json'))) sauvegarder(dossier);
  return ajouterRangee(cheminGlossaire(dossier), GLOSSAIRE, [terme, sens, eviter, prononciation]);
}

const echapperRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motEntier = (mot, drapeaux) => new RegExp(`(?<![\\p{L}\\p{N}])${echapperRegex(mot).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, drapeaux);

/** Formes à éviter et sigles ou noms propres mal écrits dans les textes des scènes (alertes). */
function verifierGlossaire(scenes, termes) {
  const problemes = [];
  for (const s of scenes) {
    for (const [cle, texte] of Object.entries(s.textes || {})) {
      if (typeof texte !== 'string') continue;
      for (const t of termes) {
        for (const forme of t.eviter) {
          const m = motEntier(forme, 'iu').exec(texte);
          if (m && m[0] !== t.terme) problemes.push({ regle: 'glossaire', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} », texte « ${cle} » : « ${m[0]} » est à éviter (glossaire) ; écrire « ${t.terme} ».` });
        }
        // La casse ne compte que pour un terme qui porte une majuscule (sigle, nom propre).
        if (t.terme === t.terme.toLowerCase()) continue;
        for (const m of texte.matchAll(motEntier(t.terme, 'giu'))) {
          // Une occurrence tout en capitales (titre écrit en majuscules) n'est pas une faute de casse.
          const capitales = m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase();
          if (m[0] !== t.terme && !capitales && !t.eviter.some((f) => f.toLowerCase() === m[0].toLowerCase())) {
            problemes.push({ regle: 'glossaire', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} », texte « ${cle} » : « ${m[0]} » s'écrit « ${t.terme} » (glossaire).` });
          }
        }
      }
    }
  }
  return problemes;
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
    if (quoi === 'glossaire' && action && action !== 'noter') {
      process.stdout.write(lireGlossaire(action).texte);
      process.exit(0);
    }
    if (quoi === 'glossaire' && action === 'noter') {
      const [dossier, terme, sens, eviter, prononciation] = args;
      console.log(JSON.stringify(noterGlossaire({ dossier: dossier || '.', terme, sens, eviter, prononciation }), null, 2));
      process.exit(0);
    }
    console.error('Usage : pulse-motion lexique [noter "<terme>" "<phrase>" "<comme…>" "<commande>"] | glossaire <dossier> | glossaire noter <dossier> "<terme>" "<sens>" ["<à éviter>"] ["<prononciation>"]');
    process.exit(2);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { cheminLexique, lireLexique, noterLexique, lireGlossaire, noterGlossaire, verifierGlossaire };
