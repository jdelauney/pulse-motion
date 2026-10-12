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

// Phrases d'exemple par texte, de la plus longue à la plus courte : la première qui tient est retenue.
const EXEMPLES = {
  etiquette: ['Chaîne du froid', 'Hygiène'],
  titre: ['Garder la chaîne du froid', 'Le froid, sans rupture'],
  sous: ['Les bons gestes, du camion au réfrigérateur', 'Les bons gestes, de bout en bout'],
  point1: ['Vérifier la température à la livraison', 'Contrôler chaque livraison'],
  point2: ['Ranger les produits frais en premier', 'Ranger le frais en premier'],
  point3: ['Respecter les dates sur les étiquettes', 'Respecter les dates'],
  point4: ['Ne jamais recongeler un produit', 'Ne jamais recongeler'],
  unite: ['°C'],
  legende: ['Température maximale d\'un réfrigérateur', 'Au plus, dans le réfrigérateur'],
  'gauche-titre': ['Avant'],
  'gauche-texte': ['Produits rangés au hasard, porte souvent ouverte', 'Produits rangés au hasard'],
  'droite-titre': ['Après'],
  'droite-texte': ['Produits datés, rangés par zone de froid', 'Produits datés et rangés'],
  numero: ['2'],
  texte: ['Un produit resté trop longtemps hors du froid ne doit pas y retourner.', 'Un produit sorti du froid n\'y retourne pas.'],
  a: ['Réception'],
  b: ['Stockage'],
  c: ['Préparation'],
};
const PHRASE = 'Garder les produits au froid, du camion jusqu\'à l\'assiette, sans jamais rompre la chaîne';

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

/** -> dossier temporaire d'un projet aux scènes toutes faites du style (toutes, ou celles de `types`).
 * textes : 'maximum' (chaque texte à sa longueur maximale, le pire cas) ou 'exemple' (vraies phrases). */
function projetEssai({ dossierStyle, ratio = '16:9', ton, types = null, textes: sorteTextes = 'maximum' }) {
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
    Object.entries(s.textes).forEach(([cle, max], k) => {
      if (sorteTextes === 'exemple') textes[cle] = texteExemple(cle, max);
      else textes[cle] = cle === 'numero' ? '12' : texteDeLongueur(max, i + k);
    });
    return { id: s.nom, type: s.nom, fichier: `scenes/${s.nom}.html`, duree: s.duree, textes, transition: catalogue.transitions[i % catalogue.transitions.length] };
  });
  const charte = { logo: 'assets/logo.svg' };
  if (ton) charte.ton = ton;
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({
    version: 1, titre: `Essai ${style}`, genre: 'formation', parcours: 'rapide', format: { ratio, ips: 30 }, style, charte, scenes,
  }, null, 2));
  return dir;
}

module.exports = { texteDeLongueur, texteExemple, projetEssai };
