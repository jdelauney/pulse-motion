'use strict';
/* Pulse Motion – projet d'essai d'un style : ses scènes toutes faites, textes à leur longueur maximale
 * (pire cas) ou phrases d'exemple.
 * Sert au banc d'essai des styles livrés et à « pulse-motion style verifier » ou « style planche ». */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MOTS = ['température', 'conserver', 'chaîne', 'froid', 'produit', 'hygiène', 'réfrigérateur', 'contrôle', 'étiquette', 'livraison', 'sécurité', 'bactéries'];

/** Texte français réaliste, aussi long que possible sans dépasser n caractères. */
function texteDeLongueur(n, decalage = 0) {
  if (n <= 3) return '°C%'.slice(0, n);
  let t = '';
  for (let i = decalage; ; i++) {
    const suivant = t ? `${t} ${MOTS[i % MOTS.length]}` : MOTS[i % MOTS.length];
    if (suivant.length > n) break;
    t = suivant;
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Contenu témoin (« chaîne du froid », references/styles/temoin.json) : phrases d'exemple par texte, de la plus longue à la
// plus courte (la première qui tient est retenue), phrase de repli, images A et B, boucle. Source unique : la planche des
// styles, la page de choix et la galerie du wiki le lisent aussi.
const TEMOIN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'references', 'styles', 'temoin.json'), 'utf8'));
const EXEMPLES = TEMOIN.textes;
const PHRASE = TEMOIN.phrase;

/** Vraie phrase d'exemple pour ce texte, sans dépasser n caractères (coupée à un mot si besoin). */
function texteExemple(cle, n) {
  const tient = (EXEMPLES[cle] || []).find((t) => t.length <= n);
  if (tient) return tient;
  if (n <= 3) return '°C'.slice(0, n);
  let t = '';
  for (const mot of PHRASE.split(' ')) {
    const suivant = t ? `${t} ${mot}` : mot;
    if (suivant.length > n) break;
    t = suivant;
  }
  return t.replace(/[,]$/, '') || PHRASE.slice(0, n);
}

/** Fixe la valeur d'arrivée du premier compteur (« nombre 0→1250 ») d'une scène ; scène sans compteur : inchangée. */
function avecValeur(html, valeur) {
  if (valeur === undefined || valeur === null) return html;
  return html.replace(/(data-tween="[^"]*nombre\s+-?[\d.]+\s*→\s*)-?[\d.]+/, (m, debut) => `${debut}${valeur}`);
}

/** -> dossier temporaire d'un projet aux scènes toutes faites du style (toutes, ou celles de `types`).
 * textes : 'maximum' (chaque texte à sa longueur maximale, le pire cas) ou 'exemple' (vraies phrases).
 * valeurChiffre : valeur d'arrivée du compteur de la scène « chiffre » (témoin : 1 250) ; dureeScene : durée de chaque
 * scène (boucle du témoin), sinon celle du catalogue. */
function projetEssai({ dossierStyle, ratio = '16:9', ton, types = null, textes: sorteTextes = 'maximum', valeurChiffre, dureeScene }) {
  const style = path.basename(dossierStyle);
  const catalogue = JSON.parse(fs.readFileSync(path.join(dossierStyle, 'catalogue.json'), 'utf8'));
  const choisies = types ? types.map((t) => catalogue.scenes.find((s) => s.nom === t)).filter(Boolean) : catalogue.scenes;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pm-essai-${style}-`));
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5"/></svg>', 'utf8');
  const scenes = choisies.map((s, i) => {
    const textes = {};
    Object.entries(s.textes).forEach(([cle, max], k) => {
      if (sorteTextes === 'exemple') textes[cle] = texteExemple(cle, max);
      else textes[cle] = cle === 'numero' ? '12' : texteDeLongueur(max, i + k);
    });
    // Le chiffre d'un compteur s'écrit dans l'intention, comme le demande la doctrine (realisation § 3, règle chiffre-invente).
    const html = avecValeur(fs.readFileSync(path.join(dossierStyle, 'scenes', `${s.nom}.html`), 'utf8'), s.nom === 'chiffre' ? valeurChiffre : undefined);
    fs.writeFileSync(path.join(dir, 'scenes', `${s.nom}.html`), html, 'utf8');
    const chiffres = [...html.matchAll(/nombre\s+-?[\d.]+\s*→\s*(-?[\d.]+)/g)].map((m) => m[1].replace('.', ','));
    const intention = `${s.nom} – ${s.role}${chiffres.length ? ` (${chiffres.join(', ')})` : ''}`;
    return { id: s.nom, type: s.nom, fichier: `scenes/${s.nom}.html`, duree: dureeScene || s.duree, textes, intention, transition: catalogue.transitions[i % catalogue.transitions.length] };
  });
  const charte = { logo: 'assets/logo.svg' };
  if (ton) charte.ton = ton;
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({
    version: 1, titre: `Essai ${style}`, genre: 'formation', parcours: 'rapide', format: { ratio, ips: 30 }, style, charte, scenes,
  }, null, 2), 'utf8');
  return dir;
}

module.exports = { texteDeLongueur, texteExemple, projetEssai, avecValeur, TEMOIN };
