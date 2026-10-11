'use strict';
/* Pulse Motion – charte finale d'une vidéo : défaut → style → charte du projet (charte/) → réglages du déroulé ;
 * ton (clair ou sombre) et couleurs dérivées lisibles. Les chemins de charte/charte.json sont relatifs à charte/. */
const fs = require('node:fs');
const path = require('node:path');
const { contraste, luminance, ajusterContraste, meilleurSur } = require('./couleurs.js');
const { validerCharte } = require('./deroule.js');
const SEUILS = require('../seuils.json');

const CHARTE_DEFAUT = {
  couleurs: { primaire: '#0a6cff', accent: '#b45309', fond: '#ffffff', texte: '#1a1a1a' },
  polices: { titres: 'system-ui', texte: 'system-ui' },
};
const HEX = /^#[0-9a-fA-F]{6}$/;

function lireJSON(fichier, defaut) {
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '')); } catch { return defaut; }
}

/** charte/charte.json du projet : -> { charte, erreurs } (charte vide si absente ou invalide). */
function charteDuProjet(projet) {
  const fichier = path.join(projet, 'charte', 'charte.json');
  if (!fs.existsSync(fichier)) return { charte: {}, erreurs: [] };
  let brut;
  try { brut = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '')); } catch (e) {
    return { charte: {}, erreurs: [`charte/charte.json n'est pas un JSON valide (${e.message}).`] };
  }
  const erreurs = validerCharte(brut, 'charte/charte.json');
  return erreurs.length ? { charte: {}, erreurs: erreurs.map((m) => `${m} Corrigez charte/charte.json.`) } : { charte: brut, erreurs: [] };
}

const versProjet = (polices = {}) => Object.fromEntries(Object.entries(polices).map(([role, v]) => [role, v && typeof v === 'object' ? { ...v, fichier: `charte/${v.fichier}` } : v]));

function chartePour(deroule, dossierStyle, projet) {
  const duStyle = lireJSON(path.join(dossierStyle, 'charte.json'), {});
  const { charte: duProjet, erreurs } = projet ? charteDuProjet(projet) : { charte: {}, erreurs: [] };
  const ponctuel = deroule.charte || {};
  return {
    couleurs: { ...CHARTE_DEFAUT.couleurs, ...duStyle.couleurs, ...duProjet.couleurs, ...ponctuel.couleurs },
    polices: { ...CHARTE_DEFAUT.polices, ...duStyle.polices, ...versProjet(duProjet.polices), ...ponctuel.polices },
    logo: ponctuel.logo || (duProjet.logo ? `charte/${duProjet.logo}` : null),
    ton: ponctuel.ton || duProjet.ton || 'auto',
    fondImpose: Boolean((duProjet.couleurs && duProjet.couleurs.fond) || (ponctuel.couleurs && ponctuel.couleurs.fond)),
    erreurs,
  };
}

/** Ton retenu parmi ceux du style, et les couleurs de fond et de texte qui vont avec. */
function appliquerTon(charte, identite) {
  const c = (identite && identite.couleur) || {};
  const tons = Array.isArray(c.tons) && c.tons.length ? c.tons : ['clair'];
  const defaut = tons.includes(c.tonDefaut) ? c.tonDefaut : tons[0];
  const sombre = c.sombre || {};
  const couleursPour = (ton) => (ton === 'sombre' && !charte.fondImpose && sombre.fond
    ? { ...charte.couleurs, fond: sombre.fond, texte: sombre.texte || charte.couleurs.texte }
    : charte.couleurs);
  let ton = defaut;
  if (charte.fondImpose && HEX.test(charte.couleurs.fond || '')) {
    // Fond choisi par la personne : le ton est celui de ce fond, pour que le style s'y accorde.
    const voulu = luminance(charte.couleurs.fond) < 0.18 ? 'sombre' : 'clair';
    ton = tons.includes(voulu) ? voulu : defaut;
  } else if (tons.includes(charte.ton)) ton = charte.ton;
  else if (charte.ton === 'auto' && tons.length > 1) {
    const score = (t) => {
      const k = couleursPour(t);
      return HEX.test(k.primaire) && HEX.test(k.accent) && HEX.test(k.fond) ? Math.min(contraste(k.primaire, k.fond), contraste(k.accent, k.fond)) : 0;
    };
    const autre = tons.find((t) => t !== defaut);
    if (score(autre) > score(defaut)) ton = autre;
  }
  return { ton, couleurs: couleursPour(ton) };
}

/** Charte prête pour la page et les contrôles. */
function charteFinale(deroule, dossierStyle, projet) {
  const brute = chartePour(deroule, dossierStyle, projet);
  const identite = lireJSON(path.join(dossierStyle, 'identite.json'), null);
  const { ton, couleurs } = appliquerTon(brute, identite);
  return { couleurs, polices: brute.polices, logo: brute.logo, ton, erreurs: brute.erreurs };
}

/** Couleurs ajustées au fond et couleur du texte posé dessus, en variables CSS. */
function variablesDerivees(couleurs) {
  const lignes = [];
  if (!HEX.test(couleurs.fond || '')) return lignes;
  for (const [nom, minimum] of [['primaire', SEUILS.contrasteTitres], ['accent', SEUILS.contrasteTexte]]) {
    if (!HEX.test(couleurs[nom] || '')) continue;
    lignes.push(`  --c-${nom}-lisible: ${ajusterContraste(couleurs[nom], couleurs.fond, minimum).hex};`);
    lignes.push(`  --c-sur-${nom}: ${meilleurSur(couleurs[nom])};`);
  }
  return lignes;
}

module.exports = { CHARTE_DEFAUT, chartePour, appliquerTon, charteFinale, variablesDerivees };
