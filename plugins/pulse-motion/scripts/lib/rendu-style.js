'use strict';
/* Pulse Motion – rendu d'un style dans le navigateur (Chrome ou Edge sans fenêtre), au maximum de texte :
 * polices chargées, aucun débordement, chevauchement, texte hors des marges ou des zones sûres (mesures du
 * contrôle de la vidéo rendue), aucune erreur du moteur, en 16:9, 1:1, 4:5 et 9:16, et dans chaque ton. */
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../assembler.js');
const { trouverNavigateur } = require('./navigateur.js');
const { mesurerPage, ouvrirPageControle } = require('./page-mesures.js');
const { projetEssai } = require('./projet-essai.js');
const { traduireConstats, flashsParCDP } = require('./rendu-controle.js');
const SEUILS = require('../seuils.json');

const FORMATS = ['16:9', '1:1', '4:5', '9:16'];
const PARALLELES = 2;
const SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);
const lireJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };

// La zone des boutons (9:16) se juge sur des phrases d'exemple : au texte maximal, une liste de 4 points
// ne peut pas tenir au-dessus de la légende des réseaux à une taille lisible.
const ZONE = 'zone-sure';

/**
 * Mesures d'un essai : la page de contrôle par le protocole DevTools quand les flashs sont mesurés (captures réduites menées
 * depuis Node, lib/flashs.js, comme le contrôle d'une vidéo), sinon la page qui renvoie son résultat (sans flashs).
 * -> { resultat } | { erreur }
 */
async function mesurerEssai({ html, navigateur, delai, script, flashs }) {
  if (!flashs) return mesurerPage({ html, navigateur, delai, script });
  let controle;
  try {
    controle = await ouvrirPageControle({ html, navigateur, delai });
  } catch (e) {
    return { erreur: e.message || String(e) };
  }
  const minuteur = new Promise((resoudre) => { const m = setTimeout(() => resoudre({ erreur: 'délai dépassé' }), delai); if (m.unref) m.unref(); });
  try {
    return await Promise.race([minuteur, (async () => {
      const { page } = controle;
      const erreur = await page.evaluer('window.__pmErreur === undefined ? null : window.__pmErreur');
      if (erreur !== null) return { erreur };
      const resultat = await page.evaluer(`(async function () {${script}\n})()`);
      const flash = (await flashsParCDP(page)).filter((c) => c.regle === 'flash');
      resultat.constats = resultat.constats.concat(flash);
      return { resultat };
    })()]);
  } catch (e) {
    return { erreur: e.message || String(e) };
  } finally {
    await controle.fermer();
  }
}

/**
 * textes : 'maximum' (toutes les règles sauf la zone des boutons) ou 'exemple' (la zone des boutons seule).
 * flashs : mesurés seulement pour les essais en 16:9 (un par ton) ; la lumière d'un style change de la même façon dans les
 * autres formats, que l'essai mesure sans eux (jusqu'à 950 captures de la page entière pour un catalogue de 74 s).
 */
async function rendreUnEssai({ dossierStyle, ratio, ton, navigateur, dossierStyles, textes = 'maximum', delai = 120000, flashs = false }) {
  const dir = projetEssai({ dossierStyle, ratio, ton, textes });
  try {
    const { html, erreurs } = assembler({ dossier: dir, dossierStyles, ecrire: false });
    if (!html) return erreurs.map((e) => e.message);
    const familles = [...new Set(Object.values(lireJSON(path.join(dossierStyle, 'charte.json')).polices || {}).filter((f) => typeof f === 'string' && !SYSTEME.has(f)))];
    const r = await mesurerEssai({ html, navigateur, delai, flashs, script: `
      var chargees = []; document.fonts.forEach(function (f) { if (f.status === 'loaded') chargees.push(f.family.replace(/["']/g, '')); });
      var constats = M.mesurer({ ratio: ${JSON.stringify(ratio)}, seuils: ${JSON.stringify(SEUILS)} });
      var debordements = M.detecterDebordements().map(function (d) { return d.message; });
      constats = constats.concat(await M.mesurerPixels({ ratio: ${JSON.stringify(ratio)}, seuils: ${JSON.stringify(SEUILS)}, flashs: false }));
      return { constats: constats, debordements: debordements, erreurs: M.erreurs.map(function (e) { return e.message || String(e); }),
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

/** -> { ok: true | false | null, problemes, message? } ; ok null : navigateur absent, rendu non vérifié.
 *  delai : ms par page (120 s par défaut ; plus pour les tests, lancés à côté d'autres navigateurs). */
async function verifierRendu({ dossierStyle, navigateur = trouverNavigateur(), dossierStyles, delai }) {
  if (!navigateur) return { ok: null, problemes: [], message: 'Chrome ou Edge introuvable : le rendu (débordements, polices) n\'a pas été vérifié. Installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.' };
  const tons = ((lireJSON(path.join(dossierStyle, 'identite.json')).couleur || {}).tons) || ['clair'];
  // Flashs : dans chaque ton, en 16:9 (le 16:9 du ton par défaut, ou chaque ton nommé quand le style en a plusieurs).
  const avecTons = tons.length > 1;
  const essais = [...FORMATS.map((ratio) => ({ ratio, flashs: ratio === '16:9' && !avecTons })), ...(avecTons ? tons.map((ton) => ({ ratio: '16:9', ton, flashs: true })) : []), { ratio: '9:16', textes: 'exemple' }];
  // Deux navigateurs à la fois au plus (tous ensemble, ils se disputaient la machine et dépassaient leur délai).
  const resultats = new Array(essais.length);
  let suivant = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLELES, essais.length) }, async () => {
    while (suivant < essais.length) {
      const i = suivant++;
      resultats[i] = await rendreUnEssai({ dossierStyle, navigateur, dossierStyles, delai, ...essais[i] });
    }
  }));
  const problemes = resultats.flatMap((liste, i) => liste.map((m) => `${essais[i].ratio}${essais[i].ton ? ` (ton ${essais[i].ton})` : ''}${essais[i].textes ? ' (phrases d\'exemple)' : ''} : ${m}`));
  return { ok: problemes.length === 0, problemes };
}

module.exports = { verifierRendu, FORMATS };
