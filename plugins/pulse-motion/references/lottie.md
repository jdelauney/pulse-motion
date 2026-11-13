# Animations Lottie

## L'essentiel

- La personne fournit l'animation (`.json` ou archive `.lottie`, de LottieFiles ou de son graphiste). Le plugin n'en livre aucune et n'en cherche jamais en ligne : jamais d'adresse, jamais de téléchargement.
- **Importer** : `pulse-motion lottie importer <fichier> --nom fusee --source "<d'où il vient>" --licence "<licence>" .` La copie va dans `assets/lottie/fusee.json` ; la source et la licence vont dans les crédits. Sans elles, demander à la personne d'où vient le fichier et sa licence (LottieFiles : « Lottie Simple License » le plus souvent), puis `pulse-motion credits . noter assets/lottie/fusee.json "<source>" "<licence>"`.
- Le rapport d'import donne la durée, la cadence, la taille, les couleurs trouvées et les avertissements : les dire à la personne en mots (« certaines parties ne bougeront pas »).
- L'animation est **calculée image par image** depuis le temps de la vidéo (jamais jouée) : l'aperçu, l'export rapide et l'export fidèle montrent la même image au même instant.

## Poser l'animation

```html
<div class="fusee" data-lottie="assets/lottie/fusee.json" data-start="0.5" data-lottie-vitesse="1" data-lottie-boucle="non"
     data-lottie-couleurs="#ff5a00=primaire,#222222=texte" style="width: 40cqh; height: 40cqh"></div>
```

- Taille en `cqh` sur l'élément ; l'animation s'y ajuste sans se déformer.
- `data-start` : l'animation part de sa première image à cet instant (avant : sa première image). `data-lottie-vitesse` : 1 par défaut (0,5 deux fois plus lente). `data-lottie-boucle="oui"` : elle recommence ; sinon elle s'arrête sur sa dernière image.
- `data-lottie-couleurs` : chaque couleur de l'animation (à 8 près sur 255 par composante) prend une couleur de la charte par son nom (`primaire`, `accent`, `texte`, `fond`…) ou un `#rrggbb`. La recoloration se fait à l'assemblage ; le fichier de `assets/lottie/` ne change jamais. Les couleurs à remplacer sont dans le rapport d'import.
- Entrée, sortie, caméra : comme tout élément (classes du style, mouvements nommés).

## Ce que le lecteur dessine

Calques de formes, solides, images incluses dans le fichier, précompositions, parents, masques, caches, images clés et trajectoires courbes, tracés tronqués, dégradés. Ne sont pas dessinés : les textes de l'animation (les écrire dans la scène, avec les polices de la vidéo), les expressions (ces parties restent immobiles), le répéteur, les coins arrondis, la fusion de tracés, les effets de calque, les modes de fusion, les calques 3D. Toujours regarder les planches après la pose.

## Ce que le contrôle signale

- `lottie-image-externe` (erreur) : une image de l'animation n'est pas dans le fichier ; demander le fichier aux images incluses, ou l'archive `.lottie`.
- `lottie-lourd` : alerte au-delà de 500 Ko, erreur au-delà de 2 Mo.
- `lottie-expressions`, `lottie-texte`, `lottie-non-pris` (alertes) : des parties ne bougeront pas ou ne s'afficheront pas.
- `lottie-trop-court` (alerte) : l'animation finit plus de 2 s avant la fin de la scène sans boucler.
- `lottie-invalide` (erreur) : fichier illisible, vitesse, boucle ou couleurs mal écrites.
