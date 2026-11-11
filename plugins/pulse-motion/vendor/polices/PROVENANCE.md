# Polices du code et des formules

- `JetBrainsMono-400.woff2` : JetBrains Mono 400, jeu latin, copie du fichier déjà livré avec le style `tech-sombre` (Bunny Fonts, 2026-10-12).
- `LibertinusMath-Regular.woff2` : Libertinus Math, police entière, téléchargée à la main par le mainteneur le 2026-11-10 depuis Google Fonts (adresse et empreinte dans `LICENCES.md`). Préférée à STIX Two Math (403 344 octets contre 337 536) : spec S7, 5.10, choix sur le poids.
- Licence : SIL Open Font License 1.1 (texte complet dans `LICENCES.md`).
- Usage : `scripts/lib/donnees-scene.js` les embarque en `@font-face` (URL data:) dans la page, seulement si une scène a du code ou une formule. Aucune n'est lue sur internet.
