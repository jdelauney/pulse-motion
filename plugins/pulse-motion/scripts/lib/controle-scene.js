'use strict';
/* Pulse Motion – règles statiques d'une seule scène, communes au contrôle (controler.js, controlesRapides) et au crochet
 * qui contrôle chaque scène écrite (scripts/controle-scene.js, spec Rapidité 5.11).
 *
 * controlerCSS(css, scene, ou, problemes)    texte-petit, police-non-embarquee, effet-export
 * controlerLettres(decoupes, scene, problemes) lettres-invalide
 * sonConnu(nom), problemeSonInconnu(scene, nom) son-inconnu
 * controlerScene({ projet, deroule, scene, html }) -> problemes : toutes les règles d'une scène lisibles sans assembler la
 *   vidéo : section, textes manquants, minutage (data-start, data-dur, ancres), CSS, lettres, sons, ressources sur internet,
 *   ancres des effets, milieux et shaders. Mêmes règles et mêmes messages que le contrôle.
 */
const fs = require('node:fs');
const path = require('node:path');
const SEUILS = require('../seuils.json');
const CATALOGUE = require('../../moteur/synthe/catalogue.js');
const { EFFETS: EFFETS_LETTRES } = require('../../moteur/lettres.js');

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

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

function controlerLettres(decoupes, scene, problemes) {
  for (const { attribut, effet } of decoupes) {
    if (!Object.hasOwn(EFFETS_LETTRES, effet)) {
      problemes.push({ regle: 'lettres-invalide', gravite: 'erreur', scene, message: `Scène « ${scene} » : ${attribut} « ${effet} » inconnu (effets : ${Object.keys(EFFETS_LETTRES).join(', ')}).` });
    } else if (effet === 'brouille' && attribut === 'data-mots') {
      problemes.push({ regle: 'lettres-invalide', gravite: 'erreur', scene, message: `Scène « ${scene} » : data-mots « brouille » : le texte se brouille lettre par lettre, écrire data-lettres="brouille".` });
    }
  }
}

/** Un bruitage de la bibliothèque, ou un fichier (chemin). */
const sonConnu = (nom) => CATALOGUE.BRUITAGES.includes(nom) || /[/.]/.test(nom);
const problemeSonInconnu = (scene, nom) => ({ regle: 'son-inconnu', gravite: 'erreur', scene, message: `Scène « ${scene} » : le son « ${nom} » n'existe pas (sons : ${CATALOGUE.BRUITAGES.join(', ')} ; ou un fichier assets/…).` });

const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/** data-ancre des effets, milieux et shaders qui ne désigne aucun élément de la scène (même règle que leur préparation). */
function ancresIntrouvables(html, scene, lireAttributs) {
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const balises = [...source.matchAll(BALISE)].map((m) => lireAttributs(m[2]));
  const ids = new Set(balises.filter((a) => a.id).map((a) => a.id));
  const problemes = [];
  for (const a of balises) {
    if (a['data-ancre'] === undefined || !('data-effet' in a || 'data-milieu' in a || 'data-shader' in a)) continue;
    const m = /^#([A-Za-z0-9_-]+)$/.exec(a['data-ancre'].trim());
    if (!m || !ids.has(m[1])) {
      problemes.push({ regle: 'ancre-introuvable', gravite: 'erreur', scene, ...(a.id ? { element: a.id } : {}), message: `Scène « ${scene} » : data-ancre « ${a['data-ancre']} » ne désigne aucun élément de la scène (forme attendue : #id).` });
    }
  }
  return problemes;
}

/** Toutes les règles statiques d'une scène (crochet). Chargement paresseux : le crochet doit rester rapide. */
function controlerScene({ projet, deroule, scene, html }) {
  const S = require('./scenes.js');
  const { extraireScene, lireAttributs } = require('./extraire.js');
  const { deplierGroupes } = require('./groupes-personnages.js');
  const { dureeTemps, optionsMinutage } = require('./deroule.js');
  const { ressourcesDistantes } = require('./embarquer.js');
  const { lireVoixScene } = require('./voix.js');
  const { calculerMinutage, DEBUT_VOIX, DUREE_TRANSITION_SHADER } = require('../../moteur/minutage.js');
  const problemes = [];
  html = String(html).replace(/^﻿/, '');
  const invalide = S.verifierSection(html, scene.id);
  if (invalide) return [{ regle: 'scene-invalide', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : ${invalide}` }];
  if (/data-groupe/.test(html)) {
    const deplie = deplierGroupes(html, { scene: scene.id, dureeTemps: dureeTemps(deroule) });
    html = deplie.html;
    problemes.push(...deplie.erreurs);
  }
  const { html: sansScripts } = S.extraireScripts(html);
  for (const cle of S.injecterTextes(sansScripts, scene.textes, scene.ajustements).manquants) {
    problemes.push({ regle: 'texte-manquant', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : data-texte="${cle}" n'a pas de texte dans le déroulé.` });
  }
  const lue = extraireScene(html);
  // Minutage de la scène seule, avec sa voix (ancres « mot: ») comme dans la page.
  let voix = null;
  try {
    const v = lireVoixScene(projet, deroule, scene);
    if (v && !v.erreur) voix = { debut: scene.voix.debut ?? DEBUT_VOIX, duree: v.duree, mots: v.mots };
  } catch { /* voix illisible : signalée par le contrôle de la vidéo */ }
  const donnee = { id: scene.id, duree: scene.duree, rythme: scene.rythme || 1,
    transition: scene.transition && typeof scene.transition === 'object' ? { shader: scene.transition.shader, duree: scene.transition.duree > 0 ? scene.transition.duree : DUREE_TRANSITION_SHADER } : (scene.transition || 'aucune'),
    ...(voix ? { voix } : {}) };
  for (const e of calculerMinutage([donnee], { [scene.id]: lue.elements }, optionsMinutage(deroule)).erreurs) problemes.push({ ...e, gravite: 'erreur' });
  for (const e of lue.elements.filter((x) => x.son !== undefined && !sonConnu(x.son))) problemes.push(problemeSonInconnu(scene.id, e.son));
  controlerCSS(lue.css, scene.id, `Scène « ${scene.id} »`, problemes);
  controlerLettres(lue.decoupes, scene.id, problemes);
  for (const e of ressourcesDistantes(html, `scène « ${scene.id} »`)) problemes.push({ ...e, scene: scene.id });
  problemes.push(...ancresIntrouvables(html, scene.id, lireAttributs));
  return problemes;
}

/** Fichier écrit -> { projet, deroule, scene } s'il est une scène (scenes/NN-<id>.html) d'un projet, sinon null. */
function sceneDuFichier(fichier) {
  if (!fichier || !/\.html?$/i.test(fichier)) return null;
  const absolu = path.resolve(fichier);
  // Sous Windows, la casse d'un chemin ne compte pas (« e:\ » ou « E:\ » selon l'outil qui écrit).
  const meme = (x) => (process.platform === 'win32' ? x.toLowerCase() : x);
  if (meme(path.basename(path.dirname(absolu))) !== 'scenes') return null;
  const projet = path.dirname(path.dirname(absolu));
  const fichierDeroule = path.join(projet, 'deroule.json');
  if (!fs.existsSync(fichierDeroule)) return null;
  const { lireDeroule } = require('./deroule.js');
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length || !deroule || !Array.isArray(deroule.scenes)) return null;
  const scene = deroule.scenes.find((s) => typeof s.fichier === 'string' && meme(path.resolve(projet, s.fichier)) === meme(absolu));
  return scene ? { projet, deroule, scene } : null;
}

module.exports = { controlerCSS, controlerLettres, sonConnu, problemeSonInconnu, ancresIntrouvables, controlerScene, sceneDuFichier };
