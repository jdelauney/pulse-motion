# Lucide

- Bibliothèque : icônes Lucide, paquet `lucide-static` 1.71.0 (https://lucide.dev, https://github.com/lucide-icons/lucide), 2 046 icônes et 304 noms anciens ou de rechange (alias).
- Licence : ISC (© 2026 Lucide Icons and Contributors), avec une partie sous licence MIT pour les icônes dérivées de Feather (© 2013-present Cole Bemis) : texte complet dans `LICENSE` ci-joint.
- Source : https://registry.npmjs.org/lucide-static/-/lucide-static-1.71.0.tgz, téléchargé à la main par le mainteneur le 2026-11-10 (`npm pack lucide-static@1.71.0`), empreinte sha256 du paquet : `c53ba25989d0893250e1cb0a949e4ec04a4d9ed92bcc3f68246b2e1e31b78815`.
- Conversion : `node outils/icones/preparer.js <dossier du paquet décompressé>` (outil du dépôt, hors du plugin installé ; adapté de `scripts/build-icons.mjs` d'explainroo, MIT). Les dessins ne sont pas modifiés : cercles, ellipses, rectangles, lignes, polylignes et polygones sont réécrits en chemins `d` équivalents dans la boîte 24 × 24 ; un point plein (`fill="currentColor"`) est noté `{ d, plein: true }`.
- Fichiers : `icones.json` (`{ version, icones: { nom: [chemin] }, alias: { ancien: nom } }`), `etiquettes.json` (étiquettes anglaises de Lucide, `tags.json`), `LICENSE` (fichier `LICENSE` du paquet, sans modification).
- Usage : lu par `scripts/lib/icones.js` à l'assemblage (`<svg data-icone="nom">`) et par `pulse-motion icones` ; seules les icônes utilisées entrent dans la page livrée, en SVG en ligne.
- Mots-clés français : `references/icones-fr.json`, écrits pour Pulse Motion.
