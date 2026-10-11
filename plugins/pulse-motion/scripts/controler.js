#!/usr/bin/env node
'use strict';
/* Pulse Motion – contrôles automatiques d'un projet vidéo, sans navigateur.
 *
 *   node scripts/controler.js <dossier-du-projet>
 *
 * Écrit sortie/controle.json : [{ regle, gravite: "erreur" | "alerte", scene?, element?, message }].
 * Reprend les erreurs de l'assemblage (polices, fichiers…) et le rapport de débordement
 * envoyé par la page d'aperçu (sortie/controle-page.json).
 * Affiche un résumé JSON { erreurs, alertes, fichier } ; code de sortie 1 s'il reste une erreur.
 */
const fs = require('node:fs');
const path = require('node:path');
const { assembler, chartePour } = require('./assembler.js');
const { trouverStyle } = require('./styles.js');
const { lireDeroule } = require('./lib/deroule.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const { extraireScene } = require('./lib/extraire.js');
const { calculerMinutage, CHEVAUCHEMENT } = require('../moteur/minutage.js');

const SEUILS = JSON.parse(fs.readFileSync(path.join(__dirname, 'seuils.json'), 'utf8'));

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

const { contraste } = require('./lib/couleurs.js');

const compterMots = (texte) => (String(texte).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

/** Intervalles [a,b] de [debut,fin] non couverts par les intervalles donnés. */
function trous(debut, fin, intervalles) {
  const tries = intervalles.filter(([a, b]) => b > debut && a < fin).sort((x, y) => x[0] - y[0]);
  const resultat = [];
  let curseur = debut;
  for (const [a, b] of tries) {
    if (a > curseur) resultat.push([curseur, a]);
    curseur = Math.max(curseur, b);
  }
  if (curseur < fin) resultat.push([curseur, fin]);
  return resultat;
}

const EFFETS = [
  [/filter\s*:[^;}]*url\(/i, 'filter: url(…)'],
  [/mix-blend-mode\s*:/i, 'mix-blend-mode'],
  [/backdrop-filter\s*:/i, 'backdrop-filter'],
];

const FAMILLES_PERMISES = /^(inherit|initial|unset|system-ui|sans-serif|serif|monospace|var\(--f-[a-z0-9-]+\))$/i;

function controlerCSS(cssBrut, scene, ou, problemes) {
  const css = cssBrut.replace(/\/\*[\s\S]*?\*\//g, '');
  // Taille du texte : font-size, ou la propriété raccourcie font (« 700 5cqh/1.2 … »).
  const tailles = /font(?:-size\s*:\s*|\s*:[^;}]*?\s)(\d*\.?\d+)cqh/gi;
  let m;
  while ((m = tailles.exec(css))) {
    const valeur = parseFloat(m[1]);
    if (valeur < SEUILS.texteMinCqh) {
      problemes.push({ regle: 'texte-petit', gravite: 'alerte', scene, message: `${ou} : texte de ${virgule(valeur)} cqh, trop petit pour être lu (minimum ${virgule(SEUILS.texteMinCqh)} cqh).` });
    }
  }
  // Polices : seules celles de la charte (variables --f-…) sont embarquées.
  const familles = /font-family\s*:\s*([^;}]+)|font\s*:[^;}]*?(["'][^"']+["'][^;}]*)/gi;
  while ((m = familles.exec(css))) {
    const valeur = (m[1] || m[2]).trim();
    const nonEmbarquees = valeur.split(',').map((f) => f.trim()).filter((f) => f && !FAMILLES_PERMISES.test(f));
    if (nonEmbarquees.length) {
      problemes.push({ regle: 'police-non-embarquee', gravite: 'erreur', scene, message: `${ou} : la police « ${valeur} » n'est pas embarquée ; utiliser var(--f-titres) ou var(--f-texte) (polices de la charte).` });
    }
  }
  for (const [motif, nom] of EFFETS) {
    if (motif.test(css)) {
      problemes.push({ regle: 'effet-export', gravite: 'alerte', scene, message: `${ou} : l'effet ${nom} ne passera pas à l'export rapide (MP4 dans le navigateur).` });
    }
  }
}

/**
 * controler({ dossier, dossierStyles?: string | string[], ecrire? })
 * -> { problemes: [...], fichier: chemin de controle.json | null }
 */
function controler({ dossier, dossierStyles, ecrire = true }) {
  const projet = path.resolve(dossier);
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  const problemes = assemblage.erreurs.map((e) => ({ ...e }));
  const { deroule } = lireDeroule(projet);

  if (assemblage.ok) {
    const dossierStyle = trouverStyle(deroule.style, dossierStyles).dossier;
    const scenesLues = {};
    const elementsParScene = {};
    for (const s of deroule.scenes) {
      const fichier = cheminDansProjet(projet, s.fichier);
      let html = '';
      try { html = fs.readFileSync(fichier, 'utf8'); } catch { /* déjà signalé par l'assemblage */ }
      scenesLues[s.id] = extraireScene(html);
      elementsParScene[s.id] = scenesLues[s.id].elements;
    }
    const min = calculerMinutage(deroule.scenes, elementsParScene);
    for (const e of min.erreurs) problemes.push({ ...e, gravite: 'erreur' });

    // Temps morts : aucun élément en mouvement pendant plus que le seuil (pause finale exceptée).
    const derniere = min.scenes[min.scenes.length - 1];
    min.scenes.forEach((s, i) => {
      const dureeEntree = s.entree > 0 ? s.entree : (i === 0 && s.transition !== 'aucune' ? CHEVAUCHEMENT : 0);
      const intervalles = Object.values(min.elements[s.id]).map((e) => [e.debut, e.fin]);
      if (dureeEntree) intervalles.push([s.debut, s.debut + dureeEntree]);
      const suivante = min.scenes[i + 1];
      if (suivante && suivante.entree > 0) intervalles.push([suivante.debut, s.fin]);
      let morceaux = trous(s.debut, s.fin, intervalles);
      if (s === derniere) morceaux = morceaux.filter(([, b]) => b < s.fin);
      for (const [a, b] of morceaux) {
        if (b - a > SEUILS.tempsMort) {
          problemes.push({ regle: 'temps-mort', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : rien ne bouge pendant ${virgule(b - a)} s (de ${virgule(a)} s à ${virgule(b)} s). Au-delà de ${virgule(SEUILS.tempsMort)} s, l'attention décroche.` });
        }
      }
    });

    // Pause finale.
    const fins = Object.values(min.elements[derniere.id]).map((e) => e.fin);
    const pause = derniere.fin - Math.max(derniere.debut, ...fins);
    if (pause < SEUILS.pauseFinale) {
      problemes.push({ regle: 'pause-finale', gravite: 'alerte', scene: derniere.id, message: `La vidéo s'arrête ${virgule(pause)} s après le dernier mouvement : laisser au moins ${virgule(SEUILS.pauseFinale)} s pour finir sur une image stable.` });
    }

    // Temps de lecture et CSS des scènes.
    for (const s of deroule.scenes) {
      const mots = Object.values(s.textes).reduce((n, t) => n + compterMots(t), 0);
      const besoin = SEUILS.lectureBase + SEUILS.lectureParMot * mots;
      const disponible = s.duree / (s.rythme || 1);
      if (mots && disponible < besoin) {
        problemes.push({ regle: 'lecture', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : ${mots} mots à lire en ${virgule(disponible)} s ; prévoir au moins ${virgule(besoin)} s.` });
      }
      controlerCSS(scenesLues[s.id].css, s.id, `Scène « ${s.id} »`, problemes);
    }

    // Style : tailles de texte et effets.
    try { controlerCSS(fs.readFileSync(path.join(dossierStyle, 'style.css'), 'utf8'), undefined, `Style « ${deroule.style} »`, problemes); } catch { /* style vérifié par l'assemblage */ }

    // Contraste de la charte.
    const { couleurs } = chartePour(deroule, dossierStyle);
    const paires = [
      ['texte', SEUILS.contrasteTexte, 'le texte'],
      ['primaire', SEUILS.contrasteTitres, 'les titres'],
      ['accent', SEUILS.contrasteTexte, 'les étiquettes'],
    ];
    for (const [nom, minimum, quoi] of paires) {
      if (couleurs[nom] && couleurs.fond) {
        const c = contraste(couleurs[nom], couleurs.fond);
        if (c < minimum) {
          problemes.push({ regle: 'contraste', gravite: 'alerte', message: `Charte : ${quoi} (${couleurs[nom]}) sur le fond (${couleurs.fond}) n'a qu'un contraste de ${virgule(c)}:1 ; il faut au moins ${virgule(minimum)}:1 pour être lu facilement.` });
        }
      }
    }
  }

  // Débordements relevés par la page d'aperçu.
  try {
    const page = JSON.parse(fs.readFileSync(path.join(projet, 'sortie', 'controle-page.json'), 'utf8'));
    for (const d of page.debordements || []) problemes.push({ regle: 'debordement', gravite: 'erreur', scene: d.scene, element: d.element, message: d.message });
  } catch { /* aucun rapport de la page */ }

  let fichier = null;
  if (ecrire) {
    fs.mkdirSync(path.join(projet, 'sortie'), { recursive: true });
    fichier = path.join(projet, 'sortie', 'controle.json');
    fs.writeFileSync(fichier, JSON.stringify(problemes, null, 2));
  }
  return { problemes, fichier };
}

if (require.main === module) {
  const dossier = process.argv[2];
  if (!dossier) {
    console.error('Usage : node scripts/controler.js <dossier-du-projet>');
    process.exit(2);
  }
  const { problemes, fichier } = controler({ dossier });
  const erreurs = problemes.filter((p) => p.gravite === 'erreur').length;
  console.log(JSON.stringify({ erreurs, alertes: problemes.length - erreurs, fichier }, null, 2));
  process.exit(erreurs ? 1 : 0);
}

module.exports = { controler, contraste, compterMots, trous, SEUILS };
