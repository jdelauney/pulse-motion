# Mouvement vivant

Ce qui fait qu'une scène paraît vivante plutôt que mécanique : à lire quand la scène a un personnage, ou un décor à faire vivre (plante, flamme, machine, ciel, eau). Les chiffres viennent de la méthode de rossark-motion-skill et de take-one.

## L'essentiel

1. Rien ne se téléporte : tout ce qui change de place ou de forme y va par un mouvement.
2. Calme par défaut : pas de rebond, sauf si la personne le demande.
3. Petites amplitudes : dans le doute, diviser par deux.
4. Tout tourne autour d'un pivot : régler `transform-origin` (le pied d'une plante, la base d'une flamme, l'axe d'une roue).
5. Les bouts arrivent après la base : de 60 à 150 ms plus tard (la tête après le corps, la main après le bras, la feuille après la tige).
6. Variété sans chaos : deux éléments semblables ne bougent jamais ensemble (départs décalés), et jamais de hasard tiré à chaque image.
7. Une action principale par scène, et deux ou trois boucles discrètes autour.
8. L'opacité sert seulement à apparaître ou à disparaître.
9. La mise en page ne bouge jamais : on anime des transformations, pas des marges ni des tailles de boîte.
10. Au moins 100 ms par mouvement, soit 3 images à 30 images par seconde : en dessous, il scintille.
11. Ce qui revient souvent (bandeau, logo, sous-titres) bouge peu ; le moment rare reçoit l'enchantement.
12. Finir sur une image stable.

## Courbes

- Déplacer : `quart-inout`.
- Ouvrir, arriver : `quint-out`.
- Partir, tomber : `circle-in`.
- Boucle mécanique (roue, engrenage, tapis) : `linear`.
- Jamais d'accélération (`-in`) sur ce qu'on attend de voir arriver.
- Une sortie plus rapide que l'entrée.

## Le décor qui vit

- Pluie, neige, feu en volume, étincelles : les effets de particules (`pulse-motion reference particules`).
- Plante, flamme, vapeur, nuage : une boucle petite et lente, sur un élément intérieur (pas celui qui porte l'entrée), qui tient toute la scène et finit au repos. Les boucles de vie du dictionnaire (catégorie « vie ») sont à venir ; en attendant, un mouvement répété existant (`pulse-motion mouvements`), ampleur réduite, départs décalés d'un élément à l'autre.

## Les personnages

Ce que le moteur fait seul, pour tout personnage :
- **clignement** : fermer en 110 ms, tenir 40 ms, rouvrir en 190 ms, toutes les 3 à 4 s à des instants irréguliers propres à chaque personnage (deux voisins ne clignent pas ensemble), parfois deux fois de suite, et à chaque tournant (`tourner`, `regarder` une cible, demi-tour d'une marche). Rythme par expression : tristesse plus rare et plus lente (4 à 5,5 s), colère plus rare (5 à 6,5 s), peur plus fréquente (2 à 3 s), surprise (2,5 à 3,5 s) ;
- **respiration**, même dans une pose tenue (à moitié pendant un geste), chaque personnage à sa phase ;
- **repos vivant** : dans une pose tenue ou au repos, bras, avant-bras, tête, torse et genou bougent de 1 à 4 degrés, chacun à son rythme (3 s, 4,5 s ou 9 s), jamais en miroir ; rien pendant une marche ou une course ;
- **retard** : avant-bras et tête arrivent 0,1 s après le bras et le corps, la touffe après la tête, sans rebond ;
- **les yeux d'abord** : en `regarder`, les pupilles arrivent 0,1 s avant la tête ;
- **ombre** au sol, qui rétrécit quand il s'élève (jusqu'à 35 % de sa taille) ;
- **atterrissage** : à la fin d'un `bondir`, il s'étire de 6 % juste avant le contact, s'écrase de 12 % (8 % au contact déclaré d'un saut joué), puis revient en un seul dépassement, en gardant son volume.

Réglages :
- `data-vie` sur le conteneur : `pleine` (par défaut), `sobre` (clignement et respiration seulement), `aucune` (immobile exprès ; `data-calme="non"` vaut `aucune`) ;
- `data-ombre="non"` : sans ombre ;
- `data-ecrase` (de 0 à 0,25 ; 0 = sans) sur le conteneur ou sur un `bondir` ;
- `"lissage": "continu"` dans un mouvement (`personnages/clips/`) : ses poses s'enchaînent sans s'arrêter à chaque clé.

Ce que l'animateur décide :
- une action principale ;
- `regarder` au moment où quelque chose arrive (le clignement suit) ;
- un objet entre hors champ déjà en mouvement ;
- un objet tenu qui tombe ou est posé (`data-lacher`) plutôt qu'un objet qui disparaît ;
- `glisser` pour être emporté, `bondir` pour changer de hauteur ;
- gauche et droite jamais en miroir ;
- en 9:16, le personnage aussi grand que possible, les pieds dans le bas de l'image.

## Une scène qui raconte une action

- Temps forts chaînés par `#id:fin`, avec un léger chevauchement (`data-start="#a:fin-0.1"`).
- L'image finale est tenue.
- Jamais d'image vide entre deux scènes.

## Interface à l'écran

- Appui sur un bouton : de 100 à 160 ms ; info-bulle : de 125 à 200 ms ; menu : de 150 à 250 ms ; panneau : de 200 à 500 ms.
- Une carte entre depuis 0,9 à 0,97 de sa taille (#004 avec `--pm-ampleur: 0.95`), jamais depuis 0 (#001 est réservé aux petites icônes).

## Avant de dire que c'est vivant

- [ ] Rien de figé à l'écran.
- [ ] Aucun instant où tout s'arrête.
- [ ] La tête et les bouts des membres arrivent après le corps.
- [ ] Gauche et droite ne sont pas en miroir.
- [ ] Au moins un clignement sur un tournant.
- [ ] Les atterrissages sont écrasés.
- [ ] En l'air, l'ombre change de taille.
- [ ] Les objets entrent en mouvement, et les yeux les suivent.
- [ ] Une planche regardée (`pulse-motion planche . <id>`).
