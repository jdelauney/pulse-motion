'use strict';
/* Plafonds des consignes (octets), une seule source pour tous les tests qui les vérifient (budget-consignes de plugin.test.js,
 * et les tests de dessin, donnees, icones, motifs, son-style, vie-decor qui recopiaient ceux de creer et retoucher).
 * État 0.28.0 + 10 % ; animateur 6 000 o. Chaque relèvement se justifie ici, en une ligne.
 *
 * 0.33.0 (S10-A et S2-2) : creer +1 700 o (visuels d'un produit, directions, recettes de rythme, regarder avant de montrer,
 * ligne 🔎), retoucher +1 300 o (lignes Revue et Format, regarder, ligne 🔎), exporter +700 o (sorties, ligne 🔎) ; la section
 * « fabrication » de creer reste sous 7 000 o (consignes-a-la-carte.test.js).
 * 0.34.0 (S2-3 et S2-4) : creer +300 o, retoucher +200 o, exporter +100 o (relecture : trois renvois d'une ligne, la conduite
 * vit dans realisation § 13 et revue.md, lus à la demande). critique.md : corps ≤ 3 500 o.
 * 0.40.0 (S4 R1, 5.6) : outils 6 144 → 6 550 o (plan d'installation en un accord, installation de Node.js).
 * 0.51.0 (S6 plan 2) : filmer, la 13e compétence (plafond 7 800 o).
 * 0.52.0 (S6 plans 3 et 4) : filmer 7 800 → 11 500 o (accord réseau, connexion, confidentialité et import).
 * 0.64.0 (S4 R5 et R4) : renvois d'une ligne à la référence chez-soi : exporter 6 600 → 6 780 o, outils 6 550 → 6 850 o,
 * reprendre 2 999 → 3 150 o, style 6 460 → 6 550 o ; creer et retoucher tenus.
 * 0.65.0 (chantier H, bibliothèque personnelle) : renvois d'une ligne à chez-soi, « Bibliothèque personnelle » : retoucher
 * 13 850 → 13 950 o (« garde cet effet »), outils 6 850 → 7 200 o (description et étape « Emporter sa bibliothèque »),
 * dessiner-personnage 4 528 → 4 650 o et animer-personnage 5 884 → 6 050 o (proposer de garder, en fin de travail).
 * 0.67.0 (S9-1 et S9-2, langue de la vidéo et déclinaisons) : renvois d'une ligne à la référence langues : creer 23 400 → 23 520 o
 * (langue déduite de la demande), retoucher 13 950 → 14 210 o (ligne « Langue, déclinaison »), voix 5 073 → 5 200 o (langue de
 * l'enregistrement), reprendre 3 150 → 3 180 o (déclinaisons et origine) ; animateur tenu sous 6 000 o (langue des textes dans la règle « aucun texte en dur »).
 * 0.68.0 (S9-3 et S9-4, typographie, karaoké, QR, Ken Burns, 2,5D) : retoucher 14 210 → 14 430 o (karaoké, QR code et photos
 * dans les exemples, renvoi d'une ligne à la référence briques) ; animateur tenu (le dictionnaire porte les recettes).
 * 0.69.0 (S9-5, imiter une animation) : retoucher 14 430 → 14 800 o (ligne « Imiter » : fichier déposé, niveau, planches, fiche,
 * comparaison, interdits de copie ; la méthode vit dans la référence imiter), creer 23 520 → 23 620 o (renvoi d'une ligne).
 * 0.70.0 (S9-6 et S9-7, cartes et Lottie) : retoucher 14 800 → 15 000 o (deux phrases d'exemple dans « Visuel d'une scène » et
 * deux renvois aux références cartes et lottie ; description inchangée).
 * 0.71.0 (S9-8, musiques et images) : creer 23 620 → 23 780 o (« Votre musique » proposée d'abord, depuis la bibliothèque),
 * voix 5 200 → 5 350 o (ligne « garde cette musique »), exporter 6 780 → 6 810 o (« les images une par une pour mon monteur » ;
 * la conduite vit dans la référence sorties) ; retoucher tenu ; descriptions inchangées.
 */
const PLAFONDS = {
  'skills/animer-personnage/SKILL.md': 6050, 'skills/atelier-particules/SKILL.md': 2272, 'skills/atelier-personnages/SKILL.md': 3529,
  'skills/creer/SKILL.md': 23780, 'skills/decouper-personnage/SKILL.md': 4020, 'skills/dessiner-personnage/SKILL.md': 4650,
  'skills/exporter/SKILL.md': 6810, 'skills/filmer/SKILL.md': 11500, 'skills/outils/SKILL.md': 7200, 'skills/reprendre/SKILL.md': 3180,
  'skills/retoucher/SKILL.md': 15000, 'skills/style/SKILL.md': 6550, 'skills/voix/SKILL.md': 5350,
  'agents/animateur.md': 6000, 'agents/critique.md': 3800,
};

/** Plafond d'une compétence (nom du dossier) ou d'un agent (« agents/animateur.md »). */
const plafond = (nom) => PLAFONDS[nom.includes('/') ? nom : `skills/${nom}/SKILL.md`];

module.exports = { PLAFONDS, plafond };
