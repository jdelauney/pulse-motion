'use strict';
/* Pulse Motion – projet d'essai d'un style : ses scènes toutes faites, textes à leur longueur maximale.
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

/** -> dossier temporaire d'un projet aux scènes toutes faites du style (toutes, ou celles de `types`). */
function projetEssai({ dossierStyle, ratio = '16:9', ton, types = null }) {
  const style = path.basename(dossierStyle);
  const catalogue = JSON.parse(fs.readFileSync(path.join(dossierStyle, 'catalogue.json'), 'utf8'));
  const choisies = types ? types.map((t) => catalogue.scenes.find((s) => s.nom === t)).filter(Boolean) : catalogue.scenes;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pm-essai-${style}-`));
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5"/></svg>');
  const scenes = choisies.map((s, i) => {
    fs.copyFileSync(path.join(dossierStyle, 'scenes', `${s.nom}.html`), path.join(dir, 'scenes', `${s.nom}.html`));
    const textes = {};
    Object.entries(s.textes).forEach(([cle, max], k) => { textes[cle] = cle === 'numero' ? '12' : texteDeLongueur(max, i + k); });
    return { id: s.nom, type: s.nom, fichier: `scenes/${s.nom}.html`, duree: s.duree, textes, transition: catalogue.transitions[i % catalogue.transitions.length] };
  });
  const charte = { logo: 'assets/logo.svg' };
  if (ton) charte.ton = ton;
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({
    version: 1, titre: `Essai ${style}`, genre: 'formation', parcours: 'rapide', format: { ratio, ips: 30 }, style, charte, scenes,
  }, null, 2));
  return dir;
}

module.exports = { texteDeLongueur, projetEssai };
