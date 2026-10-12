'use strict';
/* Pulse Motion – rendu d'un style dans le navigateur (Chrome ou Edge sans fenêtre), au maximum de texte :
 * polices chargées, aucun débordement, chevauchement, texte hors des marges ou des zones sûres (mesures du
 * contrôle de la vidéo rendue), aucune erreur du moteur, en 16:9, 1:1, 4:5 et 9:16, et dans chaque ton. */
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../assembler.js');
const { trouverNavigateur } = require('./navigateur.js');
const { mesurerPage } = require('./page-mesures.js');
const { projetEssai } = require('./projet-essai.js');
const { traduireConstats } = require('./rendu-controle.js');
const SEUILS = require('../seuils.json');

const FORMATS = ['16:9', '1:1', '4:5', '9:16'];
const SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);
const lireJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };

// La zone des boutons (9:16) se juge sur des phrases d'exemple : au texte maximal, une liste de 4 points
// ne peut pas tenir au-dessus de la légende des réseaux à une taille lisible.
const ZONE = 'zone-sure';

/** textes : 'maximum' (toutes les règles sauf la zone des boutons) ou 'exemple' (la zone des boutons seule). */
async function rendreUnEssai({ dossierStyle, ratio, ton, navigateur, dossierStyles, textes = 'maximum' }) {
  const dir = projetEssai({ dossierStyle, ratio, ton, textes });
  try {
    const { html, erreurs } = assembler({ dossier: dir, dossierStyles, ecrire: false });
    if (!html) return erreurs.map((e) => e.message);
    const familles = [...new Set(Object.values(lireJSON(path.join(dossierStyle, 'charte.json')).polices || {}).filter((f) => typeof f === 'string' && !SYSTEME.has(f)))];
    const r = await mesurerPage({ html, navigateur, delai: 120000, script: `
      var chargees = []; document.fonts.forEach(function (f) { if (f.status === 'loaded') chargees.push(f.family.replace(/["']/g, '')); });
      return { constats: M.mesurer({ ratio: ${JSON.stringify(ratio)}, seuils: ${JSON.stringify(SEUILS)} }), debordements: M.detecterDebordements().map(function (d) { return d.message; }), erreurs: M.erreurs.map(function (e) { return e.message || String(e); }),
        polices: ${JSON.stringify(familles)}.filter(function (f) { return chargees.indexOf(f) < 0; }) };` });
    if (r.erreur) return [`le navigateur n'a pas pu afficher la page (${r.erreur})`];
    const resultat = r.resultat;
    const constats = traduireConstats(resultat.constats).filter((p) => (textes === 'exemple') === (p.regle === ZONE)).map((p) => p.message);
    if (textes === 'exemple') return constats;
    return [...erreurs.map((e) => e.message), ...resultat.erreurs, ...resultat.debordements, ...constats, ...resultat.polices.map((f) => `police « ${f} » non chargée`)];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** -> { ok: true | false | null, problemes, message? } ; ok null : navigateur absent, rendu non vérifié. */
async function verifierRendu({ dossierStyle, navigateur = trouverNavigateur(), dossierStyles }) {
  if (!navigateur) return { ok: null, problemes: [], message: 'Chrome ou Edge introuvable : le rendu (débordements, polices) n\'a pas été vérifié. Installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.' };
  const tons = ((lireJSON(path.join(dossierStyle, 'identite.json')).couleur || {}).tons) || ['clair'];
  const essais = [...FORMATS.map((ratio) => ({ ratio })), ...(tons.length > 1 ? tons.map((ton) => ({ ratio: '16:9', ton })) : []), { ratio: '9:16', textes: 'exemple' }];
  const resultats = await Promise.all(essais.map((e) => rendreUnEssai({ dossierStyle, navigateur, dossierStyles, ...e })));
  const problemes = resultats.flatMap((liste, i) => liste.map((m) => `${essais[i].ratio}${essais[i].ton ? ` (ton ${essais[i].ton})` : ''}${essais[i].textes ? ' (phrases d\'exemple)' : ''} : ${m}`));
  return { ok: problemes.length === 0, problemes };
}

module.exports = { verifierRendu, FORMATS };
