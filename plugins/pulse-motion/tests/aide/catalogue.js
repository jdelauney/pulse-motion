'use strict';
/* Projet d'essai : les 8 scènes toutes faites du style clair-pedagogique, textes à leur longueur maximale. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STYLE = path.join(__dirname, '..', '..', 'styles', 'clair-pedagogique');
const CATALOGUE = JSON.parse(fs.readFileSync(path.join(STYLE, 'catalogue.json'), 'utf8'));
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

function projetCatalogue() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-catalogue-'));
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5"/></svg>');
  const scenes = CATALOGUE.scenes.map((s, i) => {
    fs.copyFileSync(path.join(STYLE, 'scenes', `${s.nom}.html`), path.join(dir, 'scenes', `${s.nom}.html`));
    const textes = {};
    Object.entries(s.textes).forEach(([cle, max], k) => { textes[cle] = cle === 'numero' ? '12' : texteDeLongueur(max, i + k); });
    return { id: s.nom, fichier: `scenes/${s.nom}.html`, duree: s.duree, textes, transition: CATALOGUE.transitions[i % 3] };
  });
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({
    version: 1, titre: 'Catalogue', genre: 'formation', parcours: 'rapide',
    format: { ratio: '16:9', ips: 30 }, style: 'clair-pedagogique', charte: { logo: 'assets/logo.svg' }, scenes,
  }, null, 2));
  return dir;
}

module.exports = { STYLE, CATALOGUE, texteDeLongueur, projetCatalogue };
